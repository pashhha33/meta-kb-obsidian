/**
 * Объём главы и книги (C-CH-08...C-CH-11).
 *
 * `char-count` главы — знаки **чистого текста** тела: markdown-разметка
 * удаляется, пробелы и переносы сохраняются. `char-count` книги — сумма глав,
 * `author-sheets` — деление на размер авторского листа.
 *
 * Чистая логика: без импортов obsidian.
 */
import { computeAuthorSheets } from "./derived";

/** Размер авторского листа по умолчанию (C-CH-11). */
export const AUTHOR_SHEET_CHARS_DEFAULT = 40000;

/**
 * Убрать markdown-разметку, оставив текст, пробелы и переносы.
 *
 * Разметка вроде `#`, `**`, `[[…]]` знаками текста не считается: иначе объём
 * зависел бы от оформления, а не от содержания (C-CH-08).
 */
export function stripMarkdown(text: string): string {
	let out = text;
	// YAML-frontmatter — не текст заметки.
	out = out.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
	// Ограждения блоков кода: сами строки-маркеры убираем, код остаётся.
	out = out.replace(/^\s*```[^\n]*$/gm, "");
	out = out.replace(/^\s*~~~[^\n]*$/gm, "");
	// Встроенные изображения — не текст.
	out = out.replace(/!\[\[[^\]]*\]\]/g, "");
	out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
	// Вики-ссылки: [[путь|подпись]] → подпись, [[путь]] → путь.
	out = out.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
	out = out.replace(/\[\[([^\]]+)\]\]/g, "$1");
	// Обычные ссылки: [текст](url) → текст.
	out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
	// Сноски и ссылочные определения.
	out = out.replace(/^\s*\[[^\]]+\]:.*$/gm, "");
	// Инлайн-код.
	out = out.replace(/`+/g, "");
	// Парные маркеры выделения снимаются всегда.
	out = out.replace(/(\*\*|__|~~)/g, "");
	// Одиночные `*` и `_` — только на границах слова: иначе пострадали бы
	// машинные ключи вроде `book_1` или `chapter-of`.
	out = out.replace(/(^|[\s(])[*_](?=\S)/g, "$1");
	out = out.replace(/(\S)[*_](?=$|[\s.,;:!?)])/g, "$1");
	// Заголовки, цитаты, маркеры списков.
	out = out.replace(/^\s{0,3}#{1,6}\s+/gm, "");
	out = out.replace(/^\s{0,3}>\s?/gm, "");
	out = out.replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, "");
	// Горизонтальные линии.
	out = out.replace(/^\s{0,3}([-*_])\1{2,}\s*$/gm, "");
	// HTML-теги и разделители таблиц.
	out = out.replace(/<\/?[a-z][^>]*>/gi, "");
	out = out.replace(/\|/g, " ");
	return out;
}

/** Знаков чистого текста (по код-поинтам: эмодзи — один знак). */
export function countCleanChars(text: string): number {
	return [...stripMarkdown(text)].length;
}

/** Объём книги: сумма глав и авторские листы (C-CH-09, C-CH-11). */
export function bookVolume(
	chapterCharCounts: number[],
	charsPerSheet: number = AUTHOR_SHEET_CHARS_DEFAULT,
): { charCount: number; authorSheets: number } {
	let charCount = 0;
	for (const value of chapterCharCounts) {
		if (Number.isFinite(value) && value > 0) {
			charCount += value;
		}
	}
	return {
		charCount,
		authorSheets: computeAuthorSheets(charCount, charsPerSheet),
	};
}