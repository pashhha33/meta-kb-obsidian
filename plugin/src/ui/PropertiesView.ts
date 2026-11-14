import { Events, ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";

import {
	FieldGroup,
	enumValueLabel,
	parseCanonicalLink,
	relationDef,
} from "../labels";
import type { ResolvedField } from "../labels";
import { formatDatetime } from "../settings";
import {
	computeAuthorSheets,
	computeCharCount,
	isSignificantChange,
} from "../core/derived";
import { buildForm } from "../core/form";
import type { FormModel, FormRow } from "../core/form";
import { suggestLinks } from "../core/suggest";
import type { SuggestCandidate } from "../core/suggest";
import { decideAttachment } from "../core/attachment";
import { thumbnailAspectRatio } from "../core/thumbnails";
import { FieldRow } from "./FieldRow";
import { openFieldModal } from "./modals/FieldModal";
import { ImageFilePickerModal } from "./modals/ImageFilePickerModal";

import type { MetaKBPluginAPI } from "../plugin-types";

export const VIEW_TYPE_META_KB_PROPERTIES = "meta-kb-properties";

/** Порядок и подписи секций — DESIGN.md §7.10. */
const SECTION_ORDER: FieldGroup[] = ["system", "schema", "relations", "computed"];
const SECTION_TITLES: Record<FieldGroup, string> = {
	system: "Системные",
	schema: "Свойства",
	relations: "Отношения",
	computed: "Вычисляемые",
};

interface FrontmatterMap {
	[key: string]: unknown;
}

/**
 * View «Meta KB Properties» — форма свойств активного файла.
 *
 * ITER-2026-11-14-0: форма строится по эффективной схеме типа
 * (`core/form.ts` → `effectiveSchema`), поэтому видны и те поля, которых в
 * frontmatter ещё нет: их можно заполнить. Поля field-expansion появляются
 * сразу после выбора триггера (occupation → office/party). Вычисляемые
 * (`char-count`, `author-sheets`) считаются из тела заметки, не хранятся.
 */
export class MetaKBPropertiesView extends ItemView {
	private readonly plugin: MetaKBPluginAPI;
	private renderTimer: number | null = null;
	private lastFile: TFile | null = null;
	/** Защита от гонок: устаревший async-render не должен рисовать. */
	private renderSeq = 0;

	constructor(leaf: WorkspaceLeaf, plugin: MetaKBPluginAPI) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_META_KB_PROPERTIES;
	}

	getDisplayText(): string {
		return "Meta KB Properties";
	}

	override getIcon(): string {
		return "table-properties";
	}

	protected override async onOpen(): Promise<void> {
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.scheduleRender()),
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => this.scheduleRender()),
		);
		this.registerEvent(
			this.app.workspace.on("layout-change", () => this.scheduleRender()),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file: TFile) => {
				if (file === this.lastFile) {
					this.scheduleRender();
				}
			}),
		);
		const events: Events = this.app.workspace;
		this.registerEvent(
			events.on("meta-kb:settings-changed", () => this.scheduleRender()),
		);
		void this.render();
	}

	protected override async onClose(): Promise<void> {
		this.cancelScheduledRender();
	}

	private cancelScheduledRender(): void {
		if (this.renderTimer !== null) {
			window.clearTimeout(this.renderTimer);
			this.renderTimer = null;
		}
	}

	private scheduleRender(): void {
		this.cancelScheduledRender();
		this.renderTimer = window.setTimeout(() => {
			this.renderTimer = null;
			void this.render();
		}, 100);
	}

	private async render(): Promise<void> {
		const seq = ++this.renderSeq;
		const root = this.contentEl;
		root.empty();
		root.addClass("meta-kb-properties");

		const file = this.app.workspace.getActiveFile();
		this.lastFile = file;

		if (!file || file.extension !== "md") {
			root.createEl("div", {
				cls: "meta-kb-empty",
				text: "Откройте markdown-заметку, чтобы увидеть её свойства.",
			});
			return;
		}

		// Битый frontmatter не должен ломать виджет (требование 6 среза 1).
		let frontmatter: FrontmatterMap | undefined;
		try {
			frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		} catch (err) {
			console.warn("Meta KB: не удалось прочитать кэш метаданных", err);
			frontmatter = undefined;
		}

		const header = root.createEl("div", { cls: "meta-kb-file-header" });
		header.createEl("div", { cls: "meta-kb-file-name", text: file.basename });

		if (!frontmatter || typeof frontmatter !== "object") {
			root.createEl("div", {
				cls: "meta-kb-empty",
				text: "У заметки нет frontmatter (или YAML повреждён). Свойства не показаны.",
			});
			return;
		}

		const typeRaw =
			typeof frontmatter["type"] === "string"
				? (frontmatter["type"] as string)
				: "";
		const form = buildForm(typeRaw, frontmatter);

		if (typeRaw) {
			const chip = header.createEl("span", {
				cls: "meta-kb-type-chip",
				text: typeRaw,
			});
			chip.setAttribute(
				"title",
				form.typeValue
					? `type: ${typeRaw}`
					: `type: ${typeRaw} — тип не описан в метамодели`,
			);
		}
		if (form.total > 0) {
			header.createEl("span", {
				cls: "meta-kb-form-progress",
				text: `${form.filled}/${form.total}`,
			});
			header.lastElementChild?.setAttribute(
				"title",
				"Заполнено полей эффективной формы",
			);
		}

		const computed = await this.computedValues(file, form);
		if (seq !== this.renderSeq) {
			return; // отрисован более новый кадр
		}

		try {
			this.renderSections(root, file, form, computed);
		} catch (err) {
			console.error("Meta KB: ошибка отрисовки виджета", err);
			root.createEl("div", {
				cls: "meta-kb-empty",
				text: "Не удалось отобразить свойства. Подробности в консоли.",
			});
		}
	}

	/** Живые значения вычисляемых полей из тела заметки (в frontmatter не пишем). */
	private async computedValues(
		file: TFile,
		form: FormModel,
	): Promise<Record<string, unknown>> {
		const keys = form.computed.map((row) => row.field.key);
		if (keys.length === 0) {
			return {};
		}
		let body = "";
		try {
			body = await this.app.vault.cachedRead(file);
		} catch (err) {
			console.warn("Meta KB: не удалось прочитать тело заметки", err);
		}
		const values: Record<string, unknown> = {};
		if (keys.includes("char-count")) {
			values["char-count"] = computeCharCount(body);
		}
		if (keys.includes("author-sheets")) {
			const charCount =
				typeof values["char-count"] === "number"
					? (values["char-count"] as number)
					: 0;
			values["author-sheets"] = computeAuthorSheets(
				charCount,
				this.plugin.settings.authorSheetChars,
			);
		}
		return values;
	}

	private renderSections(
		root: HTMLElement,
		file: TFile,
		form: FormModel,
		computed: Record<string, unknown>,
	): void {
		for (const group of SECTION_ORDER) {
			const rows = form[group];
			if (rows.length === 0) {
				continue;
			}
			this.renderSection(root, group, rows, file, computed);
		}
	}

	private renderSection(
		root: HTMLElement,
		group: FieldGroup,
		rows: FormRow[],
		file: TFile,
		computed: Record<string, unknown>,
	): void {
		const section = root.createEl("div", {
			cls: `meta-kb-section meta-kb-section-${group}`,
		});
		// Системная секция свёрнута по умолчанию (DESIGN.md §7.10).
		if (group === "system") {
			section.addClass("is-collapsed");
		}

		const headerEl = section.createEl("div", { cls: "meta-kb-section-header" });
		headerEl.createEl("span", {
			cls: "meta-kb-section-title",
			text: SECTION_TITLES[group],
		});
		headerEl.createEl("span", {
			cls: "meta-kb-section-count",
			text: String(rows.length),
		});
		headerEl.addEventListener("click", () => {
			section.toggleClass("is-collapsed", !section.hasClass("is-collapsed"));
		});

		const body = section.createEl("div", { cls: "meta-kb-section-body" });
		for (const row of rows) {
			this.renderFieldRow(body, row, file, computed[row.field.key]);
		}
	}

	private renderFieldRow(
		container: HTMLElement,
		row: FormRow,
		file: TFile,
		computedValue: unknown,
	): void {
		const field = row.field;
		const isComputed = field.group === "computed";
		const rawValue =
			isComputed && computedValue !== undefined ? computedValue : row.value;

		new FieldRow(
			container,
			{
				key: field.key,
				label: field.label,
				valueType: field.valueType,
				value: rawValue,
				readOnly: field.readOnly,
				// Пустая строка формы — не данные, а приглашение заполнить.
				absent: !row.present && !field.readOnly,
				formatDatetime: (iso) => formatDatetime(iso, this.plugin.settings),
				enumValueLabelFn: (raw) => enumValueLabel(field.key, raw),
			},
			{
				onEdit: () => this.openFieldEditor(field, rawValue, file),
				onBooleanToggle: (next) => {
					if (next) {
						void this.writeFieldValue(file, field.key, true);
					} else if (this.plugin.settings.booleanWriteFalse) {
						void this.writeFieldValue(file, field.key, false);
					} else {
						void this.writeFieldValue(file, field.key, undefined);
					}
				},
				onOpenLink: (raw) => this.openLinkTarget(raw, file),
			},
		);
	}

	private openFieldEditor(
		field: ResolvedField,
		rawValue: unknown,
		file: TFile,
	): void {
		// `attachment` — путь к файлу: вместо ручного текста даём выбор из
		// хранилища (C-IMG-04) с проверкой «один файл → одна обёртка» (C-IMG-05).
		if (field.key === "attachment") {
			this.openAttachmentPicker(field, rawValue, file);
			return;
		}

		const valueType = field.valueType;
		const isMedia = valueType === "media" || valueType === "list<media>";
		const targetTypes = isMedia
			? ["image"]
			: (relationDef(field.key)?.target_type ?? null);
		const registry = this.plugin.getRegistry();

		openFieldModal(this.app, {
			key: field.key,
			label: field.label,
			valueType,
			currentValue: rawValue,
			enumValues: field.enumValues,
			suggest: (query: string): SuggestCandidate[] =>
				suggestLinks(registry.all(), query, { targetTypes }),
			onApply: (value) => this.writeFieldValue(file, field.key, value),
		});
	}

	/**
	 * Выбор файла-вложения из хранилища (C-IMG-04): галерея миниатюр + путь.
	 * Свой собственный путь разрешён, чужой — блокируется (C-IMG-05).
	 */
	private openAttachmentPicker(
		field: ResolvedField,
		rawValue: unknown,
		file: TFile,
	): void {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const ownerId =
			frontmatter && typeof frontmatter["id"] === "string"
				? (frontmatter["id"] as string)
				: null;

		new ImageFilePickerModal(this.app, {
			mode: "pick-attachment",
			imagePaths: this.plugin.listImagePaths(),
			decide: (path) =>
				decideAttachment(this.plugin.getAttachmentIndex(), path, ownerId),
			resourcePath: (path) => this.plugin.resourcePathFor(path),
			thumbnailSize: this.plugin.settings.thumbnailSize,
			thumbnailRatio: thumbnailAspectRatio(this.plugin.settings.thumbnailAspect),
			initialPath: typeof rawValue === "string" ? rawValue : "",
			onSubmit: ({ attachment }) =>
				this.writeFieldValue(
					file,
					field.key,
					attachment === "" ? undefined : attachment,
				),
		}).open();
	}

	private openLinkTarget(raw: string, source: TFile): void {
		const parsed = parseCanonicalLink(raw);
		if (!parsed) {
			return;
		}
		const dest = this.app.metadataCache.getFirstLinkpathDest(
			parsed.linkpath,
			source.path,
		);
		if (dest) {
			void this.app.workspace.getLeaf(false).openFile(dest);
		} else {
			new Notice(`Meta KB: цель ссылки не найдена: ${parsed.linkpath}`);
		}
	}

	/**
	 * Запись значения поля в frontmatter.
	 * value === undefined → удалить ключ (пустое значение = отсутствие ключа).
	 * Значимое изменение двигает updated_at (ADR-004).
	 */
	private async writeFieldValue(
		file: TFile,
		key: string,
		value: unknown,
	): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				const before = fm[key];
				const significant = isSignificantChange(key, before, value);
				if (value === undefined) {
					delete fm[key];
				} else {
					fm[key] = value;
				}
				if (significant) {
					fm.updated_at = new Date().toISOString();
				}
			});
		} catch (err) {
			console.error("Meta KB: ошибка записи frontmatter", err);
			new Notice(`Meta KB: не удалось записать поле «${key}»`);
		}
	}
}
