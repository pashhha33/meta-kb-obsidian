import { App, PluginSettingTab, Setting } from "obsidian";
import type { MetaKBPluginAPI } from "./plugin-types";
import type { DatetimeDisplay } from "./core/datetime";

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
}

export const DEFAULT_SETTINGS: MetaKBSettings = {
	hideCoreProperties: true,
	datetimeDisplay: "local",
	datetimeOffset: "+00:00",
	booleanWriteFalse: true,
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
	}

	private notifySettingsChanged(): void {
		this.plugin.app.workspace.trigger("meta-kb:settings-changed");
	}
}
