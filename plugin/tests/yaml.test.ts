import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeNote } from "../src/core/yaml";

test("serializeNote: строки в кавычках, числа и булевы без", () => {
	const text = serializeNote({ title: "Война и мир", year: 1869, active: true });
	assert.ok(text.includes('title: "Война и мир"'));
	assert.ok(text.includes("year: 1869"));
	assert.ok(text.includes("active: true"));
});

test("serializeNote: массив — блочный список", () => {
	const text = serializeNote({ aliases: ["person", "Человек"] });
	assert.ok(text.includes("aliases:\n  - \"person\"\n  - \"Человек\""));
});

test("serializeNote: пустой массив", () => {
	assert.ok(serializeNote({ tags: [] }).includes("tags: []"));
});

test("serializeNote: null/undefined пропускаются", () => {
	const text = serializeNote({ a: undefined, b: null, c: "x" });
	assert.ok(!text.includes("a:"));
	assert.ok(!text.includes("b:"));
	assert.ok(text.includes('c: "x"'));
});

test("serializeNote: кавычки и обратные слэши экранируются", () => {
	const text = serializeNote({ title: 'Он сказал "да" \\ точка' });
	assert.ok(text.includes('title: "Он сказал \\"да\\" \\\\ точка"'));
});

test("serializeNote: начинается и заканчивается разделителем", () => {
	const text = serializeNote({ id: "x" });
	assert.ok(text.startsWith("---\n"));
	assert.ok(text.includes("\n---\n"));
});

test("serializeNote: тело добавляется после frontmatter", () => {
	const text = serializeNote({ id: "x" }, "текст заметки");
	assert.ok(text.endsWith("текст заметки\n"));
});
