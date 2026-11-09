import { App, PluginSettingTab, Setting } from "obsidian";
import type MetaKBPlugin from "./main";

/** Режим отображения created_at / updated_at — ontology.md §4.1. */
export type DatetimeDisplay = "local" | "utc" | "fixed-offset";

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

function pad(n: number): string {
        return String(n).padStart(2, "0");
}

/** "+03:00" / "-0130" → минуты; null, если формат повреждён. */
export function parseDatetimeOffset(offset: string): number | null {
        const match = /^([+-])(\d{2}):?(\d{2})$/.exec(offset.trim());
        if (!match) {
                return null;
        }
        const hours = parseInt(match[2], 10);
        const minutes = parseInt(match[3], 10);
        if (Number.isNaN(hours) || Number.isNaN(minutes)) {
                return null;
        }
        const sign = match[1] === "-" ? -1 : 1;
        return sign * (hours * 60 + minutes);
}

function formatAsUtcParts(d: Date): string {
        return (
                `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
                `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
        );
}

/**
 * Человекочитаемое отображение datetime по настройкам.
 * Хранение — всегда UTC (ADR-004); отображение — local / utc / fixed-offset.
 * Битые значения показываются как есть, без исключений.
 */
export function formatDatetime(iso: unknown, settings: MetaKBSettings): string {
        if (typeof iso !== "string" || iso.trim() === "") {
                return "—";
        }
        const raw = iso.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                return raw; // date без времени — не форматируем
        }

        // Значения хранятся в UTC: без явного offset считаем строку UTC.
        const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
        let normalized = raw.replace(" ", "T");
        if (!hasTimezone) {
                normalized += "Z";
        }
        const d = new Date(normalized);
        if (isNaN(d.getTime())) {
                return raw; // битое значение — показываем как есть
        }

        switch (settings.datetimeDisplay) {
                case "utc":
                        return `${formatAsUtcParts(d)} UTC`;
                case "fixed-offset": {
                        const offsetMinutes = parseDatetimeOffset(settings.datetimeOffset);
                        if (offsetMinutes === null) {
                                return formatAsUtcParts(d);
                        }
                        const shifted = new Date(d.getTime() + offsetMinutes * 60000);
                        const sign = offsetMinutes < 0 ? "-" : "+";
                        const abs = Math.abs(offsetMinutes);
                        const offsetText = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
                        return `${formatAsUtcParts(shifted)} ${offsetText}`;
                }
                case "local":
                default:
                        return (
                                `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
                                `${pad(d.getHours())}:${pad(d.getMinutes())}`
                        );
        }
}

/** Вкладка настроек плагина. */
export class MetaKBSettingTab extends PluginSettingTab {
        private readonly plugin: MetaKBPlugin;

        constructor(app: App, plugin: MetaKBPlugin) {
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
