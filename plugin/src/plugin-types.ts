import type { Plugin } from "obsidian";
import type { MetaKBSettings } from "./settings";
import type { Registry } from "./core/registry";

export interface MetaKBPluginAPI extends Plugin {
	settings: MetaKBSettings;
	applyHideCoreProperties(): void;
	saveSettings(): Promise<void>;
	/** Индекс объектов vault (id → ObjectRecord); пересобирается на изменения. */
	getRegistry(): Registry;
}
