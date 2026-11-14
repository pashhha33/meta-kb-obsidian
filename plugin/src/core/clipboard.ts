/**
 * Вставка изображения из буфера обмена (C-IMG-04 п.2).
 *
 * Здесь только чистая часть: имя файла, папка вложений и расширение по MIME.
 * Само чтение буфера — в main.ts: это Electron/Web API, которое нельзя
 * проверить вне Obsidian.
 */
import { normalizeAttachmentPath } from "./attachment";

/** MIME → расширение файла. `null` — не изображение. */
export function clipboardImageExtension(mime: string): string | null {
	const map: Record<string, string> = {
		"image/png": "png",
		"image/jpeg": "jpg",
		"image/jpg": "jpg",
		"image/gif": "gif",
		"image/webp": "webp",
		"image/bmp": "bmp",
		"image/svg+xml": "svg",
	};
	return map[mime.trim().toLowerCase()] ?? null;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * Метка времени в имени вставленного файла — **локальное** время, как это
 * делает сам Obsidian (`Pasted image 20261114184500.png`).
 */
export function pastedImageStamp(now: Date): string {
	return (
		`${now.getFullYear()}` +
		`${pad(now.getMonth() + 1)}` +
		`${pad(now.getDate())}` +
		`${pad(now.getHours())}` +
		`${pad(now.getMinutes())}` +
		`${pad(now.getSeconds())}`
	);
}

/**
 * Путь для вставленного изображения с учётом занятых имён.
 *
 * Формат повторяет Obsidian, чтобы вложения из буфера не выбивались из
 * остальных файлов vault. При совпадении секунды добавляется « 1», « 2», …
 */
export function buildPastedImagePath(opts: {
	/** Папка вложений; '' — корень хранилища. */
	folder: string;
	now: Date;
	/** Расширение без точки. */
	extension: string;
	/** Занят ли путь в vault. */
	exists: (path: string) => boolean;
}): string {
	const folder = normalizeAttachmentPath(opts.folder);
	const extension = opts.extension.trim().replace(/^\./, "") || "png";
	const base = `Pasted image ${pastedImageStamp(opts.now)}`;
	for (let index = 0; index < 1000; index += 1) {
		const name = index === 0 ? base : `${base} ${index}`;
		const filename = `${name}.${extension}`;
		const path = folder === "" ? filename : `${folder}/${filename}`;
		if (!opts.exists(path)) {
			return path;
		}
	}
	throw new Error("Meta KB: не удалось подобрать свободное имя для изображения");
}

/**
 * Папка вложений из настройки Obsidian `attachmentFolderPath`.
 *
 * Значения этой настройки: `''` — корень хранилища, `'./'` — папка текущей
 * заметки, иначе — путь внутри хранилища.
 */
export function resolveAttachmentFolder(
	configValue: unknown,
	activeFileFolder: string,
): string {
	const raw = typeof configValue === "string" ? configValue.trim() : "";
	if (raw === "") {
		return "";
	}
	if (raw === "./" || raw === ".") {
		return normalizeAttachmentPath(activeFileFolder);
	}
	return normalizeAttachmentPath(raw);
}

/**
 * Папка вложений, если настройку Obsidian прочитать не удалось: берём ту, где
 * уже лежит больше всего изображений. Так вставка не создаёт новую папку
 * рядом с существующей.
 */
export function guessAttachmentFolder(imagePaths: string[]): string {
	const counts = new Map<string, number>();
	for (const raw of imagePaths) {
		const path = normalizeAttachmentPath(raw);
		const slash = path.lastIndexOf("/");
		if (slash === -1) {
			continue; // файл в корне — папку не подсказывает
		}
		const folder = path.slice(0, slash);
		counts.set(folder, (counts.get(folder) ?? 0) + 1);
	}
	let best = "";
	let bestCount = 0;
	for (const [folder, count] of counts) {
		if (count > bestCount) {
			best = folder;
			bestCount = count;
		}
	}
	return best;
}