import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCanonicalLink, inferValueType } from "../src/core/link";

test("parseCanonicalLink: с алиасом", () => {
	assert.deepEqual(parseCanonicalLink("[[book_01a1|Война и мир]]"), {
		linkpath: "book_01a1",
		alias: "Война и мир",
	});
});

test("parseCanonicalLink: без алиаса — alias = linkpath", () => {
	assert.deepEqual(parseCanonicalLink("[[book_01a1]]"), {
		linkpath: "book_01a1",
		alias: "book_01a1",
	});
});

test("parseCanonicalLink: отбрасывает якорь #", () => {
	assert.deepEqual(parseCanonicalLink("[[book_01a1#Глава1]]"), {
		linkpath: "book_01a1",
		alias: "book_01a1",
	});
});

test("parseCanonicalLink: не ссылка → null", () => {
	assert.equal(parseCanonicalLink("просто текст"), null);
	assert.equal(parseCanonicalLink("[[]]"), null);
});

test("inferValueType: примитивы", () => {
	assert.equal(inferValueType(true), "boolean");
	assert.equal(inferValueType(42), "number");
	assert.equal(inferValueType("hello"), "string");
});

test("inferValueType: списки", () => {
	assert.equal(inferValueType(["a", "b"]), "list<string>");
	assert.equal(inferValueType(["[[x]]", "[[y]]"]), "list<link>");
});

test("inferValueType: дата/datetime/ссылка", () => {
	assert.equal(inferValueType("2026-11-05"), "date");
	assert.equal(inferValueType("2026-11-05T10:00"), "datetime");
	assert.equal(inferValueType("[[x|Y]]"), "link");
});
