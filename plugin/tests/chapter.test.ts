import { test } from "node:test";
import assert from "node:assert/strict";
import type { ObjectRecord } from "../src/core/loader";
import {
	bookLinkpathOf,
	bookLabel,
	booksForPicker,
	chaptersOf,
	defaultChapterTitle,
	findChapter,
	linkpathOf,
	neighbourPosition,
	nextFreePosition,
	positionOf,
	resolveChapterTitle,
} from "../src/core/chapter";

function rec(
	type: string,
	id: string,
	props: Record<string, unknown> = {},
): ObjectRecord {
	const title = typeof props.title === "string" ? props.title : "Название";
	return {
		path: `${type}_${id}`,
		id,
		type,
		title,
		aliases: [title],
		status: "active",
		props: { type, id, title, aliases: [title], status: "active", ...props },
		body: "",
	};
}

const book = rec("book", "b1", { title: "Книга" });
const bookLink = "[[book_b1|Книга]]";

const chapter = (id: string, position: number, extra: Record<string, unknown> = {}) =>
	rec("chapter", id, {
		title: `Глава ${position}`,
		"chapter-of": bookLink,
		position,
		...extra,
	});

test("defaultChapterTitle: «Глава - N» (C-CH-02)", () => {
	assert.equal(defaultChapterTitle(1), "Глава - 1");
	assert.equal(defaultChapterTitle(12), "Глава - 12");
});

test("resolveChapterTitle: явное имя заменяет (C-CH-06)", () => {
	assert.equal(
		resolveChapterTitle({ position: 3, requested: "  Введение ", existing: "Старое" }),
		"Введение",
	);
	assert.equal(
		resolveChapterTitle({ position: 3, requested: "Введение" }),
		"Введение",
	);
});

test("resolveChapterTitle: пропущенное имя сохраняет существующее (C-CH-06)", () => {
	assert.equal(
		resolveChapterTitle({ position: 3, requested: "", existing: "Пролог" }),
		"Пролог",
	);
	assert.equal(
		resolveChapterTitle({ position: 3, requested: "   ", existing: "Пролог" }),
		"Пролог",
	);
});

test("resolveChapterTitle: пропущенное имя без главы даёт умолчание (C-CH-02)", () => {
	assert.equal(resolveChapterTitle({ position: 7, requested: "" }), "Глава - 7");
	assert.equal(resolveChapterTitle({ position: 7, requested: "" }), "Глава - 7");
});

test("linkpathOf / bookLinkpathOf / positionOf", () => {
	assert.equal(linkpathOf(book), "book_b1");
	const first = chapter("c1", 2);
	assert.equal(bookLinkpathOf(first), "book_b1");
	assert.equal(positionOf(first), 2);
	// Значение-список (нарушение 1..1) не роняет разбор.
	assert.equal(bookLinkpathOf(chapter("c2", 3, { "chapter-of": [bookLink] })), "book_b1");
	// Пустые и нестроковые значения.
	assert.equal(bookLinkpathOf(rec("chapter", "c3", { position: 1 })), "");
	assert.equal(positionOf(rec("chapter", "c4", { "chapter-of": bookLink })), Number.NaN);
});

test("findChapter: по книге и номеру, не путает книги (C-CH-05)", () => {
	const otherBook = rec("book", "b2", { title: "Другая" });
	const second = rec("chapter", "c9", {
		"chapter-of": "[[book_b2|Другая]]",
		position: 2,
	});
	const records = [book, otherBook, chapter("c2", 2), second];
	const found = findChapter(records, "book_b1", 2);
	assert.equal(found?.path, "chapter_c2");
	// Тот же номер в другой книге — не находка.
	assert.equal(findChapter(records, "book_b1", 3), undefined);
	assert.equal(findChapter(records, "book_b2", 2)?.path, "chapter_c9");
});

test("chaptersOf: сортировка по номеру, дырки допустимы", () => {
	const records = [book, chapter("c5", 5), chapter("c1", 1), chapter("c9", 9)];
	const list = chaptersOf(records, "book_b1");
	assert.deepEqual(
		list.map((item) => item.position),
		[1, 5, 9],
	);
	// Главы другой книги не попадают.
	assert.deepEqual(chaptersOf([book], "book_b1"), []);
});

test("nextFreePosition: после последней, минимум 1", () => {
	assert.equal(nextFreePosition([book], "book_b1"), 1);
	assert.equal(
		nextFreePosition([book, chapter("c1", 1), chapter("c5", 5)], "book_b1"),
		6,
	);
	// Дырки не «заполняются»: новая глава идёт после последней.
	assert.equal(
		nextFreePosition([book, chapter("c1", 1), chapter("c3", 3)], "book_b1"),
		4,
	);
});

test("neighbourPosition: соседи и границы (C-CH-03)", () => {
	assert.equal(neighbourPosition(2, "prev"), 1);
	assert.equal(neighbourPosition(2, "next"), 3);
	assert.equal(neighbourPosition(1, "prev"), null, "перед первой главы нет");
	assert.equal(neighbourPosition(1, "next"), 2);
	assert.equal(neighbourPosition(Number.NaN, "next"), null);
});

test("booksForPicker / bookLabel", () => {
	const records = [
		rec("book", "b2", { title: "Яблоко" }),
		book,
		rec("book", "b3", { title: "Ёлка" }),
		rec("note", "n1"),
	];
	assert.deepEqual(
		booksForPicker(records).map((item) => item.title),
		["Ёлка", "Книга", "Яблоко"],
	);
	const untitled = rec("book", "b9", { title: "" });
	assert.equal(bookLabel(untitled), "book_b9");
	assert.equal(bookLabel(book), "Книга");
});