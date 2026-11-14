import { test } from "node:test";
import assert from "node:assert/strict";
import {
	AUTHOR_SHEET_CHARS_DEFAULT,
	bookVolume,
	countCleanChars,
	stripMarkdown,
} from "../src/core/volume";

test("stripMarkdown: frontmatter не считается текстом", () => {
	const text = "---\ntype: chapter\ntitle: Глава - 1\n---\nТекст главы";
	assert.equal(stripMarkdown(text).trim(), "Текст главы");
});

test("stripMarkdown: заголовки, списки, цитаты, выделение", () => {
	const text = [
		"# Заголовок",
		"## Подзаголовок",
		"- пункт один",
		"1. пункт два",
		"> цитата",
		"**жирный** и *курсив* и ~~зачёркнутый~~",
		"`код`",
	].join("\n");
	const clean = stripMarkdown(text);
	assert.ok(!clean.includes("#"));
	assert.ok(!clean.includes("**"));
	assert.ok(!clean.includes("*курсив*"));
	assert.ok(!clean.includes("`"));
	assert.ok(clean.includes("Заголовок"));
	assert.ok(clean.includes("пункт один"));
	assert.ok(clean.includes("цитата"));
	assert.ok(clean.includes("жирный и курсив и зачёркнутый"));
});

test("stripMarkdown: ссылки оставляют подпись, картинки исчезают", () => {
	assert.equal(stripMarkdown("[[book_1|Книга]]"), "Книга");
	assert.equal(stripMarkdown("[[book_1]]"), "book_1");
	assert.equal(stripMarkdown("[текст](https://example.com)"), "текст");
	assert.equal(stripMarkdown("![[image_1|Обложка]]"), "");
	assert.equal(stripMarkdown("![alt](pic.png)"), "");
	// Смешанный случай: текст вокруг ссылки сохраняется.
	assert.equal(stripMarkdown("см. [[note_1|заметку]] сейчас"), "см. заметку сейчас");
});

test("stripMarkdown: блок кода — маркеры убираются, текст остаётся", () => {
	const text = "```js\nconst x = 1;\n```";
	const clean = stripMarkdown(text);
	assert.ok(!clean.includes("```"));
	assert.ok(clean.includes("const x = 1;"));
});

test("stripMarkdown: пробелы и переносы сохраняются", () => {
	const clean = stripMarkdown("Раз  два\n\nТри");
	assert.equal(clean, "Раз  два\n\nТри");
});

test("stripMarkdown: HTML и таблицы", () => {
	assert.ok(!stripMarkdown("<b>текст</b>").includes("<b>"));
	assert.ok(stripMarkdown("<b>текст</b>").includes("текст"));
	assert.equal(stripMarkdown("| a | b |"), "  a   b  ");
});

test("countCleanChars: разметка не увеличивает объём (C-CH-08)", () => {
	const plain = "Привет мир";
	const formatted = "# Привет **мир**";
	assert.equal(countCleanChars(plain), 10);
	assert.equal(countCleanChars(formatted), countCleanChars(plain));
});

test("countCleanChars: считает код-поинты, а не UTF-16", () => {
	// Эмодзи вне BMP: в UTF-16 это два блока, но это один знак.
	assert.equal(countCleanChars("🙂"), 1);
	assert.equal(countCleanChars("a🙂b"), 3);
});

test("countCleanChars: пустые значения", () => {
	assert.equal(countCleanChars(""), 0);
	assert.equal(countCleanChars("---\ntype: chapter\n---\n"), 0);
});

test("bookVolume: сумма глав и авторские листы (C-CH-09)", () => {
	const volume = bookVolume([10000, 10000, 20000]);
	assert.equal(volume.charCount, 40000);
	assert.equal(volume.authorSheets, 1);
});

test("bookVolume: нет глав — нули (C-CH-11)", () => {
	assert.deepEqual(bookVolume([]), { charCount: 0, authorSheets: 0 });
});

test("bookVolume: мусор в значениях не ломает сумму", () => {
	const volume = bookVolume([1000, Number.NaN, -5, 2000]);
	assert.equal(volume.charCount, 3000);
});

test("bookVolume: размер авторского листа настраивается (C-CH-11)", () => {
	const volume = bookVolume([20000], 20000);
	assert.equal(volume.charCount, 20000);
	assert.equal(volume.authorSheets, 1);
	assert.equal(AUTHOR_SHEET_CHARS_DEFAULT, 40000);
});

test("bookVolume: округление до 0.1 листа", () => {
	// 6000 / 40000 = 0.15 → 0.2
	assert.equal(bookVolume([6000]).authorSheets, 0.2);
	// 1000 / 40000 = 0.025 → 0
	assert.equal(bookVolume([1000]).authorSheets, 0);
});