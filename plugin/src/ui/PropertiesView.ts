import { Events, ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";

import {
	FieldGroup,
	ResolvedField,
	enumValueLabel,
	parseCanonicalLink,
	relationDef,
	resolveField,
} from "../labels";
import { formatDatetime } from "../settings";
import { isSignificantChange } from "../core/derived";
import { suggestLinks } from "../core/suggest";
import type { SuggestCandidate } from "../core/suggest";
import { FieldRow } from "./FieldRow";
import { openFieldModal } from "./modals/FieldModal";

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
 * View «Meta KB Properties» — свойства активного файла.
 *
 * ITER-2026-11-13-1: link/media-модалки берут подсказки из Registry;
 * значимое изменение поля двигает updated_at (ADR-004).
 */
export class MetaKBPropertiesView extends ItemView {
	private readonly plugin: MetaKBPluginAPI;
	private renderTimer: number | null = null;
	private lastFile: TFile | null = null;

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
		this.render();
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
			this.render();
		}, 100);
	}

	private render(): void {
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

		let frontmatter: FrontmatterMap | undefined;
		try {
			frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		} catch (err) {
			console.warn("Meta KB: не удалось прочитать кэш метаданных", err);
			frontmatter = undefined;
		}

		const header = root.createEl("div", { cls: "meta-kb-file-header" });
		header.createEl("div", { cls: "meta-kb-file-name", text: file.basename });
		const typeRaw =
			frontmatter && typeof frontmatter["type"] === "string"
				? (frontmatter["type"] as string)
				: null;
		if (typeRaw) {
			const chip = header.createEl("span", {
				cls: "meta-kb-type-chip",
				text: typeRaw,
			});
			chip.setAttribute("title", `type: ${typeRaw}`);
		}

		if (!frontmatter || typeof frontmatter !== "object") {
			root.createEl("div", {
				cls: "meta-kb-empty",
				text: "У заметки нет frontmatter (или YAML повреждён). Свойства не показаны.",
			});
			return;
		}

		try {
			this.renderSections(root, file, frontmatter);
		} catch (err) {
			console.error("Meta KB: ошибка отрисовки виджета", err);
			root.createEl("div", {
				cls: "meta-kb-empty",
				text: "Не удалось отобразить свойства. Подробности в консоли.",
			});
		}
	}

	private renderSections(
		root: HTMLElement,
		file: TFile,
		frontmatter: FrontmatterMap,
	): void {
		const groups = new Map<FieldGroup, ResolvedField[]>();
		for (const group of SECTION_ORDER) {
			groups.set(group, []);
		}
		for (const key of Object.keys(frontmatter)) {
			const field = resolveField(key, frontmatter[key]);
			groups.get(field.group)?.push(field);
		}

		for (const group of SECTION_ORDER) {
			const fields = groups.get(group);
			if (!fields || fields.length === 0) {
				continue;
			}
			this.renderSection(root, group, fields, file, frontmatter);
		}
	}

	private renderSection(
		root: HTMLElement,
		group: FieldGroup,
		fields: ResolvedField[],
		file: TFile,
		frontmatter: FrontmatterMap,
	): void {
		const section = root.createEl("div", {
			cls: `meta-kb-section meta-kb-section-${group}`,
		});
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
			text: String(fields.length),
		});
		headerEl.addEventListener("click", () => {
			section.toggleClass("is-collapsed", !section.hasClass("is-collapsed"));
		});

		const body = section.createEl("div", { cls: "meta-kb-section-body" });
		for (const field of fields) {
			this.renderFieldRow(body, field, frontmatter[field.key], file);
		}
	}

	private renderFieldRow(
		container: HTMLElement,
		field: ResolvedField,
		rawValue: unknown,
		file: TFile,
	): void {
		new FieldRow(
			container,
			{
				key: field.key,
				label: field.label,
				valueType: field.valueType,
				value: rawValue,
				readOnly: field.readOnly,
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
		if (field.readOnly) {
			return;
		}

		const isMedia =
			field.valueType === "media" || field.valueType === "list<media>";
		const targetTypes = isMedia
			? ["image"]
			: relationDef(field.key)?.target_type ?? null;
		const registry = this.plugin.getRegistry();

		openFieldModal(this.app, {
			key: field.key,
			label: field.label,
			valueType: field.valueType,
			currentValue: rawValue,
			enumValues: field.enumValues,
			suggest: (query: string): SuggestCandidate[] =>
				suggestLinks(registry.all(), query, { targetTypes }),
			onApply: (value) => this.writeFieldValue(file, field.key, value),
		});
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
