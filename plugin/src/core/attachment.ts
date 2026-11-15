/**
 * Обёртка изображения: нормализация пути вложения, индекс «файл → обёртка»,
 * проверка инварианта «один файл → максимум одна обёртка».
 *
 * Источник правил: ADR-003, `constraints.md` C-IMG-01…C-IMG-07,
 * INV-23 (`media` указывает на `image`, не на путь) и INV-24 (`attachment`
 * обязателен у `image`). Нормализация пути — `plugin-settings.md`:
 * «относительно vault, unified separators, decode %».
 *
 * Чистая логика: без импортов obsidian.
 */
import { buildNewObject } from "./create";

/** Расширения, которые плагин считает изображениями. */
export const IMAGE_EXTENSIONS = [
	"png",
	"jpg",
	"jpeg",
	"webp",
	"gif",
	"svg",
	"bmp",
	"avif",
];

/**
 * Нормализовать путь вложения: относительно vault, прямые слэши,
 * декодированный процент, без ведущих `./` и `/`, без двойных слэшей.
 */
export function normalizeAttachmentPath(raw: unknown): string {
	let path = typeof raw === "string" ? raw.trim() : "";
	if (path === "") {
		return "";
	}
	path = path.replace(/\\/g, "/");
	try {
		path = decodeURIComponent(path);
	} catch {
		// повреждённый процент — оставляем как есть
	}
	path = path.replace(/\/{2,}/g, "/");
	path = path.replace(/^\.\//, "");
	path = path.replace(/^\/+/, "");
	// Конечный слэш: путь всегда указывает на файл, а не на папку.
	path = path.replace(/\/+$/, "");
	// якорь и query к файлу не относятся
	path = path.split("#")[0].split("?")[0];
	return path.trim();
}

/** Расширение файла в нижнем регистре ('' — если его нет). */
export function fileExtension(path: string): string {
	const clean = normalizeAttachmentPath(path);
	const dot = clean.lastIndexOf(".");
	if (dot === -1 || dot === clean.length - 1) {
		return "";
	}
	return clean.slice(dot + 1).toLowerCase();
}

/** Похож ли путь на изображение. */
export function isImagePath(path: string): boolean {
	return IMAGE_EXTENSIONS.includes(fileExtension(path));
}

/** Имя файла с расширением (`attachments/photo.png` → `photo.png`). */
export function fileBasename(path: string): string {
	const clean = normalizeAttachmentPath(path);
	const slash = clean.lastIndexOf("/");
	return slash === -1 ? clean : clean.slice(slash + 1);
}

/** Имя файла без расширения — заготовка названия обёртки. */
export function titleFromPath(path: string): string {
	const name = fileBasename(path);
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(0, dot) : name;
}

export interface AttachmentRecord {
	id: string;
	type: string;
	title: string;
	props: Record<string, unknown>;
}

export interface AttachmentEntry {
	id: string;
	title: string;
	path: string;
}

export interface AttachmentIndex {
	/** нормализованный путь → обёртка (первая найденная). */
	byPath: Map<string, AttachmentEntry>;
	/** Нарушения C-IMG-05: один файл попал в несколько обёрток. */
	duplicates: Array<{ path: string; ids: string[] }>;
	/** id обёртки → запись обёртки (первая найденная). */
	byId: Map<string, AttachmentEntry>;
}

/** Построить индекс `attachment → image` из записей объектов. */
export function buildAttachmentIndex(
	records: AttachmentRecord[],
): AttachmentIndex {
	const byPath = new Map<string, AttachmentEntry>();
	const byId = new Map<string, AttachmentEntry>();
	const idsByPath = new Map<string, string[]>();

	for (const record of records) {
		if (record.type !== "image") {
			continue;
		}
		const path = normalizeAttachmentPath(record.props?.["attachment"]);
		if (path === "") {
			continue;
		}
		const ids = idsByPath.get(path);
		if (ids) {
			ids.push(record.id);
		} else {
			idsByPath.set(path, [record.id]);
		}
		if (!byPath.has(path)) {
			const entry = { id: record.id, title: record.title, path };
			byPath.set(path, entry);
			byId.set(record.id, entry);
		}
	}

	const duplicates = [...idsByPath.entries()]
		.filter(([, ids]) => ids.length > 1)
		.map(([path, ids]) => ({ path, ids }));

	return { byPath, duplicates, byId };
}

/** Обёртка по её id, если она есть в индексе. */
export function wrapperForId(
	index: AttachmentIndex,
	id: string,
): AttachmentEntry | undefined {
	return index.byId.get(id);
}

/** Обёртка для пути, если она уже есть. */
export function wrapperForPath(
	index: AttachmentIndex,
	rawPath: string,
): AttachmentEntry | undefined {
	const path = normalizeAttachmentPath(rawPath);
	return path === "" ? undefined : index.byPath.get(path);
}

/** Пути-изображения, для которых обёртки ещё нет (C-IMG-04 п.2). */
export function unwrappedImagePaths(
	imagePaths: string[],
	index: AttachmentIndex,
): string[] {
	const result: string[] = [];
	for (const raw of imagePaths) {
		const path = normalizeAttachmentPath(raw);
		if (path !== "" && isImagePath(path) && !index.byPath.has(path)) {
			result.push(path);
		}
	}
	return result;
}

export interface AttachDecision {
	allowed: boolean;
	reason: "ok" | "empty" | "owned-by-other";
	/** Уже существующая обёртка этого файла, если есть. */
	existing?: AttachmentEntry;
}

/**
 * Можно ли привязать файл: инвариант «один файл → максимум одна обёртка»
 * (C-IMG-05). Свой собственный путь разрешён — иначе повторное сохранение
 * того же значения в обёртке считалось бы нарушением.
 */
export function decideAttachment(
	index: AttachmentIndex,
	rawPath: string,
	ownerId?: string | null,
): AttachDecision {
	const path = normalizeAttachmentPath(rawPath);
	if (path === "") {
		return { allowed: false, reason: "empty" };
	}
	const existing = index.byPath.get(path);
	if (existing && existing.id !== (ownerId ?? null)) {
		return { allowed: false, reason: "owned-by-other", existing };
	}
	return { allowed: true, reason: "ok", existing };
}

export interface WrapperInput {
	title: string;
	attachment: string;
	definedBy?: string | null;
	roles?: string[];
	id?: string;
	now?: Date;
}

export interface WrapperPlan {
	filename: string;
	frontmatter: Record<string, unknown>;
	/**
	 * Тело заметки: embed самого вложения.
	 *
	 * Так embed `![[image_{id}]]` показывает изображение в **Live Preview и в
	 * Reading View** — Obsidian рендерит тело вложенной заметки, а `![[файл.png]]`
	 * он показывает как картинку сам по себе (C-IMG-01). Post-processor в Reading
	 * View при этом остаётся как второй, независимый путь.
	 */
	body: string;
}

/** Embed вложения: `![[путь/к/файлу.png]]`. */
export function attachmentEmbed(attachment: string): string {
	const path = normalizeAttachmentPath(attachment);
	return path === "" ? "" : `![[${path}]]`;
}

/**
 * План объекта-обёртки `image`: универсальное ядро + обязательный `attachment`
 * (INV-24) + необязательные `roles` (C-IMG-06) + embed вложения в теле.
 */
export function buildImageWrapperPlan(input: WrapperInput): WrapperPlan {
	const base = buildNewObject({
		typeValue: "image",
		title: input.title,
		id: input.id,
		now: input.now,
		definedBy: input.definedBy,
	});
	const frontmatter: Record<string, unknown> = {
		...base.frontmatter,
		attachment: normalizeAttachmentPath(input.attachment),
	};
	if (input.roles && input.roles.length > 0) {
		frontmatter.roles = [...input.roles];
	}
	return {
		filename: base.filename,
		frontmatter,
		body: attachmentEmbed(input.attachment),
	};
}

/** Тело заметки уже синхронизировано с `attachment`? */
export function bodyMatchesAttachment(body: string, attachment: string): boolean {
	const trimmed = body.trim();
	if (trimmed === "") {
		return false;
	}
	const expected = attachmentEmbed(attachment);
	return expected !== "" && trimmed === expected;
}

/**
 * Нужно ли плагину перезаписать тело обёртки.
 *
 * Пустое тело и тело, которое плагин сам писал (`![[...]]`), — принадлежат
 * плагину. Всё остальное — текст владельца, и мы к нему не прикасаемся.
 */
export function shouldSyncBody(body: string, attachment: string): boolean {
	const trimmed = body.trim();
	if (trimmed === "") {
		return true;
	}
	return /^!\[\[[^\]]+\]\]$/.test(trimmed);
}
