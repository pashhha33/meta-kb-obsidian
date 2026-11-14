import { App, PluginSettingTab, Setting } from "obsidian";
import type { MetaKBPluginAPI } from "./plugin-types";
import type { DatetimeDisplay } from "./core/datetime";
import {
	clampThumbnailSize,
	normalizeThumbnailAspect,
	THUMBNAIL_ASPECT_LABELS,
	THUMBNAIL_ASPECTS,
	THUMBNAIL_SIZE_DEFAULT,
	THUMBNAIL_SIZE_MAX,
	THUMBNAIL_SIZE_MIN,
} from "./core/thumbnails";
import type { ThumbnailAspect } from "./core/thumbnails";
import {
	DEFAULT_LOG_LEVEL,
	LOG_LEVELS,
	LOG_LEVEL_LABELS,
	normalizeLogLevel,
} from "./core/logging";
import type { LogLevel } from "./core/logging";

export { formatDatetime, parseDatetimeOffset } from "./core/datetime";
export type { DatetimeDisplay, DatetimeFormatOptions } from "./core/datetime";

/**
 * Настройки плагина (AGENT-TASK.md: hideCoreProperties, datetimeDisplay,
 * booleanWriteFalse; datetimeOffset — из metamodel/plugin-settings.md,
 * нужен режиму fixed-offset).
 */
export interface MetaKBSettings {
	/** Скрыть встроенную панель Properties (ADR-006). Default: true. */
	hideCoreProperties: boolean;
	/** Формат отображения datetime в виджете. Default: local. */
	datetimeDisplay: DatetimeDisplay;
	/** Смещение для режима fixed-offset, например "+03:00". */
	datetimeOffset: string;
	/**
	 * Писать `false` при выключении boolean-переключателя;
	 * иначе удалять ключ (пустое значение = отсутствие ключа, §4.4 онтологии).
	 */
	booleanWriteFalse: boolean;
	/** Знаков в авторском листе — делитель для `book.author-sheets`. */
	authorSheetChars: number;
	/**
	 * Папка для определений метамодели (метатипы и определения типов),
	 * создаваемых командой Bootstrap. `""` — корень хранилища.
	 */
	definitionsFolder: string;
	/** Предлагать bootstrap, если метамодель в хранилище не инициализирована. */
	bootstrapOffer: boolean;
	/** Размер миниатюры в галерее изображений, px. */
	thumbnailSize: number;
	/** Пропорции миниатюр галереи. */
	thumbnailAspect: ThumbnailAspect;
	/**
	 * Подробность лога. `silent` — не писать ничего; `error` — только ошибки;
	 * `warn` — ошибки и предупреждения; `info` — плюс сообщения; `debug` — всё.
	 */
	logLevel: LogLevel;
	/** Дублировать записи лога в консоль Obsidian (DevTools). */
	logToConsole: boolean;
	/**
	 * Подсказывать обёртку при наведении на изображение в теле заметки
	 * (C-IMG-03): «открыть обёртку» или «создать обёртку».
	 */
	suggestWrapImages: boolean;
}

export const DEFAULT_SETTINGS: MetaKBSettings = {
	hideCoreProperties: true,
	datetimeDisplay: "local",
	datetimeOffset: "+00:00",
	booleanWriteFalse: true,
	authorSheetChars: 40000,
	definitionsFolder: "_meta",
	bootstrapOffer: true,
	thumbnailSize: THUMBNAIL_SIZE_DEFAULT,
	thumbnailAspect: "square",
	logLevel: DEFAULT_LOG_LEVEL,
	logToConsole: true,
	suggestWrapImages: true,
};

/** Вкладка настроек плагина. */
export class MetaKBSettingTab extends PluginSettingTab {
	private readonly plugin: MetaKBPluginAPI;

	constructor(app: App, plugin: MetaKBPluginAPI) {
		super(app, plugin);
		this.plugin = plugin;
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Meta Knowledge Base" });

		new Setting(containerEl)
			.setName("Скрывать встроенные Properties")
			.setDesc(
				"Прячет панель свойств Obsidian в заметках (ADR-006). " +
					"Виджет плагина «Meta KB Properties» остаётся.",
			)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.hideCoreProperties);
				toggle.onChange(async (value) => {
					this.plugin.settings.hideCoreProperties = value;
					await this.plugin.saveSettings();
					this.plugin.applyHideCoreProperties();
				});
			});

		new Setting(containerEl)
			.setName("Формат отображения дат")
			.setDesc("Как показывать created_at / updated_at в виджете.")
			.addDropdown((dropdown) => {
				dropdown.addOptions({
					local: "Локальное время",
					utc: "UTC",
					"fixed-offset": "Фиксированное смещение",
				});
				dropdown.setValue(this.plugin.settings.datetimeDisplay);
				dropdown.onChange(async (value) => {
					this.plugin.settings.datetimeDisplay = value as DatetimeDisplay;
					await this.plugin.saveSettings();
					this.notifySettingsChanged();
				});
			});

		new Setting(containerEl)
			.setName("Смещение для fixed-offset")
			.setDesc(
				'Например "+03:00". Используется только в режиме фиксированного смещения.',
			)
			.addText((text) => {
				text.setPlaceholder("+03:00");
				text.setValue(this.plugin.settings.datetimeOffset);
				text.onChange(async (value) => {
					this.plugin.settings.datetimeOffset = value.trim() || "+00:00";
					await this.plugin.saveSettings();
					this.notifySettingsChanged();
				});
			});

		new Setting(containerEl)
			.setName("Boolean: писать false")
			.setDesc(
				"При выключении переключателя писать false в frontmatter; " +
					"иначе — удалять ключ (пустое значение = отсутствие ключа).",
			)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.booleanWriteFalse);
				toggle.onChange(async (value) => {
					this.plugin.settings.booleanWriteFalse = value;
					await this.plugin.saveSettings();
					this.notifySettingsChanged();
				});
			});

		new Setting(containerEl)
			.setName("Знаков в авторском листе")
			.setDesc(
				"Делитель для вычисляемого поля book.author-sheets. " +
					"По умолчанию 40000 (metamodel/plugin-settings.md).",
			)
			.addText((text) => {
				text.inputEl.type = "number";
				text.setValue(String(this.plugin.settings.authorSheetChars));
				text.onChange(async (value) => {
					const parsed = Number.parseInt(value, 10);
					if (!Number.isFinite(parsed) || parsed <= 0) {
						return;
					}
					this.plugin.settings.authorSheetChars = parsed;
					await this.plugin.saveSettings();
					this.notifySettingsChanged();
				});
			});

		new Setting(containerEl)
			.setName("Папка определений")
			.setDesc(
				"Куда команда «Инициализировать метамодель» кладёт метатипы и определения " +
					'типов. Пустое значение — корень хранилища. По умолчанию "_meta".',
			)
			.addText((text) => {
				text.setPlaceholder("_meta");
				text.setValue(this.plugin.settings.definitionsFolder);
				text.onChange(async (value) => {
					this.plugin.settings.definitionsFolder = value.trim();
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Предлагать bootstrap")
			.setDesc(
				"Показывать подсказку при запуске, если в хранилище нет 10 метатипов " +
					"(metamodel/bootstrap.md).",
			)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.bootstrapOffer);
				toggle.onChange(async (value) => {
					this.plugin.settings.bootstrapOffer = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Размер миниатюр")
			.setDesc(
				`Сторона миниатюры в галерее изображений, ` +
					`${THUMBNAIL_SIZE_MIN}–${THUMBNAIL_SIZE_MAX} px ` +
					`(по умолчанию ${THUMBNAIL_SIZE_DEFAULT}).`,
			)
			.addText((text) => {
				text.inputEl.type = "number";
				text.setValue(String(this.plugin.settings.thumbnailSize));
				text.onChange(async (value) => {
					const size = clampThumbnailSize(value);
					if (size === this.plugin.settings.thumbnailSize) {
						return;
					}
					this.plugin.settings.thumbnailSize = size;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Пропорции миниатюр")
			.setDesc(
				"«Квадрат» обрезает картинку по центру — сетка выглядит ровно; " +
					"«как в файле» сохраняет исходные пропорции.",
			)
			.addDropdown((dropdown) => {
				for (const aspect of THUMBNAIL_ASPECTS) {
					dropdown.addOption(aspect, THUMBNAIL_ASPECT_LABELS[aspect]);
				}
				dropdown.setValue(this.plugin.settings.thumbnailAspect);
				dropdown.onChange(async (value) => {
					this.plugin.settings.thumbnailAspect =
						normalizeThumbnailAspect(value);
					await this.plugin.saveSettings();
				});
			});

		// --- Изображения: подсказка обёртки (C-IMG-03) -----------------------

		new Setting(containerEl)
			.setName("Подсказывать обёртку при наведении")
			.setDesc(
				"Над изображением в теле заметки появляется значок: «открыть " +
					"обёртку», если она уже есть, иначе «создать обёртку».",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.suggestWrapImages)
					.onChange(async (value) => {
						this.plugin.settings.suggestWrapImages = value;
						await this.plugin.saveSettings();
						this.notifySettingsChanged();
					}),
			);

		// --- Логирование -----------------------------------------------------

		new Setting(containerEl).setName("Логирование").setHeading();

		new Setting(containerEl)
			.setName("Подробность лога")
			.setDesc(
				"Что писать в журнал плагина. Влияет и на консоль, и на команду " +
					"«Показать лог». «Всё, включая отладку» полезно при разборе проблем.",
			)
			.addDropdown((dropdown) => {
				for (const level of LOG_LEVELS) {
					dropdown.addOption(level, LOG_LEVEL_LABELS[level]);
				}
				dropdown.setValue(this.plugin.settings.logLevel);
				dropdown.onChange(async (value) => {
					this.plugin.settings.logLevel = normalizeLogLevel(value);
					this.plugin.applyLogSettings();
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Дублировать в консоль")
			.setDesc(
				"Писать записи в консоль Obsidian (Ctrl+Shift+I → Console). Если " +
					"выключено, журнал остаётся доступен только командой «Показать лог».",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.logToConsole)
					.onChange(async (value) => {
						this.plugin.settings.logToConsole = value;
						this.plugin.applyLogSettings();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Очистить журнал")
			.setDesc("Удалить накопленные записи из памяти (файлы не затрагиваются).")
			.addButton((button) =>
				button.setButtonText("Очистить").onClick(() => {
					this.plugin.getLogger().clear();
					this.notifySettingsChanged();
				}),
			);
	}

	private notifySettingsChanged(): void {
		this.plugin.app.workspace.trigger("meta-kb:settings-changed");
	}
}
