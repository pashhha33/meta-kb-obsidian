/**
 * Вставка изображения из буфера обмена (C-IMG-04 п.2).
 *
 * Здесь только чистая часть: разбор содержимого буфера, имя файла, папка
 * вложений, расширение по MIME. Само чтение буфера и файлов — в main.ts: это
 * Electron/Node API, которое нельзя проверить вне Obsidian.
 *
 * Буфер обмена отдаёт картинку по-разному:
 *
 * - скопирована из браузера или редактора → растровое изображение (CF_BITMAP);
 * - скопирован **файл** в проводнике → список путей (CF_HDROP в форматах
 *   `FileNameW`/`FileName`, плюс `text/uri-list`). Растровой картинки в этом
 *   случае нет вообще, поэтому изображение приходится читать с диска.
 */
import { fileBasename, isImagePath, normalizeAttachmentPath } from "./attachment";

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

/** Свободный путь в папке: `name.ext`, при занятости — `name 1.ext`, `name 2.ext`, … */
function uniqueAttachmentPath(
	folder: string,
	base: string,
	extension: string,
	exists: (path: string) => boolean,
): string {
	const dir = normalizeAttachmentPath(folder);
	const ext = extension.trim().replace(/^\./, "") || "png";
	for (let index = 0; index < 1000; index += 1) {
		const name = index === 0 ? base : `${base} ${index}`;
		const filename = `${name}.${ext}`;
		const path = dir === "" ? filename : `${dir}/${filename}`;
		if (!exists(path)) {
			return path;
		}
	}
	throw new Error("Meta KB: не удалось подобрать свободное имя для изображения");
}

/**
 * Путь для вставленного растрового изображения (`Pasted image <штамп>.ext`).
 *
 * Формат повторяет Obsidian, чтобы вложения из буфера не выбивались из
 * остальных файлов vault.
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
	return uniqueAttachmentPath(
		opts.folder,
		`Pasted image ${pastedImageStamp(opts.now)}`,
		opts.extension,
		opts.exists,
	);
}

/**
 * Путь для файла-изображения, скопированного в проводнике: сохраняем исходное
 * имя (оно обычно осмысленное), уникализируем только при совпадении.
 */
export function buildImportedImagePath(opts: {
	folder: string;
	/** Имя исходного файла (допускается путь). */
	sourceName: string;
	exists: (path: string) => boolean;
}): string {
	const name = fileBasename(opts.sourceName);
	const dot = name.lastIndexOf(".");
	const base = dot > 0 ? name.slice(0, dot) : name;
	const extension = dot > 0 ? name.slice(dot + 1) : "png";
	return uniqueAttachmentPath(
		opts.folder,
		base === "" ? "image" : base,
		extension,
		opts.exists,
	);
}

/**
 * Пути из формата Windows `FileNameW`: UTF-16LE с разделителем NUL.
 *
 * Проводник складывает сюда список скопированных файлов.
 */
export function parseFileNameW(buffer: Uint8Array): string[] {
	let text = "";
	for (let index = 0; index + 1 < buffer.length; index += 2) {
		const code = buffer[index] | (buffer[index + 1] << 8);
		text += String.fromCharCode(code);
	}
	return text
		.split("\u0000")
		.map((item) => item.trim())
		.filter((item) => item !== "");
}

/** `file:///C:/path/a.png` → `C:/path/a.png`. Не-файловые URI отбрасываются. */
function uriToPath(value: string): string {
	if (!value.toLowerCase().startsWith("file://")) {
		return "";
	}
	let path = value.slice("file://".length);
	// `file://server/share/…` — UNC-путь: сетевое имя, а не локальный файл.
	if (!path.startsWith("/")) {
		return "";
	}
	if (/^\/[A-Za-z]:/.test(path)) {
		path = path.slice(1); // /C:/… → C:/…
	}
	try {
		return decodeURIComponent(path);
	} catch {
		return path;
	}
}

/** Пути из `text/uri-list`: по одному на строку, `#` — комментарий. */
export function parseUriList(text: string): string[] {
	const out: string[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line === "" || line.startsWith("#")) {
			continue;
		}
		const path = uriToPath(line);
		if (path !== "") {
			out.push(path);
		}
	}
	return out;
}

/** Кандидаты в пути из свободного текста: по одному на строку, кавычки снимаются. */
export function parsePathList(text: string): string[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim().replace(/^"(.*)"$/, "$1"))
		.filter((line) => line !== "");
}

/**
 * Оставить только существующие файлы-изображения.
 *
 * Один и тот же файл приходит в нескольких форматах буфера, поэтому дубликаты
 * (без учёта регистра) убираются.
 */
export function pickImageFilePaths(
	candidates: string[],
	isFile: (path: string) => boolean,
): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of candidates) {
		const path = raw.trim().replace(/^"(.*)"$/, "$1");
		if (path === "" || !isImagePath(path)) {
			continue;
		}
		const key = path.toLowerCase();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		if (isFile(path)) {
			out.push(path);
		}
	}
	return out;
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