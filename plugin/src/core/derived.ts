/**
 * Derived: вычисляемые поля и автообновление updated_at (ADR-004, C-CH-10).
 * Чистая логика: без импортов obsidian.
 */

/** Ключи, которые не считаются «значимым изменением» для updated_at. */
const NON_SIGNIFICANT = new Set([
	"updated_at",
	"created_at",
	"char-count",
	"author-sheets",
]);

/** Является ли изменение значения значимым (двигает updated_at). */
export function isSignificantChange(
	key: string,
	before: unknown,
	after: unknown,
): boolean {
	if (NON_SIGNIFICANT.has(key)) {
		return false;
	}
	return JSON.stringify(before) !== JSON.stringify(after);
}

/** Вернуть копию frontmatter с обновлённым updated_at (ISO UTC). */
export function withUpdatedAt(
	frontmatter: Record<string, unknown>,
	now: Date = new Date(),
): Record<string, unknown> {
	return { ...frontmatter, updated_at: now.toISOString() };
}

/** Знаков в теле заметки (по код-поинтам, а не UTF-16). */
export function computeCharCount(body: string): number {
	return [...body].length;
}

/** Авторские листы книги = char-count / authorSheetChars, до 0.1. */
export function computeAuthorSheets(
	charCount: number,
	charsPerSheet = 40000,
): number {
	if (!Number.isFinite(charCount) || charsPerSheet <= 0) {
		return 0;
	}
	return Math.round((charCount / charsPerSheet) * 10) / 10;
}
