/**
 * Главы: создание и навигация (ADR-002, C-CH-01...C-CH-06).
 *
 * Чистая логика: без импортов obsidian. Здесь — правила, которые легко
 * проверить: умолчание имени, поиск главы по «книга + номер», соседние номера.
 *
 * Объём книги (C-CH-08...C-CH-11) — отдельный срез, этот модуль его не считает.
 */
import type { ObjectRecord } from "./loader";
import { parseCanonicalLink } from "./link";

export const CHAPTER_TYPE = "chapter";
export const BOOK_TYPE = "book";

/** C-CH-02: имя по умолчанию, когда пользователь пропустил название. */
export function defaultChapterTitle(position: number): string {
	return `Глава - ${position}`;
}

/**
 * C-CH-06: какое имя записать.
 *
 * - имя введено явно → заменяет существующее;
 * - имя пропущено, глава уже есть → существующее сохраняется;
 * - имя пропущено, главы нет → «Глава - N».
 */
export function resolveChapterTitle(opts: {
	position: number;
	requested: string;
	existing?: string;
}): string {
	const requested = opts.requested.trim();
	if (requested !== "") {
		return requested;
	}
	const existing = (opts.existing ?? "").trim();
	if (existing !== "") {
		return existing;
	}
	return defaultChapterTitle(opts.position);
}

/** Канонический `linkpath` объекта: `{type}_{id}` (INV-15). */
export function linkpathOf(record: ObjectRecord): string {
	return `${record.type}_${record.id}`;
}

/** Книга, на которую указывает глава (`chapter-of`). */
export function bookLinkpathOf(record: ObjectRecord): string {
	const raw = record.props["chapter-of"];
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (typeof value !== "string") {
		return "";
	}
	const parsed = parseCanonicalLink(value);
	return parsed ? parsed.linkpath : "";
}

/** Номер главы; NaN, если `position` не задан числом. */
export function positionOf(record: ObjectRecord): number {
	return Number(record.props["position"]);
}

/** Глава книги с данным номером (C-CH-05: номер уникален внутри книги). */
export function findChapter(
	records: ObjectRecord[],
	bookLinkpath: string,
	position: number,
): ObjectRecord | undefined {
	return records.find(
		(record) =>
			record.type === CHAPTER_TYPE &&
			bookLinkpathOf(record) === bookLinkpath &&
			positionOf(record) === position,
	);
}

/**
 * Главы книги, отсортированные по номеру (C-CH-05: порядок книги = сортировка
 * по `position`; дырки допустимы).
 */
export function chaptersOf(
	records: ObjectRecord[],
	bookLinkpath: string,
): Array<{ record: ObjectRecord; position: number }> {
	const out: Array<{ record: ObjectRecord; position: number }> = [];
	for (const record of records) {
		if (record.type !== CHAPTER_TYPE || bookLinkpathOf(record) !== bookLinkpath) {
			continue;
		}
		const position = positionOf(record);
		if (!Number.isFinite(position)) {
			continue;
		}
		out.push({ record, position });
	}
	out.sort(
		(a, b) =>
			a.position - b.position || a.record.path.localeCompare(b.record.path),
	);
	return out;
}

/** Следующий свободный номер для новой главы книги (минимум 1). */
export function nextFreePosition(
	records: ObjectRecord[],
	bookLinkpath: string,
): number {
	let max = 0;
	for (const { position } of chaptersOf(records, bookLinkpath)) {
		if (position > max) {
			max = position;
		}
	}
	return Math.max(1, Math.floor(max) + 1);
}

/**
 * Номер соседней главы (C-CH-03, C-CH-04).
 * `null` — соседа нет: перед первой главой или после последней допустимого
 * диапазона (номер обязан быть ≥ 1).
 */
export function neighbourPosition(
	current: number,
	direction: "prev" | "next",
): number | null {
	if (!Number.isFinite(current)) {
		return null;
	}
	const target = direction === "prev" ? current - 1 : current + 1;
	return target >= 1 ? target : null;
}

/** Книги для выбора, по названию (C-CH-01 требует существующий `book`). */
export function booksForPicker(records: ObjectRecord[]): ObjectRecord[] {
	return records
		.filter((record) => record.type === BOOK_TYPE)
		.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Понятная подпись книги для списков и уведомлений.
 * Книга без названия показывается по имени файла.
 */
export function bookLabel(record: ObjectRecord): string {
	return record.title !== "" ? record.title : record.path;
}