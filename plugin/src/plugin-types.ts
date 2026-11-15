import type { Plugin } from "obsidian";
import type { MetaKBSettings } from "./settings";
import type { Registry } from "./core/registry";
import type { AttachmentIndex } from "./core/attachment";
import type { SuggestCandidate } from "./core/suggest";
import type { Logger } from "./core/logging";

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
	/**
	 * Ссылка на обёртку файла: существующую или созданную на месте
	 * (INV-23, C-IMG-04). null — создать не удалось.
	 */
	ensureImageWrapper(attachment: string): Promise<SuggestCandidate | null>;
	/** Журнал плагина (уровни, буфер, вывод в консоль). */
	getLogger(): Logger;
	/** Применить настройки логирования после их изменения. */
	applyLogSettings(): void;
	/**
	 * Навигация по главам (C-CH-03): «←» предыдущая, «→» следующая,
	 * «book» — книга главы. Для не-главы ничего не делает.
	 */
	navigateChapter(direction: "prev" | "next" | "book"): Promise<void>;
	/**
	 * Превью обёртки для карточного представления (C-IMG-02).
	 * `null` — у обёртки нет картинки или файл не найден.
	 */
	getImageWrapperPreview(wrapperId: string): Promise<{
		url: string;
		width: number;
		height: number;
		label: string;
	} | null>;
}
