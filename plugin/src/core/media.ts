/**
 * Кандидаты для свойств `media` / `list<media>` (INV-23).
 *
 * Значение такого свойства — **ссылка на объект `image`**, а не путь к файлу.
 * Поэтому галерея предлагает два вида пунктов:
 *
 * - `wrapper` — существующая обёртка: выбор сразу даёт готовую ссылку;
 * - `file` — изображение без обёртки: из него сначала создаётся обёртка
 *   (C-IMG-04), и только потом оно попадает в значение.
 *
 * Чистая логика: без импортов obsidian.
 */
import type {
	AttachmentIndex,
	AttachmentRecord,
} from "./attachment";
import {
	isImagePath,
	normalizeAttachmentPath,
	titleFromPath,
	unwrappedImagePaths,
} from "./attachment";
import type { SuggestCandidate } from "./suggest";

/** Откуда берётся значение: готовая обёртка или файл под неё. */
export type MediaPickKind = "wrapper" | "file";

export interface MediaPickItem {
	kind: MediaPickKind;
	/** `wrapper` — `{type}_{id}`; `file` — путь к изображению. */
	value: string;
	title: string;
	/** Путь к файлу для превью (у обёртки — её `attachment`). */
	previewPath: string;
	/** `id` обёртки (только `wrapper`). */
	id?: string;
	/** Пометка под названием. */
	note?: string;
}

/** Свойства, значение которых — ссылка на `image`. */
export function isMediaValueType(valueType: string): boolean {
	return valueType === "media" || valueType === "list<media>";
}

/** Свойства-списки ссылок на `image`. */
export function isMediaListValueType(valueType: string): boolean {
	return valueType === "list<media>";
}

/**
 * Пункты галереи: сначала существующие обёртки, затем свободные изображения.
 *
 * Порядок важен: обёртки — готовый результат, файлы — заготовка, для которой
 * ещё нужно создать объект. Обёртка без валидного `attachment` в галерею не
 * попадает: показывать нечего (и это нарушение INV-24).
 */
export function buildMediaPickItems(opts: {
	/** Объекты Registry (берутся только `type: image`). */
	records: AttachmentRecord[];
	/** Все изображения хранилища (пути). */
	imagePaths: string[];
	index: AttachmentIndex;
}): MediaPickItem[] {
	const items: MediaPickItem[] = [];
	for (const record of opts.records) {
		if (record.type !== "image" || record.id === "") {
			continue;
		}
		const attachment = normalizeAttachmentPath(record.props?.["attachment"]);
		if (attachment === "" || !isImagePath(attachment)) {
			continue;
		}
		items.push({
			kind: "wrapper",
			value: `image_${record.id}`,
			title: record.title || attachment,
			previewPath: attachment,
			id: record.id,
		});
	}
	for (const path of unwrappedImagePaths(opts.imagePaths, opts.index)) {
		items.push({
			kind: "file",
			value: path,
			title: titleFromPath(path) || path,
			previewPath: path,
			note: "создать обёртку",
		});
	}
	return items;
}

/** Пункт галереи → кандидат для записи значения (канонической ссылки). */
export function mediaItemToCandidate(item: MediaPickItem): SuggestCandidate {
	return {
		id: item.id ?? item.value,
		title: item.title,
		type: "image",
		linkpath: item.value,
	};
}