import { Plugin, WorkspaceLeaf } from "obsidian";
import {
	DEFAULT_SETTINGS,
	MetaKBSettings,
	MetaKBSettingTab,
} from "./settings";
import {
	MetaKBPropertiesView,
	VIEW_TYPE_META_KB_PROPERTIES,
} from "./ui/PropertiesView";
import { Registry } from "./core/registry";
import { toObjectRecord } from "./core/loader";

/** Класс на <body>: включает CSS-скрытие core Properties (styles.css). */
const HIDE_CORE_PROPERTIES_CSS_CLASS = "meta-kb-hide-core-properties";

/** Задержка пересборки Registry после изменений vault. */
const REGISTRY_REBUILD_DEBOUNCE_MS = 300;

/**
 * Meta KB — плагин поддержки метамодели Second Brain PKB.
 *
 * Срез ITER-2026-11-13-1: Loader/Registry/Schema + связь с UI.
 * Registry пересобирается по изменениям metadataCache (пока полный пересбор).
 */
export default class MetaKBPlugin extends Plugin {
	/** Настройки плагина (загружаются в onload). */
	public override settings!: MetaKBSettings;

	/** Индекс объектов vault: id → ObjectRecord. */
	private registry = new Registry();
	private rebuildTimer: number | null = null;

	/** Доступ к Registry для UI (виджет и модалки). */
	getRegistry(): Registry {
		return this.registry;
	}

	override async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_META_KB_PROPERTIES,
			(leaf: WorkspaceLeaf) => new MetaKBPropertiesView(leaf, this),
		);

		this.addCommand({
			id: "open-properties-widget",
			name: "Open properties widget",
			callback: () => {
				void this.activatePropertiesView();
			},
		});

		this.addSettingTab(new MetaKBSettingTab(this.app, this));

		this.applyHideCoreProperties();

		// Registry: первичная сборка + пересборка по изменениям vault.
		this.app.workspace.onLayoutReady(() => this.rebuildRegistry());
		const schedule = (): void => this.scheduleRebuild();
		this.registerEvent(this.app.metadataCache.on("changed", schedule));
		this.registerEvent(this.app.metadataCache.on("resolved", schedule));
		this.registerEvent(this.app.vault.on("delete", schedule));
		this.registerEvent(this.app.vault.on("rename", schedule));

		console.log("Meta KB plugin loaded");
	}

	override onunload(): void {
		if (this.rebuildTimer !== null) {
			window.clearTimeout(this.rebuildTimer);
			this.rebuildTimer = null;
		}
		document.body.classList.remove(HIDE_CORE_PROPERTIES_CSS_CLASS);
		console.log("Meta KB plugin unloaded");
	}

	/** Включает/выключает CSS-скрытие core Properties по настройке. */
	public applyHideCoreProperties(): void {
		document.body.classList.toggle(
			HIDE_CORE_PROPERTIES_CSS_CLASS,
			this.settings.hideCoreProperties,
		);
	}

	private scheduleRebuild(): void {
		if (this.rebuildTimer !== null) {
			window.clearTimeout(this.rebuildTimer);
		}
		this.rebuildTimer = window.setTimeout(() => {
			this.rebuildTimer = null;
			this.rebuildRegistry();
		}, REGISTRY_REBUILD_DEBOUNCE_MS);
	}

	/** Полная пересборка Registry из metadataCache всех markdown-файлов. */
	private rebuildRegistry(): void {
		try {
			const next = new Registry();
			for (const file of this.app.vault.getMarkdownFiles()) {
				const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
				if (fm && typeof fm === "object") {
					next.add(
						toObjectRecord(
							file.basename,
							fm as Record<string, unknown>,
							"",
						),
					);
				}
			}
			this.registry = next;
		} catch (err) {
			console.warn("Meta KB: не удалось перестроить Registry", err);
		}
	}

	/** Открывает (или активирует существующий) leaf виджета в правой панели. */
	private async activatePropertiesView(): Promise<void> {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_META_KB_PROPERTIES);
		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
			await leaf.setViewState({
				type: VIEW_TYPE_META_KB_PROPERTIES,
				active: true,
			});
		}
		if (leaf) {
			await workspace.revealLeaf(leaf);
		}
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<MetaKBSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
