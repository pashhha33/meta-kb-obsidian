import type { Plugin } from "obsidian";

/** Дублируем форму настроек здесь, чтобы не импортировать settings.ts. */
export interface MetaKBSettings {
        hideCoreProperties: boolean;
        datetimeDisplay: "local" | "utc" | "fixed-offset";
        datetimeOffset: string;
        booleanWriteFalse: boolean;
}

export interface MetaKBPluginAPI extends Plugin {
        settings: MetaKBSettings;
        applyHideCoreProperties(): void;
        saveSettings(): Promise<void>;
}