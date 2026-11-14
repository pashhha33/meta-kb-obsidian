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
	AttachmentIndex,
	attachmentEmbed,
	buildAttachmentIndex,
	buildImageWrapperPlan,
	decideAttachment,
	isImagePath,
	normalizeAttachmentPath,
	shouldSyncBody,
	titleFromPath,
	unwrappedImagePaths,
	wrapperForPath,
} from "./core/attachment";
import type { SuggestCandidate } from "./core/suggest";
import {
	clampThumbnailSize,
	normalizeThumbnailAspect,
	thumbnailAspectRatio,
} from "./core/thumbnails";
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
import { ImageFilePickerModal } from "./ui/modals/ImageFilePickerModal";
import { DeleteWrapperModal } from "./ui/modals/DeleteWrapperModal";

/** Класс на <body>: включает CSS-скрытие core Properties (styles.css). */
const HIDE_CORE_PROPERTIES_CSS_CLASS = "meta-kb-hide-core-properties";

/** Задержка пересборки Registry после изменений vault. */
const REGISTRY_REBUILD_DEBOUNCE_MS = 300;

/** Тело заметки: всё после закрывающего `---` frontmatter. */
function noteBody(content: string): string {
	const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(content);
	return match ? content.slice(match[0].length) : content;
}

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
	/** Индекс «файл-вложение → обёртка image» (C-IMG-05). */
	private attachmentIndex: AttachmentIndex = buildAttachmentIndex([]);
	private rebuildTimer: number | null = null;
	/** Тела обёрток уже выровнены в этой сессии (см. backfillWrapperBodies). */
	private bodiesBackfilled = false;

	/** Доступ к Registry для UI (виджет и модалки). */
	getRegistry(): Registry {
		return this.registry;
	}

	/** Индекс обёрток: путь вложения → объект `image`. */
	getAttachmentIndex(): AttachmentIndex {
		return this.attachmentIndex;
	}

	/** Пути всех изображений хранилища (для галереи выбора). */
	listImagePaths(): string[] {
		return this.app.vault
			.getFiles()
			.map((file) => file.path)
			.filter((path) => isImagePath(path))
			.sort((a, b) => a.localeCompare(b));
	}

	/** URL файла для превью через getResourcePath. */
	resourcePathFor(path: string): string | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) {
			return null;
		}
		try {
			return this.app.vault.getResourcePath(file);
		} catch (err) {
			console.warn("Meta KB: getResourcePath", err);
			return null;
		}
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
			id: "create-image-wrapper",
			name: "Create image wrapper",
			callback: () => this.openImageWrapperPicker(),
		});

		this.addCommand({
			id: "delete-image-wrapper",
			name: "Delete image wrapper",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || !this.isImageWrapper(file)) {
					return false;
				}
				if (!checking) {
					this.openDeleteWrapper(file);
				}
				return true;
			},
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
			void this.backfillWrapperBodies();
		});
		const schedule = (): void => this.scheduleRebuild();
		this.registerEvent(this.app.metadataCache.on("changed", schedule));
		this.registerEvent(this.app.metadataCache.on("resolved", schedule));
		this.registerEvent(this.app.vault.on("delete", schedule));
		this.registerEvent(this.app.vault.on("rename", schedule));

		// C-IMG-01: embed обёртки показывает само изображение из `attachment`.
		this.registerMarkdownPostProcessor((element, context) => {
			this.renderImageEmbeds(element, context.sourcePath);
		});

		// C-IMG-07: удаление обёртки с вопросом про привязанный файл.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile) || !this.isImageWrapper(file)) {
					return;
				}
				menu.addItem((item) =>
					item
						.setTitle("Meta KB: удалить обёртку…")
						.setIcon("trash")
						.onClick(() => this.openDeleteWrapper(file)),
				);
			}),
		);

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
			this.attachmentIndex = buildAttachmentIndex(next.all());
		} catch (err) {
			console.warn("Meta KB: не удалось перестроить Registry", err);
		}
	}

	/**
	 * Один раз за сессию: обёрткам с пустым телом дописать embed вложения.
	 *
	 * Ранее созданные обёртки (до C-IMG-01 с телом) показывались в Reading
	 * View только благодаря post-processor'у, а в Live Preview — не показывались
	 * вовсе. С телом `![[вложение]]` изображение рисует сам Obsidian в обоих
	 * режимах (C-IMG-01). Текст владельца не трогаем: только пустое тело.
	 */
	private async backfillWrapperBodies(): Promise<void> {
		if (this.bodiesBackfilled) {
			return;
		}
		this.bodiesBackfilled = true;

		let filled = 0;
		for (const record of this.registry.all()) {
			if (record.type !== "image") {
				continue;
			}
			const attachment = normalizeAttachmentPath(record.props["attachment"]);
			if (attachment === "" || !isImagePath(attachment)) {
				continue;
			}
			const file = this.app.vault.getMarkdownFiles()
				.find((candidate) => candidate.basename === record.path);
			if (!file) {
				continue;
			}
			try {
				const content = await this.app.vault.cachedRead(file);
				const body = noteBody(content);
				if (!shouldSyncBody(body, attachment)) {
					continue;
				}
				const head = content.slice(0, content.length - body.length);
				const separator = head === "" || head.endsWith("\n") ? "" : "\n";
				await this.app.vault.modify(
					file,
					`${head}${separator}${attachmentEmbed(attachment)}\n`,
				);
				filled += 1;
			} catch (err) {
				console.warn(`Meta KB: не удалось выровнять тело ${file.path}`, err);
			}
		}
		if (filled > 0) {
			new Notice(
				`Meta KB: подключено изображений к обёрткам: ${filled}. ` +
					"Теперь `![[image_id]]` показывает картинку и в Live Preview.",
				8000,
			);
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

	// --- Обёртка изображения (ADR-003, C-IMG) ------------------------------------

	/**
	 * Диалог создания обёртки: галерея **необёрнутых** изображений
	 * миниатюрами плюс возможность указать путь вручную (C-IMG-04 п.2).
	 *
	 * Уже обёрнутые файлы в галерее не показываются (C-IMG-04 п.4): выбрать их
	 * для новой обёртки нельзя, а засорять сетку неактивными элементами
	 * незачем. Ручной путь остаётся: если он указывает на обёрнутый файл,
	 * диалог скажет об этом и предложит открыть существующую обёртку.
	 */
	private openImageWrapperPicker(): void {
		const all = this.listImagePaths();
		const imagePaths = unwrappedImagePaths(all, this.attachmentIndex);
		if (imagePaths.length === 0) {
			new Notice(
				all.length === 0
					? "Meta KB: в хранилище нет изображений — добавьте файл-картинку " +
							"и повторите создание обёртки."
					: `Meta KB: все изображения уже обёрнуты (${all.length}). ` +
							"Новые обёртки создавать не из чего.",
				8000,
			);
			return;
		}

		new ImageFilePickerModal(this.app, {
			mode: "create-wrapper",
			imagePaths,
			decide: (path) => decideAttachment(this.attachmentIndex, path, null),
			resourcePath: (path) => this.resourcePathFor(path),
			...this.thumbnailOptions(),
			onSubmit: ({ title, attachment }) =>
				this.createImageWrapper(title, attachment),
			onOpenExisting: (id) => this.openObjectById(id),
		}).open();
	}

	private async createImageWrapper(
		title: string,
		attachment: string,
	): Promise<void> {
		const definedBy = findTypeDefinitionId(this.registry.all(), "image");
		const plan = buildImageWrapperPlan({
			title: title || attachment,
			attachment,
			definedBy,
		});
		const file = await this.createNote("", plan.filename, plan.frontmatter, plan.body);
		if (!file) {
			return;
		}
		new Notice(`Meta KB: создана обёртка ${plan.filename}`);
		try {
			await this.app.workspace.getLeaf(true).openFile(file);
		} catch (err) {
			console.warn("Meta KB: не удалось открыть обёртку", err);
		}
	}

	/**
	 * Обёртка для файла: существующая или созданная на месте.
	 *
	 * Нужна галерее `media` (INV-23): значение свойства — ссылка на объект
	 * `image`, поэтому выбранному свободному файлу обёртка создаётся сразу.
	 */
	public async ensureImageWrapper(
		attachment: string,
	): Promise<SuggestCandidate | null> {
		const path = normalizeAttachmentPath(attachment);
		if (path === "" || !isImagePath(path)) {
			return null;
		}

		const existing = wrapperForPath(this.attachmentIndex, path);
		if (existing) {
			return {
				id: existing.id,
				title: existing.title,
				type: "image",
				linkpath: `image_${existing.id}`,
			};
		}

		const definedBy = findTypeDefinitionId(this.registry.all(), "image");
		const title = titleFromPath(path) || path;
		const plan = buildImageWrapperPlan({
			title,
			attachment: path,
			definedBy,
		});
		const file = await this.createNote(
			"",
			plan.filename,
			plan.frontmatter,
			plan.body,
		);
		if (!file) {
			return null;
		}
		const id = String(plan.frontmatter["id"] ?? "");
		const createdTitle = String(plan.frontmatter["title"] ?? title);
		if (id === "") {
			return null;
		}
		// Индекс правим сразу: metadataCache ещё не успел, а повторный выбор
		// того же файла в этой же сессии уже должен видеть обёртку (C-IMG-05).
		this.attachmentIndex.byPath.set(path, {
			id,
			title: createdTitle,
			path,
		});
		this.scheduleRebuild();
		return {
			id,
			title: createdTitle,
			type: "image",
			linkpath: `image_${id}`,
		};
	}

	/** Открыть объект модели по его `id`. */
	private openObjectById(id: string): void {
		const record = this.registry.get(id);
		if (!record) {
			new Notice(`Meta KB: объект ${id} не найден в Registry.`);
			return;
		}
		const file = this.app.vault
			.getMarkdownFiles()
			.find((candidate) => candidate.basename === record.path);
		if (!file) {
			new Notice(`Meta KB: файл объекта ${record.path} не найден.`);
			return;
		}
		void this.app.workspace.getLeaf(true).openFile(file);
	}

	/** Параметры миниатюр из настроек (см. core/thumbnails.ts). */
	private thumbnailOptions(): {
		thumbnailSize: number;
		thumbnailRatio: string | null;
	} {
		return {
			thumbnailSize: this.settings.thumbnailSize,
			thumbnailRatio: thumbnailAspectRatio(this.settings.thumbnailAspect),
		};
	}

	/** Является ли файл обёрткой изображения. */
	private isImageWrapper(file: TFile): boolean {
		if (file.extension !== "md") {
			return false;
		}
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		return !!frontmatter && frontmatter["type"] === "image";
	}

	/** Найти embed-ы обёрток и заменить их изображением (C-IMG-01). */
	private renderImageEmbeds(element: HTMLElement, sourcePath: string): void {
		const embeds: HTMLElement[] = [];
		if (element.matches && element.matches(".internal-embed")) {
			embeds.push(element);
		}
		for (const node of Array.from(
			element.querySelectorAll<HTMLElement>(".internal-embed"),
		)) {
			embeds.push(node);
		}
		for (const embed of embeds) {
			this.renderImageEmbed(embed, sourcePath);
		}
	}

	private renderImageEmbed(embed: HTMLElement, sourcePath: string): void {
		try {
			const src = embed.getAttribute("src");
			if (!src) {
				return;
			}
			const target = this.app.metadataCache.getFirstLinkpathDest(src, sourcePath);
			if (!target || !this.isImageWrapper(target)) {
				return;
			}
			const frontmatter = this.app.metadataCache.getFileCache(target)?.frontmatter;
			const attachment = normalizeAttachmentPath(frontmatter?.["attachment"]);
			if (attachment === "" || !isImagePath(attachment)) {
				return; // не изображение — оставляем embed как есть
			}

			embed.empty();
			embed.addClass("meta-kb-image-embed");

			const file = this.app.vault.getAbstractFileByPath(attachment);
			if (!(file instanceof TFile)) {
				embed.createEl("span", {
					cls: "meta-kb-embed-missing",
					text: `Meta KB: файл вложения не найден: ${attachment}`,
				});
				return;
			}
			embed.createEl("img", {
				attr: {
					src: this.app.vault.getResourcePath(file),
					alt: target.basename,
				},
			});
		} catch (err) {
			console.warn("Meta KB: не удалось отрисовать embed обёртки", err);
		}
	}

	/** Диалог удаления обёртки: спросить про привязанный файл (C-IMG-07). */
	private openDeleteWrapper(file: TFile): void {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) {
			new Notice("Meta KB: у заметки нет frontmatter.");
			return;
		}
		const attachment = normalizeAttachmentPath(frontmatter["attachment"]);
		const attachmentFile =
			attachment === "" ? null : this.app.vault.getAbstractFileByPath(attachment);
		const duplicate = this.attachmentIndex.duplicates.find(
			(entry) => entry.path === attachment,
		);
		const ownerId =
			typeof frontmatter["id"] === "string" ? (frontmatter["id"] as string) : "";
		const otherWrappers = duplicate
			? duplicate.ids.filter((id) => id !== ownerId).length
			: 0;

		new DeleteWrapperModal(this.app, {
			wrapperTitle:
				typeof frontmatter["title"] === "string"
					? (frontmatter["title"] as string)
					: file.basename,
			attachmentPath: attachment,
			attachmentExists: attachmentFile instanceof TFile,
			otherWrappers,
			onDeleteWrapper: async () => {
				await this.trashFile(file);
			},
			onDeleteBoth: async () => {
				await this.trashFile(file);
				if (attachmentFile instanceof TFile) {
					await this.trashFile(attachmentFile);
				}
			},
		}).open();
	}

	/** Удалить файл: в корзину, если так настроено в Obsidian. */
	private async trashFile(file: TFile): Promise<void> {
		try {
			await this.app.fileManager.trashFile(file);
			new Notice(`Meta KB: удалено: ${file.path}`);
		} catch (err) {
			console.error("Meta KB: не удалось удалить файл", err);
			new Notice(`Meta KB: не удалось удалить ${file.path}`);
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

	/** Создать заметку с готовым frontmatter (и телом). null — файл уже существует. */
	private async createNote(
		folder: string,
		filename: string,
		frontmatter: Record<string, unknown>,
		body = "",
	): Promise<TFile | null> {
		await this.ensureFolder(folder);
		const path = folder ? `${folder}/${filename}` : filename;
		if (this.app.vault.getAbstractFileByPath(path)) {
			new Notice(`Meta KB: файл уже существует: ${path}`);
			return null;
		}
		try {
			return await this.app.vault.create(
				path,
				serializeNote(frontmatter, body),
			);
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
		// Защита от правки data.json руками: значения настроек нормализуются.
		this.settings.thumbnailSize = clampThumbnailSize(this.settings.thumbnailSize);
		this.settings.thumbnailAspect = normalizeThumbnailAspect(
			this.settings.thumbnailAspect,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
