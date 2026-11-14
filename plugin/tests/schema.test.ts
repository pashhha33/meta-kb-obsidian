import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveSchema } from "../src/core/schema";

test("универсальные свойства всегда в схеме", () => {
	const s = effectiveSchema("note");
	for (const k of [
		"id",
		"type",
		"title",
		"aliases",
		"layer",
		"status",
		"created_at",
		"updated_at",
		"defined_by",
	]) {
		assert.ok(s.properties.includes(k), `отсутствует ${k}`);
	}
});

test("person без occupation: нет FE-полей", () => {
	const s = effectiveSchema("person");
	assert.ok(s.properties.includes("occupation"));
	assert.ok(!s.properties.includes("office"));
	assert.ok(!s.properties.includes("specialization"));
});

test("person + occupation politician: office/party добавлены, specialization нет", () => {
	const s = effectiveSchema("person", { occupation: ["politician"] });
	assert.ok(s.properties.includes("office"));
	assert.ok(s.properties.includes("party"));
	assert.ok(!s.properties.includes("specialization"));
});

test("book + format paper: page-count добавлен", () => {
	const s = effectiveSchema("book", { format: "paper" });
	assert.ok(s.properties.includes("page-count"));
});

test("book + format ebook: attachment/url добавлены", () => {
	const s = effectiveSchema("book", { format: "ebook" });
	assert.ok(s.properties.includes("attachment"));
	assert.ok(s.properties.includes("url"));
});

test("chapter: chapter-of есть; author наследуется от source; part-of-collection нет", () => {
	const s = effectiveSchema("chapter");
	// chapter extends source, а author.source_type = [source, quote] — наследуется.
	assert.ok(s.relations.includes("chapter-of"));
	assert.ok(s.relations.includes("author"));
	// part-of-collection.source_type = [film, track, image] — chapter не входит.
	assert.ok(!s.relations.includes("part-of-collection"));
});

test("book (extends source): author и cover применимы", () => {
	const s = effectiveSchema("book");
	assert.ok(s.relations.includes("author"));
	assert.ok(s.properties.includes("cover"));
});

test("note: звёздочные отношения about/part-of/references", () => {
	const s = effectiveSchema("note");
	assert.ok(s.relations.includes("about"));
	assert.ok(s.relations.includes("part-of"));
	assert.ok(s.relations.includes("references"));
	assert.ok(!s.relations.includes("author"));
});
