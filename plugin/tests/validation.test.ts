import { test } from "node:test";
import assert from "node:assert/strict";
import type { ObjectRecord } from "../src/core/loader";
import {
	findingsForPath,
	hasErrors,
	validateVault,
} from "../src/core/validation";
import type { Finding } from "../src/core/validation";

/** Собрать запись объекта с осмысленными значениями по умолчанию. */
function rec(
	type: string,
	id: string,
	props: Record<string, unknown> = {},
	overrides: Partial<ObjectRecord> = {},
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
		...overrides,
	};
}

const rulesOf = (findings: Finding[]): string[] =>
	findings.map((item) => item.rule_key);

test("чистый vault: находок нет", () => {
	const result = validateVault([
		rec("note", "n1", { title: "Заметка" }),
		rec("image", "i1", { title: "Обложка", attachment: "img/a.png" }),
	]);
	assert.deepEqual(result.findings, []);
	assert.equal(result.errors, 0);
	assert.equal(result.warnings, 0);
});

test("unique-id: нет id и повтор id", () => {
	const noId = rec("note", "", {}, { path: "note_", id: "" });
	const first = rec("note", "dup");
	const second = rec("note", "dup", {}, { path: "chapter_dup" });
	const result = validateVault([noId, first, second]);
	const findings = result.findings.filter((f) => f.rule_key === "unique-id");
	assert.equal(findings.length, 3);
	assert.ok(
		findings.some((f) => f.message.includes("нет id")),
		"должна быть находка про отсутствующий id",
	);
	assert.ok(
		findings.some((f) => f.message.includes("встречается 2 раза")),
		"должна быть находка про дубль",
	);
});

test("filename-matches-object: имя файла = {type}_{id}", () => {
	const bad = rec("note", "n1", {}, { path: "просто-заметка" });
	const result = validateVault([bad]);
	assert.deepEqual(rulesOf(result.findings), ["filename-matches-object"]);
	assert.ok(result.findings[0].message.includes("note_n1"));
});

test("aliases-first-equals-title (INV-08)", () => {
	const bad = rec("note", "n1", { title: "Новое" }, { aliases: ["Старое"] });
	const result = validateVault([bad]);
	assert.deepEqual(rulesOf(result.findings), ["aliases-first-equals-title"]);
	// Пустой title не проверяется: это не нарушение INV-08.
	assert.deepEqual(validateVault([rec("note", "n2", { title: "" })]).findings, []);
});

test("image-has-attachment: у обёртки нет attachment (INV-24)", () => {
	const result = validateVault([rec("image", "i1", { title: "Пустая" })]);
	assert.deepEqual(rulesOf(result.findings), ["image-has-attachment"]);
	assert.equal(result.errors, 1);
});

test("image-attachment-unique: один файл — одна обёртка (C-IMG-05)", () => {
	const result = validateVault([
		rec("image", "i1", { attachment: "img/a.png" }),
		rec("image", "i2", { attachment: "./img/a.png" }),
	]);
	const findings = result.findings.filter(
		(f) => f.rule_key === "image-attachment-unique",
	);
	assert.equal(findings.length, 2, "находка на каждую из двух обёрток");
	assert.ok(findings[0].message.includes("2 обёрткам"));
});

test("link-target-exists: битая ссылка и не-ссылка", () => {
	const broken = rec("chapter", "c1", { "chapter-of": "[[book_missing|Книга]]" });
	const notLink = rec("chapter", "c2", { "chapter-of": "book_missing" });
	const result = validateVault([broken, notLink]);
	const findings = result.findings.filter(
		(f) => f.rule_key === "link-target-exists",
	);
	assert.equal(findings.length, 2);
	assert.ok(
		findings.some((f) => f.message.includes("не найдена")),
		"должна быть находка про отсутствующую цель",
	);
	assert.ok(
		findings.some((f) => f.message.includes("не является канонической")),
		"должна быть находка про некорректное значение",
	);
});

test("link-target-exists: существующая цель ошибки не даёт", () => {
	const book = rec("book", "b1");
	const chapter = rec("chapter", "c1", {
		"chapter-of": "[[book_b1|Книга]]",
		position: 1,
	});
	const result = validateVault([book, chapter]);
	assert.ok(!rulesOf(result.findings).includes("link-target-exists"));
});

test("media-target-is-image: цель media должна быть image (INV-23)", () => {
	const book = rec("book", "b1");
	const wrongType = rec("note", "n1", { cover: "[[book_b1|Книга]]" });
	const missing = rec("note", "n2", { cover: "[[image_nope|Нет]]" });
	const result = validateVault([book, wrongType, missing]);
	const findings = result.findings.filter(
		(f) => f.rule_key === "media-target-is-image",
	);
	assert.equal(findings.length, 2);
	assert.ok(findings.some((f) => f.message.includes("а не image")));
	assert.ok(findings.some((f) => f.message.includes("не найдена")));
});

test("media-target-is-image: обёртка image принимается", () => {
	const image = rec("image", "i1", { attachment: "img/a.png" });
	const note = rec("note", "n1", { artwork: ["[[image_i1|Обложка]]"] });
	const result = validateVault([image, note]);
	assert.ok(!rulesOf(result.findings).includes("media-target-is-image"));
});

test("deprecated-link-target: предупреждение, не ошибка (INV-10)", () => {
	const old = rec("book", "b1", {}, { status: "deprecated" });
	const chapter = rec("chapter", "c1", { "chapter-of": "[[book_b1|Книга]]" });
	const result = validateVault([old, chapter]);
	const finding = result.findings.find(
		(f) => f.rule_key === "deprecated-link-target",
	);
	assert.ok(finding, "должно быть предупреждение");
	assert.equal(finding?.severity, "warning");
	assert.equal(result.errors, 0);
});

test("inactive-field-value: поле не применимо к типу (INV-27)", () => {
	// `page-count` — свойство book, у note его в эффективной схеме нет.
	const bad = rec("note", "n1", { "page-count": 100 });
	const result = validateVault([bad]);
	const finding = result.findings.find(
		(f) => f.rule_key === "inactive-field-value",
	);
	assert.ok(finding, "должно быть предупреждение");
	assert.equal(finding?.severity, "warning");
	assert.equal(finding?.field, "page-count");
	assert.ok(finding?.message.includes("не применимо"));
});

test("inactive-field-value: неизвестный ключ тоже предупреждение", () => {
	const result = validateVault([rec("note", "n1", { "моё-поле": "x" })]);
	const finding = result.findings.find(
		(f) => f.rule_key === "inactive-field-value",
	);
	assert.ok(finding);
	assert.ok(finding?.message.includes("неизвестное поле"));
});

test("findingsForPath / hasErrors: выборка по объекту", () => {
	const bad = rec("image", "i1", { title: "Пустая" }); // нет attachment
	const result = validateVault([bad, rec("image", "i2", { attachment: "a.png" })]);
	const mine = findingsForPath(result, "image_i1");
	assert.equal(mine.length, 1);
	assert.equal(hasErrors(mine), true);
	assert.deepEqual(findingsForPath(result, "image_i2"), []);
});

test("порядок находок стабилен (по файлу, затем по правилу)", () => {
	const result = validateVault([
		rec("note", "b", { "page-count": 1 }, { path: "note_b" }),
		rec("note", "a", { "page-count": 1 }, { path: "note_a" }),
	]);
	const paths = result.findings.map((f) => f.path);
	assert.deepEqual(paths, [...paths].sort((x, y) => x.localeCompare(y)));
});