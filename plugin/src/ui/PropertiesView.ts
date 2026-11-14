import { Events, ItemView, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";

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
	isSignificantChange,
} from "../core/derived";
import { bookVolume, countCleanChars } from "../core/volume";
import {
	chaptersOf,
	linkpathOf,
	neighbourPosition,
	positionOf,
} from "../core/chapter";
import type { ObjectRecord } from "../core/loader";
import { buildForm } from "../core/form";
import type { FormModel, FormRow } from "../core/form";
import { candidatesToValue, linksToCandidates, suggestLinks } from "../core/suggest";
import type { SuggestCandidate } from "../core/suggest";
import {
	attachmentEmbed,
	decideAttachment,
	shouldSyncBody,
} from "../core/attachment";
import {
	buildMediaPickItems,
	isMediaListValueType,
	isMediaValueType,
	resolveMediaRef,
} from "../core/media";
import { thumbnailAspectRatio } from "../core/thumbnails";
import { findingsForPath, validateVault } from "../core/validation";
import type { Finding } from "../core/validation";
import { FieldRow } from "./FieldRow";
import type { MediaThumb } from "./FieldRow";
import { openFieldModal } from "./modals/FieldModal";
import { ImageFilePickerModal } from "./modals/ImageFilePickerModal";
import { MediaPickerModal } from "./modals/MediaPickerModal";

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
	/** Находки для текущей отрисовки (бейдж + значки в строках полей). */
	private currentFindings: Finding[] = [];

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
			this.plugin.getLogger().warn("Meta KB: не удалось прочитать кэш метаданных", err);
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

		// Находки считаем один раз: их используют и бейдж, и строки полей.
		this.currentFindings = this.collectFindings(file);
		this.renderChapterNav(header, file);
		this.renderValidationBadge(header, this.currentFindings);

		try {
			this.renderSections(root, file, form, computed);
		} catch (err) {
			this.plugin.getLogger().error("Meta KB: ошибка отрисовки виджета", err);
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
		let content = "";
		try {
			content = await this.app.vault.cachedRead(file);
		} catch (err) {
			this.plugin.getLogger().warn("Meta KB: не удалось прочитать тело заметки", err);
		}
		const values: Record<string, unknown> = {};
		if (keys.includes("char-count")) {
			// C-CH-09: объём книги — сумма её глав, а не её собственное тело.
			const record = this.plugin
				.getRegistry()
				.all()
				.find((item) => item.path === file.basename);
			if (record?.type === "book") {
				values["char-count"] = (await this.bookVolumeOf(record)).charCount;
			} else {
				// C-CH-08: знаки чистого текста, без markdown-разметки.
				values["char-count"] = countCleanChars(content);
			}
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

	/**
	 * Объём книги по её главам (C-CH-09): читаем тела глав и считаем чистый
	 * текст. Кэш не нужен: `cachedRead` уже не ходит на диск каждый раз.
	 */
	private async bookVolumeOf(record: ObjectRecord): Promise<{
		charCount: number;
		authorSheets: number;
	}> {
		const counts: number[] = [];
		for (const { record: chapter } of chaptersOf(
			this.plugin.getRegistry().all(),
			linkpathOf(record),
		)) {
			const file = this.app.vault
				.getMarkdownFiles()
				.find((item) => item.basename === chapter.path);
			if (!file) {
				continue;
			}
			try {
				counts.push(countCleanChars(await this.app.vault.cachedRead(file)));
			} catch (err) {
				this.plugin
					.getLogger()
					.warn(`Meta KB: не удалось прочитать главу ${chapter.path}`, err);
			}
		}
		return bookVolume(counts, this.plugin.settings.authorSheetChars);
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
				// DESIGN §6: значение `media` показывается миниатюрой обёртки.
				mediaThumb: (linkpath) => this.mediaThumbFor(linkpath),
				// Находки этого поля: значок с текстом правил в подсказке.
				findings: this.currentFindings.filter(
					(item) => item.field === field.key,
				),
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

	/**
	 * Находки валидатора для открытой заметки (один прогон на отрисовку).
	 */
	private collectFindings(file: TFile): Finding[] {
		try {
			return findingsForPath(
				validateVault(this.plugin.getRegistry().all()),
				file.basename,
			);
		} catch (err) {
			this.plugin.getLogger().warn("Meta KB: не удалось проверить заметку", err);
			return [];
		}
	}

	/**
	 * Навигация по главе в шапке (C-CH-03): «←», «Книга», «→».
	 *
	 * Соседняя глава может отсутствовать — тогда команда предложит создать её
	 * (C-CH-04). «←» недоступна у первой главы: номера начинаются с 1.
	 */
	private renderChapterNav(header: HTMLElement, file: TFile): void {
		const record = this.plugin
			.getRegistry()
			.all()
			.find((item) => item.path === file.basename);
		if (!record || record.type !== "chapter") {
			return;
		}
		const position = positionOf(record);

		const nav = header.createEl("span", { cls: "meta-kb-chapter-nav" });
		const addButton = (
			icon: string,
			title: string,
			direction: "prev" | "next" | "book",
			enabled: boolean,
		): void => {
			const button = nav.createEl("button", {
				cls: "meta-kb-chapter-nav-btn" + (enabled ? "" : " is-disabled"),
			});
			button.type = "button";
			setIcon(button, icon);
			button.setAttribute("title", title);
			button.disabled = !enabled;
			if (enabled) {
				button.addEventListener("click", (evt: Event) => {
					evt.stopPropagation();
					void this.plugin.navigateChapter(direction);
				});
			}
		};

		addButton(
			"arrow-left",
			"Предыдущая глава",
			"prev",
			neighbourPosition(position, "prev") !== null,
		);
		addButton("arrow-up", "Книга главы", "book", true);
		addButton("arrow-right", "Следующая глава", "next", true);
	}

	/**
	 * Бейдж валидации в шапке: сколько находок у открытой заметки.
	 *
	 * Показывает то, что вернул `validateVault` (`core/validation.ts`) — полный
	 * текст правил в подсказке.
	 */
	private renderValidationBadge(header: HTMLElement, findings: Finding[]): void {
		if (findings.length === 0) {
			return;
		}
		const errors = findings.filter((item) => item.severity === "error").length;
		const badge = header.createEl("span", {
			cls: `meta-kb-validate-badge ${errors > 0 ? "is-error" : "is-warning"}`,
		});
		setIcon(badge, errors > 0 ? "alert-circle" : "alert-triangle");
		badge.createEl("span", {
			cls: "meta-kb-validate-count",
			text: String(findings.length),
		});
		badge.setAttribute(
			"title",
			findings
				.map(
					(item) =>
						`${item.severity === "error" ? "Ошибка" : "Предупреждение"} ` +
						`${item.rule_key}: ${item.message}`,
				)
				.join("\n"),
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

		// `media` / `list<media>` — значение всегда ссылка на обёртку `image`
		// (INV-23), поэтому выбираем миниатюрами, а не текстовыми подсказками
		// (plugin/DESIGN.md §4–5).
		if (isMediaValueType(valueType)) {
			this.openMediaPicker(field, rawValue, file);
			return;
		}

		const targetTypes = relationDef(field.key)?.target_type ?? null;
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
			log: (message, details) =>
				this.plugin.getLogger().error(message, details),
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

	/**
	 * Миниатюра для значения `media` (DESIGN §6): ссылка → файл вложения.
	 * null — цель не резолвится или файла нет; строка покажется текстом.
	 */
	private mediaThumbFor(linkpath: string): MediaThumb | null {
		const ref = resolveMediaRef(this.plugin.getRegistry().all(), linkpath);
		if (!ref) {
			return null;
		}
		const url = this.plugin.resourcePathFor(ref.attachment);
		return url ? { url, title: ref.title } : null;
	}

	/**
	 * Галерея для `media` / `list<media>` (plugin/DESIGN.md §4–5).
	 *
	 * Показывает и готовые обёртки, и свободные изображения: для свободного
	 * файла обёртка создаётся при подтверждении, а в поле пишется ссылка
	 * `[[image_{id}|Title]]` (INV-23).
	 */
	private openMediaPicker(
		field: ResolvedField,
		rawValue: unknown,
		file: TFile,
	): void {
		const plugin = this.plugin;
		const multiple = isMediaListValueType(field.valueType);

		new MediaPickerModal(this.app, {
			items: buildMediaPickItems({
				records: plugin.getRegistry().all(),
				imagePaths: plugin.listImagePaths(),
				index: plugin.getAttachmentIndex(),
			}),
			multiple,
			initialValues: linksToCandidates(rawValue).map((c) => c.linkpath),
			resourcePath: (path) => plugin.resourcePathFor(path),
			thumbnailSize: plugin.settings.thumbnailSize,
			thumbnailRatio: thumbnailAspectRatio(plugin.settings.thumbnailAspect),
			onCreateWrapper: (item) => plugin.ensureImageWrapper(item.previewPath),
			onSubmit: (candidates) =>
				this.writeFieldValue(
					file,
					field.key,
					candidatesToValue(candidates, multiple),
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
	 *
	 * Смена `attachment` у обёртки дополнительно синхронизирует тело заметки,
	 * чтобы `![[image_id]]` показывал уже новый файл (C-IMG-01).
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
			if (key === "attachment") {
				await this.syncWrapperBody(
					file,
					typeof value === "string" ? value : "",
				);
			}
		} catch (err) {
			this.plugin.getLogger().error("Meta KB: ошибка записи frontmatter", err);
			new Notice(`Meta KB: не удалось записать поле «${key}»`);
		}
	}

	/**
	 * Тело обёртки следует за `attachment`.
	 *
	 * Переписываем только тело, которое писал плагин: пустое или целиком
	 * состоящее из одного embed (`![[...]]`). Свой текст владельца не трогаем.
	 */
	private async syncWrapperBody(file: TFile, attachment: string): Promise<void> {
		const type =
			this.app.metadataCache.getFileCache(file)?.frontmatter?.["type"];
		if (type !== "image" || attachment === "") {
			return;
		}
		try {
			const content = await this.app.vault.cachedRead(file);
			const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(content);
			const head = match ? content.slice(0, match[0].length) : "";
			const body = match ? content.slice(match[0].length) : content;
			if (!shouldSyncBody(body, attachment)) {
				return;
			}
			const embed = attachmentEmbed(attachment);
			if (body.trim() === embed) {
				return; // уже синхронизировано
			}
			const separator = head === "" || head.endsWith("\n") ? "" : "\n";
			await this.app.vault.modify(file, `${head}${separator}${embed}\n`);
		} catch (err) {
			this.plugin.getLogger().warn(`Meta KB: не удалось синхронизировать тело ${file.path}`, err);
		}
	}
}
