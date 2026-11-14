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
	fileBasename,
	fileExtension,
	isImagePath,
	normalizeAttachmentPath,
	shouldSyncBody,
	titleFromPath,
	unwrappedImagePaths,
	wrapperForPath,
} from "./core/attachment";
import type { SuggestCandidate } from "./core/suggest";
import { candidateOf, candidatesToValue } from "./core/suggest";
import type { ObjectRecord } from "./core/loader";
import {
	buildImportedImagePath,
	buildPastedImagePath,
	clipboardImageExtension,
	guessAttachmentFolder,
	parseFileNameW,
	parsePathList,
	parseUriList,
	pickImageFilePaths,
	resolveAttachmentFolder,
} from "./core/clipboard";
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
import { CommandsModal } from "./ui/modals/CommandsModal";
import { LogModal } from "./ui/modals/LogModal";
import { ValidationModal } from "./ui/modals/ValidationModal";
import { ChapterModal } from "./ui/modals/ChapterModal";
import {
	bookLabel,
	bookLinkpathOf,
	booksForPicker,
	CHAPTER_TYPE,
	chaptersOf,
	findChapter,
	linkpathOf,
	neighbourPosition,
	nextFreePosition,
	positionOf,
	resolveChapterTitle,
} from "./core/chapter";
import { bookVolume, countCleanChars } from "./core/volume";
import { validateVault } from "./core/validation";
import { Logger, normalizeLogLevel } from "./core/logging";
import type { LogEntry } from "./core/logging";

/** Класс на <body>: включает CSS-скрытие core Properties (styles.css). */
const HIDE_CORE_PROPERTIES_CSS_CLASS = "meta-kb-hide-core-properties";

/** Задержка пересборки Registry после изменений vault. */
const REGISTRY_REBUILD_DEBOUNCE_MS = 300;

/** Задержка пересчёта объёма книги после правки главы (C-CH-10). */
const BOOK_VOLUME_DEBOUNCE_MS = 2500;

/** Тело заметки: всё после закрывающего `---` frontmatter. */
function noteBody(content: string): string {
	const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(content);
	return match ? content.slice(match[0].length) : content;
}

/** Источник изображения из буфера обмена, готовый к записи в vault. */
interface ClipboardSource {
	bytes: ArrayBuffer;
	/** Расширение без точки. */
	extension: string;
	/** Имя исходного файла (пусто — растровый снимок из буфера). */
	name?: string;
}

/** Часть Electron API буфера обмена, которая нам нужна. */
interface ElectronClipboard {
	readImage?: () => { isEmpty(): boolean; toPNG(): Uint8Array };
	read?: (format: string) => string;
	readBuffer?: (format: string) => Uint8Array;
}

/** Буфер Node/Electron → ArrayBuffer, который принимает `vault.createBinary`. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
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
	/** Отложенные пересчёты книг: linkpath книги → таймер. */
	private readonly bookVolumeTimers = new Map<string, number>();
	/** Журнал плагина: буфер записей + необязательный вывод в консоль. */
	private readonly logger = new Logger();

	/** Доступ к Registry для UI (виджет и модалки). */
	getRegistry(): Registry {
		return this.registry;
	}

	/** Журнал плагина (см. core/logging.ts). */
	getLogger(): Logger {
		return this.logger;
	}

	/**
	 * Применить настройки логирования: уровень и вывод в консоль.
	 * Вызывается после загрузки настроек и при их изменении.
	 */
	public applyLogSettings(): void {
		this.logger.setLevel(this.settings.logLevel);
		if (!this.settings.logToConsole) {
			this.logger.setSink(undefined);
			return;
		}
		this.logger.setSink((entry: LogEntry) => {
			const text = entry.details
				? `Meta KB: ${entry.message} — ${entry.details}`
				: `Meta KB: ${entry.message}`;
			if (entry.level === "error") {
				console.error(text);
			} else if (entry.level === "warn") {
				console.warn(text);
			} else if (entry.level === "debug") {
				console.debug(text);
			} else {
				console.info(text);
			}
		});
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
			this.logger.warn("Meta KB: getResourcePath", err);
			return null;
		}
	}

	override async onload(): Promise<void> {
		await this.loadSettings();
		this.applyLogSettings();
		this.logger.info("плагин загружен", { версия: this.manifest.version });

		this.registerView(
			VIEW_TYPE_META_KB_PROPERTIES,
			(leaf: WorkspaceLeaf) => new MetaKBPropertiesView(leaf, this),
		);

// Одна точка входа: сгруппированное окно команд на русском.
		this.addCommand({
			id: "open-commands",
			name: "Команды Meta KB",
			callback: () => this.openCommands(),
		});

		this.addCommand({
			id: "open-properties-widget",
			name: "Панель свойств",
			callback: () => {
				void this.activatePropertiesView();
			},
		});

		this.addCommand({
			id: "create-object",
			name: "Создать объект",
			callback: () => this.openCreateObject(),
		});

		this.addCommand({
			id: "create-image-wrapper",
			name: "Создать обёртку изображения",
			callback: () => {
				void this.openImageWrapperPicker();
			},
		});

		// C-IMG-04 п.2: источник — изображение из буфера обмена.
		this.addCommand({
			id: "create-image-wrapper-from-clipboard",
			name: "Обёртка из буфера обмена",
			callback: () => {
				void this.pasteImageWrapper();
			},
		});

		this.addCommand({
			id: "delete-image-wrapper",
			name: "Удалить обёртку изображения",
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
			name: "Инициализировать метамодель",
			callback: () => this.openBootstrap(),
		});

		// Журнал: записи плагина без DevTools.
		this.addCommand({
			id: "show-log",
			name: "Показать лог",
			callback: () => this.openLog(),
		});

		this.addCommand({
			id: "validate-vault",
			name: "Проверить хранилище",
			callback: () => this.openValidationReport(),
		});

		// Главы (ADR-002, C-CH): создание и навигация.
		this.addCommand({
			id: "create-chapter",
			name: "Создать главу",
			callback: () => this.openCreateChapter(),
		});

		this.addCommand({
			id: "chapter-prev",
			name: "Предыдущая глава",
			callback: () => {
				void this.gotoNeighbourChapter("prev");
			},
		});

		this.addCommand({
			id: "chapter-next",
			name: "Следующая глава",
			callback: () => {
				void this.gotoNeighbourChapter("next");
			},
		});

		this.addCommand({
			id: "chapter-book",
			name: "Открыть книгу главы",
			callback: () => {
				void this.gotoChapterBook();
			},
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

		// C-CH-08/10: правка главы пересчитывает её объём и объём книги.
		const onChapterChange = (file: TFile): void => {
			void this.refreshChapterVolume(file);
		};
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile) {
					onChapterChange(file);
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile) {
					onChapterChange(file);
				}
			}),
		);

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

		this.logger.info("плагин загружен");
	}

	override onunload(): void {
		if (this.rebuildTimer !== null) {
			window.clearTimeout(this.rebuildTimer);
			this.rebuildTimer = null;
		}
		document.body.classList.remove(HIDE_CORE_PROPERTIES_CSS_CLASS);
		this.logger.info("плагин выгружен");
	}

	/** Включает/выключает CSS-скрытие core Properties по настройке. */
	public applyHideCoreProperties(): void {
		document.body.classList.toggle(
			HIDE_CORE_PROPERTIES_CSS_CLASS,
			this.settings.hideCoreProperties,
		);
	}

	// --- Главы (ADR-002, C-CH) ----------------------------------------------------

/** Запись для открытой заметки (по имени файла). */
	private activeRecord(): ObjectRecord | undefined {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			return undefined;
		}
		return this.registry
			.all()
			.find((record) => record.path === file.basename);
	}

	/** Файл объекта по имени без расширения. */
	private fileByBasename(path: string): TFile | undefined {
		return this.app.vault
			.getMarkdownFiles()
			.find((file) => file.basename === path);
	}

	/**
	 * Диалог создания главы (C-CH-01).
	 *
	 * Книга и номер подставляются по контексту: если открыта глава — её книга и
	 * следующий свободный номер. `nameOnly` используется для соседней главы
	 * (C-CH-04), когда книга и номер уже вычислены.
	 */
	private openCreateChapter(
		options: {
			bookLinkpath?: string;
			position?: number;
			nameOnly?: boolean;
		} = {},
	): void {
		const records = this.registry.all();
		const books = booksForPicker(records);
		if (books.length === 0) {
			new Notice(
				"Meta KB: в хранилище нет книг. Создайте объект типа book — " +
					"глава всегда принадлежит книге (C-CH-05).",
				8000,
			);
			return;
		}

		const bookOptions = books.map((record) => ({
			linkpath: linkpathOf(record),
			label: bookLabel(record),
		}));

		const activeChapter =
			this.activeRecord()?.type === CHAPTER_TYPE ? this.activeRecord() : undefined;
		const bookLinkpath =
			options.bookLinkpath ??
			(activeChapter ? bookLinkpathOf(activeChapter) : "") ??
			"";
		const fallbackBook =
			bookLinkpath !== "" ? bookLinkpath : bookOptions[0].linkpath;

		const fixedBook = options.nameOnly
			? books.find((record) => linkpathOf(record) === fallbackBook)
			: undefined;

		new ChapterModal(this.app, {
			books: bookOptions,
			fixed:
				fixedBook && options.position !== undefined
					? {
							bookLinkpath: linkpathOf(fixedBook),
							bookLabel: bookLabel(fixedBook),
							position: options.position,
							existingTitle: findChapter(
								records,
								linkpathOf(fixedBook),
								options.position,
							)?.title,
						}
					: undefined,
			initialBook: fallbackBook,
			initialPosition:
				options.position ?? nextFreePosition(records, fallbackBook),
			lookup: (linkpath, position) => {
				const existing = findChapter(this.registry.all(), linkpath, position);
				return existing ? { title: existing.title } : null;
			},
			onSubmit: (value) => this.createChapter(value),
		}).open();
	}

	/**
	 * Создать главу или обновить существующую (C-CH-01, C-CH-02, C-CH-06).
	 *
	 * Глава с тем же «книга + номер» — это обновление, а не дубль: явное имя
	 * заменяет `title` и `aliases[0]`, пропущенное — сохраняет существующее.
	 */
	private async createChapter(value: {
		bookLinkpath: string;
		position: number;
		title: string;
	}): Promise<void> {
		const records = this.registry.all();
		const existing = findChapter(records, value.bookLinkpath, value.position);
		const title = resolveChapterTitle({
			position: value.position,
			requested: value.title,
			existing: existing?.title,
		});

		if (existing) {
			const file = this.fileByBasename(existing.path);
			if (!file) {
				new Notice(`Meta KB: файл главы ${existing.path} не найден.`);
				return;
			}
			const explicit = value.title.trim() !== "";
			try {
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					if (explicit) {
						fm["title"] = title;
						const aliases = Array.isArray(fm["aliases"]) ? fm["aliases"] : [];
						fm["aliases"] = [
							title,
							...aliases.filter(
								(item): item is string =>
									typeof item === "string" && item !== title,
							),
						];
					}
					fm["updated_at"] = new Date().toISOString();
				});
			} catch (err) {
				this.logger.error("не удалось обновить главу", err);
				new Notice(`Meta KB: не удалось обновить главу ${existing.path}`);
				return;
			}
			this.logger.info("глава обновлена", { path: existing.path, explicit });
			new Notice(
				explicit
					? `Meta KB: глава №${value.position} переименована в «${title}»`
					: `Meta KB: глава №${value.position} уже существует — открываю её`,
			);
			try {
				await this.app.workspace.getLeaf(true).openFile(file);
			} catch (err) {
				this.logger.warn("не удалось открыть главу", err);
			}
			return;
		}

		const book = records.find(
			(record) => linkpathOf(record) === value.bookLinkpath,
		);
		if (!book) {
			new Notice(`Meta KB: книга «${value.bookLinkpath}» не найдена.`);
			return;
		}

		const definedBy = findTypeDefinitionId(records, CHAPTER_TYPE);
		const plan = buildNewObject({ typeValue: CHAPTER_TYPE, title, definedBy });
		plan.frontmatter["chapter-of"] = candidatesToValue(
			[candidateOf(book)],
			false,
		);
		plan.frontmatter["position"] = value.position;

		const file = await this.createNote("", plan.filename, plan.frontmatter);
		if (!file) {
			return;
		}
		this.logger.info("глава создана", {
			path: file.basename,
			book: value.bookLinkpath,
			position: value.position,
		});
		new Notice(
			`Meta KB: создана глава «${title}» — ${bookLabel(book)}, №${value.position}`,
		);
		try {
			await this.app.workspace.getLeaf(true).openFile(file);
		} catch (err) {
			this.logger.warn("не удалось открыть главу", err);
		}
	}

	/**
	 * Переход к соседней главе (C-CH-03, C-CH-04).
	 *
	 * Если соседняя глава есть — открываем её; если нет — спрашиваем только имя
	 * и создаём.
	 */
	private async gotoNeighbourChapter(direction: "prev" | "next"): Promise<void> {
		const record = this.activeRecord();
		if (!record || record.type !== CHAPTER_TYPE) {
			new Notice("Meta KB: откройте главу, чтобы перейти к соседней.");
			return;
		}
		const position = positionOf(record);
		const target = neighbourPosition(position, direction);
		if (target === null) {
			new Notice(
				direction === "prev"
					? "Meta KB: это первая глава книги."
					: "Meta KB: у главы нет числового номера — соседняя не вычисляется.",
			);
			return;
		}
		const book = bookLinkpathOf(record);
		if (book === "") {
			new Notice("Meta KB: у главы не указана книга (chapter-of).");
			return;
		}
		const existing = findChapter(this.registry.all(), book, target);
		if (existing) {
			const file = this.fileByBasename(existing.path);
			if (file) {
				await this.app.workspace.getLeaf(true).openFile(file);
				return;
			}
		}
		this.openCreateChapter({ bookLinkpath: book, position: target, nameOnly: true });
	}

	/** Навигация по главам из интерфейса (C-CH-03): «←», «→», «↑ книга». */
	public async navigateChapter(direction: "prev" | "next" | "book"): Promise<void> {
		if (direction === "book") {
			await this.gotoChapterBook();
			return;
		}
		await this.gotoNeighbourChapter(direction);
	}

	/** Переход к книге открытой главы (C-CH-03, «↑ Книга»). */
	private async gotoChapterBook(): Promise<void> {
		const record = this.activeRecord();
		if (!record || record.type !== CHAPTER_TYPE) {
			new Notice("Meta KB: откройте главу, чтобы перейти к её книге.");
			return;
		}
		const book = bookLinkpathOf(record);
		const target = this.registry
			.all()
			.find((item) => linkpathOf(item) === book);
		if (!target) {
			new Notice("Meta KB: книга главы не найдена в Registry.");
			return;
		}
		const file = this.fileByBasename(target.path);
		if (!file) {
			new Notice(`Meta KB: файл книги ${target.path} не найден.`);
			return;
		}
		await this.app.workspace.getLeaf(true).openFile(file);
	}

	/**
	 * Пересчитать объём главы и её книги (C-CH-08, C-CH-10).
	 *
	 * `char-count` главы — знаки чистого текста её тела; `char-count` книги —
	 * сумма глав, `author-sheets` — по размеру авторского листа из настроек.
	 * Пишем только при изменении значения, иначе каждое сохранение порождало бы
	 * новую запись в файл.
	 */
	private async refreshChapterVolume(file: TFile): Promise<void> {
		const record = this.registry
			.all()
			.find((item) => item.path === file.basename);
		if (!record || record.type !== CHAPTER_TYPE) {
			return;
		}
		let body = "";
		try {
			body = await this.app.vault.cachedRead(file);
		} catch (err) {
			this.logger.warn("не удалось прочитать главу для подсчёта", err);
			return;
		}
		const charCount = countCleanChars(body);
		if (Number(record.props["char-count"]) !== charCount) {
			try {
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					fm["char-count"] = charCount;
				});
			} catch (err) {
				this.logger.warn("не удалось записать char-count главы", err);
			}
		}
		const book = bookLinkpathOf(record);
		if (book !== "") {
			this.scheduleBookVolume(book);
		}
	}

	/** Отложенный пересчёт книги: серия правок главы даёт одну запись. */
	private scheduleBookVolume(bookLinkpath: string): void {
		const existing = this.bookVolumeTimers.get(bookLinkpath);
		if (existing !== undefined) {
			window.clearTimeout(existing);
		}
		const timer = window.setTimeout(() => {
			this.bookVolumeTimers.delete(bookLinkpath);
			void this.refreshBookVolume(bookLinkpath);
		}, BOOK_VOLUME_DEBOUNCE_MS);
		this.bookVolumeTimers.set(bookLinkpath, timer);
	}

	/** Пересчитать объём книги по её главам (C-CH-09, C-CH-10). */
	private async refreshBookVolume(bookLinkpath: string): Promise<void> {
		const records = this.registry.all();
		const book = records.find((item) => linkpathOf(item) === bookLinkpath);
		if (!book) {
			return;
		}
		const file = this.fileByBasename(book.path);
		if (!file) {
			return;
		}

		const counts: number[] = [];
		for (const { record } of chaptersOf(records, bookLinkpath)) {
			const chapterFile = this.fileByBasename(record.path);
			if (!chapterFile) {
				continue;
			}
			try {
				counts.push(countCleanChars(await this.app.vault.cachedRead(chapterFile)));
			} catch (err) {
				this.logger.warn(`не удалось прочитать главу ${record.path}`, err);
			}
		}
		const volume = bookVolume(counts, this.settings.authorSheetChars);

		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				fm["char-count"] = volume.charCount;
				fm["author-sheets"] = volume.authorSheets;
				fm["updated_at"] = new Date().toISOString();
			});
		} catch (err) {
			this.logger.warn("не удалось записать объём книги", err);
			return;
		}
		this.logger.debug("объём книги пересчитан", {
			book: book.path,
			chapters: counts.length,
			charCount: volume.charCount,
			authorSheets: volume.authorSheets,
		});
	}

	// --- Окно команд -------------------------------------------------------------

	/** Журнал плагина: последние записи с уровнем и подробностями. */
	private openLog(): void {
		new LogModal(this.app, this.logger).open();
	}

	/**
	 * Проверка всего хранилища по правилам контракта.
	 *
	 * Отчёт показывает находки по файлам; сводка уходит в журнал, подробности —
	 * на уровне `debug`, чтобы не вытеснять из буфера рабочие записи.
	 */
	private openValidationReport(): void {
		const result = validateVault(this.registry.all(), {
			imagePaths: this.listImagePaths(),
		});
		const summary =
			result.findings.length === 0
				? "находок нет"
				: `ошибок ${result.errors}, предупреждений ${result.warnings}`;
		this.logger.info(`проверка хранилища: ${summary}`);
		for (const finding of result.findings) {
			this.logger.debug(
				`${finding.path} · ${finding.rule_key}: ${finding.message}`,
			);
		}
		new ValidationModal(this.app, result, () => this.openValidationReport()).open();
	}

	/**
	 * Сгруппированное окно команд (одна точка входа вместо поиска по палитре).
	 *
	 * Пункт «Удалить обёртку» показывается и тогда, когда открыта не обёртка —
	 * приглушённым, с пояснением условия: так видно, что команда есть, и
	 * понятно, почему она недоступна.
	 */
	private openCommands(): void {
		const activeFile = this.app.workspace.getActiveFile();
		const canDeleteWrapper = !!activeFile && this.isImageWrapper(activeFile);
		const isChapterOpen = this.activeRecord()?.type === CHAPTER_TYPE;

		new CommandsModal(this.app, [
			{
				title: "Объекты",
				items: [
					{
						label: "Создать объект",
						description: "Тип и название → {type}_{id}.md",
						icon: "file-plus",
						run: () => this.openCreateObject(),
					},
					{
						label: "Панель свойств",
						description: "Виджет метамодели в правой панели",
						icon: "panel-right",
						run: () => {
							void this.activatePropertiesView();
						},
					},
				],
			},
			{
				title: "Изображения",
				items: [
					{
						label: "Создать обёртку из файла",
						description: "Выбрать необёрнутое изображение хранилища",
						icon: "image-plus",
						run: () => {
							void this.openImageWrapperPicker();
						},
					},
					{
						label: "Обёртка из буфера обмена",
						description: "Картинка или файл-изображение из буфера",
						icon: "clipboard-paste",
						run: () => {
							void this.pasteImageWrapper();
						},
					},
					{
						label: "Удалить обёртку изображения",
						description: canDeleteWrapper
							? "Для открытой заметки-обёртки"
							: "Нужна открытая заметка-обёртка",
						icon: "trash-2",
						enabled: canDeleteWrapper,
						run: () => {
							const file = this.app.workspace.getActiveFile();
							if (file) {
								this.openDeleteWrapper(file);
							}
						},
					},
				],
			},
			{
				title: "Метамодель",
				items: [
					{
						label: "Инициализировать метамодель",
						description: "10 метатипов и определения 29 типов ядра",
						icon: "database",
						run: () => this.openBootstrap(),
					},
				],
			},
			{
				title: "Глава",
				items: [
					{
						label: "Создать главу",
						description: "Книга, номер, имя — имя можно пропустить",
						icon: "book-plus",
						run: () => this.openCreateChapter(),
					},
					{
						label: "Предыдущая глава",
						description: isChapterOpen
							? "Глава с номером на единицу меньше"
							: "Нужна открытая глава",
						icon: "arrow-left",
						enabled: isChapterOpen,
						run: () => {
							void this.gotoNeighbourChapter("prev");
						},
					},
					{
						label: "Следующая глава",
						description: isChapterOpen
							? "Нет — предложит создать"
							: "Нужна открытая глава",
						icon: "arrow-right",
						enabled: isChapterOpen,
						run: () => {
							void this.gotoNeighbourChapter("next");
						},
					},
					{
						label: "Открыть книгу главы",
						description: isChapterOpen ? "Переход к chapter-of" : "Нужна открытая глава",
						icon: "arrow-up",
						enabled: isChapterOpen,
						run: () => {
							void this.gotoChapterBook();
						},
					},
				],
			},
			{
				title: "Диагностика",
				items: [
					{
						label: "Проверить хранилище",
						description: "Находки по правилам контракта, по файлам",
						icon: "shield-check",
						run: () => this.openValidationReport(),
					},
					{
						label: "Показать лог",
						description: `Записи плагина (уровень: ${this.settings.logLevel})`,
						icon: "scroll-text",
						run: () => this.openLog(),
					},
				],
			},
		]).open();
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
			this.logger.warn("Meta KB: не удалось перестроить Registry", err);
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
				this.logger.warn(`Meta KB: не удалось выровнять тело ${file.path}`, err);
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
			// `image` в списке нет: обёртка создаётся только через поток выбора
			// изображения (C-IMG-04), иначе объект появится без `attachment` —
			// нарушение INV-24 в обход всей проверки «один файл — одна обёртка».
			types: CORE_TYPES.filter((type) => type.type_value !== "image").map(
				(type) => ({
					typeValue: type.type_value,
					label: type.label,
					group: type.group,
				}),
			),
			definitionLookup: (typeValue) =>
				findTypeDefinitionId(this.registry.all(), typeValue),
			folder: "",
			onSubmit: (typeValue, title) => this.createObject(typeValue, title),
		}).open();
	}

	private async createObject(typeValue: string, title: string): Promise<void> {
		// Защита на случай вызова в обход списка: `image` без файла-вложения
		// бессмысленен, поэтому уходим в обычный поток создания обёртки.
		if (typeValue === "image") {
			new Notice(
				"Meta KB: обёртка изображения создаётся командой «Create image " +
					"wrapper» — там выбирается файл (C-IMG-04).",
				8000,
			);
			await this.openImageWrapperPicker();
			return;
		}

		const definedBy = findTypeDefinitionId(this.registry.all(), typeValue);
		if (!definedBy) {
			new Notice(
				`Meta KB: определение типа «${typeValue}» не найдено — ` +
					"у объекта не будет defined_by. Выполните «Инициализировать метамодель».",
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
			this.logger.warn("Meta KB: не удалось открыть созданный файл", err);
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
	 *
	 * Если свободных файлов нет, диалог не открывается — но и тупика быть не
	 * должно: сначала пробуем буфер обмена (C-IMG-04 п.2), и только если там
	 * пусто, объясняем, почему создавать нечего.
	 */
	private async openImageWrapperPicker(): Promise<void> {
		const all = this.listImagePaths();
		const imagePaths = unwrappedImagePaths(all, this.attachmentIndex);
		if (imagePaths.length === 0) {
			const pasted = await this.pasteImageWrapper({ silent: true });
			if (pasted) {
				return;
			}
			new Notice(
				all.length === 0
					? "Meta KB: в хранилище нет изображений, и в буфере обмена тоже " +
							"пусто. Скопируйте картинку или добавьте файл-изображение."
					: `Meta KB: все изображения уже обёрнуты (${all.length}), а в буфере ` +
							"обмена нет картинки. Скопируйте изображение или создайте " +
							"обёртку из файла на диске.",
				9000,
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
			onFromClipboard: () => {
				void this.pasteImageWrapper();
			},
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
			this.logger.warn("Meta KB: не удалось открыть обёртку", err);
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

	// --- Вставка изображения из буфера обмена (C-IMG-04 п.2) ---------------------

	/**
	 * Изображение из системного буфера → файл в папке вложений → обёртка.
	 *
	 * Сначала пробуем Electron (`clipboard.readImage`) — только он отдаёт
	 * картинку, скопированную в другой программе. Если он недоступен (мобильные
	 * платформы), остаётся Web Clipboard API, которому нужно разрешение.
	 */
	private async readClipboardImage(): Promise<{
		bytes: ArrayBuffer;
		mime: string;
	} | null> {
		const req = (window as unknown as { require?: (id: string) => unknown })
			.require;
		if (typeof req === "function") {
			try {
				const electron = req("electron") as {
					clipboard?: {
						readImage(): { isEmpty(): boolean; toPNG(): Uint8Array };
					};
				};
				const image = electron?.clipboard?.readImage();
				if (image && !image.isEmpty()) {
					const png = image.toPNG();
					return {
						bytes: png.buffer.slice(
							png.byteOffset,
							png.byteOffset + png.byteLength,
						) as ArrayBuffer,
						mime: "image/png",
					};
				}
			} catch (err) {
				this.logger.warn("Meta KB: Electron clipboard недоступен", err);
			}
		}

		try {
			const clipboard = navigator.clipboard as unknown as {
				read?: () => Promise<ClipboardItem[]>;
			};
			const items = await clipboard?.read?.();
			for (const item of items ?? []) {
				const type = item.types.find((candidate) =>
					candidate.startsWith("image/"),
				);
				if (!type) {
					continue;
				}
				const blob = await item.getType(type);
				return { bytes: await blob.arrayBuffer(), mime: type };
			}
		} catch (err) {
			this.logger.warn("Meta KB: navigator.clipboard.read() недоступен", err);
		}
		return null;
	}

	/** Node-модуль в контексте Obsidian (desktop); null — недоступен. */
	private nodeRequire(id: string): unknown {
		const req = (window as unknown as { require?: (name: string) => unknown })
			.require;
		if (typeof req !== "function") {
			return null;
		}
		try {
			return req(id);
		} catch (err) {
			this.logger.warn(`Meta KB: модуль «${id}» недоступен`, err);
			return null;
		}
	}

	/** Существует ли локальный файл на диске. */
	private isLocalFile(path: string): boolean {
		const fs = this.nodeRequire("fs") as {
			existsSync?: (p: string) => boolean;
			statSync?: (p: string) => { isFile(): boolean };
		} | null;
		if (!fs?.existsSync || !fs.statSync) {
			return false;
		}
		try {
			return fs.existsSync(path) && fs.statSync(path).isFile();
		} catch {
			return false;
		}
	}

	/** Прочитать локальные файлы с диска как источники для импорта. */
	private readLocalImages(paths: string[]): ClipboardSource[] {
		const fs = this.nodeRequire("fs") as {
			readFileSync?: (p: string) => Uint8Array;
		} | null;
		if (!fs?.readFileSync) {
			return [];
		}
		const out: ClipboardSource[] = [];
		for (const path of paths) {
			try {
				out.push({
					bytes: toArrayBuffer(fs.readFileSync(path)),
					extension: fileExtension(path) || "png",
					name: fileBasename(path),
				});
			} catch (err) {
				this.logger.warn(`Meta KB: не удалось прочитать ${path}`, err);
			}
		}
		return out;
	}

	/**
	 * Пути из буфера, когда скопирован **файл** (проводник Windows).
	 *
	 * В этом случае растровой картинки в буфере нет: проводник кладёт список
	 * путей. Форматы перебираются от самого точного к запасным, потому что
	 * набор зависит от источника копирования.
	 */
	private clipboardFilePaths(clipboard: ElectronClipboard): string[] {
		const out: string[] = [];
		const readBuffer = (format: string): Uint8Array | null => {
			try {
				return clipboard.readBuffer?.(format) ?? null;
			} catch {
				return null;
			}
		};
		const readText = (format: string): string => {
			try {
				return String(clipboard.read?.(format) ?? "");
			} catch {
				return "";
			}
		};

		const fileNameW = readBuffer("FileNameW");
		if (fileNameW) {
			out.push(...parseFileNameW(fileNameW));
		}
		const fileName = readBuffer("FileName");
		if (fileName) {
			out.push(...parsePathList(new TextDecoder().decode(fileName)));
		}
		const uriList = readBuffer("text/uri-list");
		if (uriList) {
			out.push(...parseUriList(new TextDecoder().decode(uriList)));
		}
		out.push(...parsePathList(readText("text/plain")));
		return out;
	}

	/**
	 * Что лежит в буфере обмена — в порядке приоритета.
	 *
	 * 1. Растровое изображение (скопировано из браузера/редактора) — его
	 *    отдаёт `readClipboardImage`.
	 * 2. Файлы из проводника (`FileNameW`, `text/uri-list`, `text/plain`):
	 *    растровой картинки там нет, поэтому файл читается с диска.
	 */
	private async readClipboardSources(): Promise<ClipboardSource[]> {
		const bitmap = await this.readClipboardImage();
		if (bitmap) {
			return [
				{
					bytes: bitmap.bytes,
					extension: clipboardImageExtension(bitmap.mime) ?? "png",
				},
			];
		}

		const electron = this.nodeRequire("electron") as {
			clipboard?: ElectronClipboard;
		} | null;
		const clipboard = electron?.clipboard;
		if (clipboard) {
			const local = this.readLocalImages(
				pickImageFilePaths(this.clipboardFilePaths(clipboard), (path) =>
					this.isLocalFile(path),
				),
			);
			if (local.length > 0) {
				return local;
			}
		}

		// Запасной путь: Web Clipboard API отдаёт `text/uri-list` для файлов.
		try {
			const api = navigator.clipboard as unknown as {
				read?: () => Promise<ClipboardItem[]>;
			};
			const items = await api?.read?.();
			const candidates: string[] = [];
			for (const item of items ?? []) {
				if (!item.types.includes("text/uri-list")) {
					continue;
				}
				const blob = await item.getType("text/uri-list");
				candidates.push(...parseUriList(await blob.text()));
			}
			return this.readLocalImages(
				pickImageFilePaths(candidates, (path) => this.isLocalFile(path)),
			);
		} catch (err) {
			this.logger.warn("Meta KB: navigator.clipboard.read() недоступен", err);
		}
		return [];
	}

	/**
	 * Папка вложений: настройка Obsidian `attachmentFolderPath`, а если её
	 * прочитать не удалось — самая населённая папка с изображениями.
	 */
	private attachmentFolder(): string {
		const vault = this.app.vault as unknown as {
			getConfig?: (key: string) => unknown;
		};
		let config: unknown;
		try {
			config = vault.getConfig?.("attachmentFolderPath");
		} catch {
			config = undefined;
		}
		const activeFolder = this.app.workspace.getActiveFile()?.parent?.path ?? "";
		if (config === undefined || config === null) {
			return guessAttachmentFolder(this.listImagePaths());
		}
		return resolveAttachmentFolder(config, activeFolder);
	}

	/**
	 * Создать обёртки из содержимого буфера обмена (C-IMG-04 п.2).
	 *
	 * Растровая картинка сохраняется как `Pasted image ….png`, файл из
	 * проводника — под исходным именем (уникализируется при совпадении).
	 * Возвращает `true`, если создана хотя бы одна обёртка.
	 */
	private async pasteImageWrapper(
		options: { silent?: boolean } = {},
	): Promise<boolean> {
		const sources = await this.readClipboardSources();
		if (sources.length === 0) {
			if (!options.silent) {
				new Notice(
					"Meta KB: в буфере обмена нет изображения. Скопируйте картинку " +
						"или файл-изображение и повторите команду.",
					8000,
				);
			}
			return false;
		}

		const folder = this.attachmentFolder();
		await this.ensureFolder(folder);
		const exists = (candidate: string): boolean =>
			this.app.vault.getAbstractFileByPath(candidate) !== null;

		const created: SuggestCandidate[] = [];
		for (const source of sources) {
			const path = source.name
				? buildImportedImagePath({ folder, sourceName: source.name, exists })
				: buildPastedImagePath({
						folder,
						now: new Date(),
						extension: source.extension,
						exists,
					});
			try {
				await this.app.vault.createBinary(path, source.bytes);
			} catch (err) {
				this.logger.error("Meta KB: не удалось сохранить изображение из буфера", err);
				new Notice(`Meta KB: не удалось сохранить ${path}`);
				continue;
			}
			const candidate = await this.ensureImageWrapper(path);
			if (!candidate) {
				new Notice(
					`Meta KB: изображение сохранено (${path}), но обёртку создать ` +
						"не удалось.",
					8000,
				);
				continue;
			}
			created.push(candidate);
		}

		if (created.length === 0) {
			return false;
		}
		new Notice(
			created.length === 1
				? `Meta KB: обёртка создана из буфера обмена: ${created[0].title}`
				: `Meta KB: создано обёрток из буфера обмена: ${created.length}`,
			8000,
		);

		const dest = this.app.metadataCache.getFirstLinkpathDest(
			created[0].linkpath,
			"",
		);
		if (dest) {
			try {
				await this.app.workspace.getLeaf(true).openFile(dest);
			} catch (err) {
				this.logger.warn("Meta KB: не удалось открыть обёртку", err);
			}
		}
		return true;
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
			this.logger.warn("Meta KB: не удалось отрисовать embed обёртки", err);
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
			this.logger.error("Meta KB: не удалось удалить файл", err);
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
				"Команда «Инициализировать метамодель» создаст метатипы и определения типов.",
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
			this.logger.warn(`Meta KB: createFolder(${path})`, err);
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
			this.logger.error("Meta KB: не удалось создать файл", err);
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
		this.settings.logLevel = normalizeLogLevel(this.settings.logLevel);
		this.settings.logToConsole = this.settings.logToConsole !== false;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
