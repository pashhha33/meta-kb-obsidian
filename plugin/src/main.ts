import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
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
import { CORE_TYPES } from "./core/metamodel";
import { buildNewObject, findTypeDefinitionId } from "./core/create";
import {
	isBootstrapped,
	missingDefinitions,
	planBootstrap,
	planCoreTypes,
	planMetatypes,
} from "./core/bootstrap";
import { serializeNote } from "./core/yaml";
import { CreateObjectModal } from "./ui/modals/CreateObjectModal";
import { BootstrapModal } from "./ui/modals/BootstrapModal";

/** Класс на <body>: включает CSS-скрытие core Properties (styles.css). */
const HIDE_CORE_PROPERTIES_CSS_CLASS = "meta-kb-hide-core-properties";

/** Задержка пересборки Registry после изменений vault. */
const REGISTRY_REBUILD_DEBOUNCE_MS = 300;

/**
 * Meta KB — плагин поддержки метамодели Second Brain PKB.
 *
 * ITER-2026-11-14-1: создание объектов (`{type}_{id}.md` с универсальным ядром
 * свойств) и bootstrap метамодели (10 метатипов + определения 29 типов ядра).
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

		this.addCommand({
			id: "create-object",
			name: "Create object",
			callback: () => this.openCreateObject(),
		});

		this.addCommand({
			id: "bootstrap-metamodel",
			name: "Bootstrap metamodel",
			callback: () => this.openBootstrap(),
		});

		this.addSettingTab(new MetaKBSettingTab(this.app, this));

		this.applyHideCoreProperties();

		// Registry: первичная сборка + пересборка по изменениям vault.
		this.app.workspace.onLayoutReady(() => {
			this.rebuildRegistry();
			this.offerBootstrap();
		});
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

	// --- Registry ---------------------------------------------------------------

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
						toObjectRecord(file.basename, fm as Record<string, unknown>, ""),
					);
				}
			}
			this.registry = next;
		} catch (err) {
			console.warn("Meta KB: не удалось перестроить Registry", err);
		}
	}

	/** id всех известных объектов (для проверки, что уже создано). */
	private existingIds(): string[] {
		return this.registry
			.all()
			.map((record) => record.id)
			.filter((id) => id !== "");
	}

	// --- Создание объекта --------------------------------------------------------

	private openCreateObject(): void {
		new CreateObjectModal(this.app, {
			types: CORE_TYPES.map((type) => ({
				typeValue: type.type_value,
				label: type.label,
				group: type.group,
			})),
			definitionLookup: (typeValue) =>
				findTypeDefinitionId(this.registry.all(), typeValue),
			folder: "",
			onSubmit: (typeValue, title) => this.createObject(typeValue, title),
		}).open();
	}

	private async createObject(typeValue: string, title: string): Promise<void> {
		const definedBy = findTypeDefinitionId(this.registry.all(), typeValue);
		if (!definedBy) {
			new Notice(
				`Meta KB: определение типа «${typeValue}» не найдено — ` +
					"у объекта не будет defined_by. Выполните «Bootstrap metamodel».",
				8000,
			);
		}

		const plan = buildNewObject({ typeValue, title, definedBy });
		const file = await this.createNote("", plan.filename, plan.frontmatter);
		if (!file) {
			return;
		}
		new Notice(`Meta KB: создан ${plan.filename}`);
		try {
			await this.app.workspace.getLeaf(true).openFile(file);
		} catch (err) {
			console.warn("Meta KB: не удалось открыть созданный файл", err);
		}
	}

	// --- Bootstrap ---------------------------------------------------------------

	/** Одноразовая подсказка, если метамодель не инициализирована. */
	private offerBootstrap(): void {
		if (!this.settings.bootstrapOffer) {
			return;
		}
		if (isBootstrapped(this.existingIds())) {
			return;
		}
		new Notice(
			"Meta KB: метамодель в хранилище не инициализирована. " +
				"Команда «Bootstrap metamodel» создаст метатипы и определения типов.",
			10000,
		);
	}

	private openBootstrap(): void {
		const existing = this.existingIds();
		const missingMetatypes = missingDefinitions(planMetatypes(), existing);
		const missingCoreTypes = missingDefinitions(planCoreTypes(), existing);

		new BootstrapModal(this.app, {
			missingMetatypes: missingMetatypes.map((plan) => ({
				typeValue: plan.typeValue,
				label: plan.label,
			})),
			missingCoreTypes: missingCoreTypes.map((plan) => ({
				typeValue: plan.typeValue,
				label: plan.label,
			})),
			folder: this.settings.definitionsFolder,
			onConfirm: (withCoreTypes) => this.runBootstrap(withCoreTypes),
		}).open();
	}

	private async runBootstrap(withCoreTypes: boolean): Promise<void> {
		const plans = missingDefinitions(
			planBootstrap({ withCoreTypes }),
			this.existingIds(),
		);
		if (plans.length === 0) {
			new Notice("Meta KB: все определения уже на месте.");
			return;
		}

		const folder = this.settings.definitionsFolder;
		let created = 0;
		let failed = 0;
		for (const plan of plans) {
			const file = await this.createNote(folder, plan.filename, plan.frontmatter);
			if (file) {
				created += 1;
			} else {
				failed += 1;
			}
		}

		const suffix = failed > 0 ? ` (не удалось: ${failed})` : "";
		new Notice(
			`Meta KB: bootstrap — создано ${created} из ${plans.length} определений${suffix}.`,
			8000,
		);
		this.scheduleRebuild();
	}

	// --- Файловые операции -------------------------------------------------------

	private async ensureFolder(path: string): Promise<void> {
		if (!path) {
			return;
		}
		if (this.app.vault.getAbstractFileByPath(path)) {
			return;
		}
		try {
			await this.app.vault.createFolder(path);
		} catch (err) {
			// Папка могла появиться параллельно — это не ошибка.
			console.warn(`Meta KB: createFolder(${path})`, err);
		}
	}

	/** Создать заметку с готовым frontmatter. null — файл уже существует. */
	private async createNote(
		folder: string,
		filename: string,
		frontmatter: Record<string, unknown>,
	): Promise<TFile | null> {
		await this.ensureFolder(folder);
		const path = folder ? `${folder}/${filename}` : filename;
		if (this.app.vault.getAbstractFileByPath(path)) {
			new Notice(`Meta KB: файл уже существует: ${path}`);
			return null;
		}
		try {
			return await this.app.vault.create(path, serializeNote(frontmatter));
		} catch (err) {
			console.error("Meta KB: не удалось создать файл", err);
			new Notice(`Meta KB: не удалось создать ${path}`);
			return null;
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
