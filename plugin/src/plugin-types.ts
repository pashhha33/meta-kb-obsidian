import type { Plugin } from "obsidian";
import type { MetaKBSettings } from "./settings";
import type { Registry } from "./core/registry";
import type { AttachmentIndex } from "./core/attachment";

export interface MetaKBPluginAPI extends Plugin {
	settings: MetaKBSettings;
	applyHideCoreProperties(): void;
	saveSettings(): Promise<void>;
	/** Индекс объектов vault (id → ObjectRecord); пересобирается на изменения. */
	getRegistry(): Registry;
	/** Индекс «файл-вложение → обёртка image» (C-IMG-05). */
	getAttachmentIndex(): AttachmentIndex;
	/** Пути всех изображений хранилища. */
	listImagePaths(): string[];
	/** URL файла для превью (getResourcePath); null — файл не найден. */
	resourcePathFor(path: string): string | null;
}
