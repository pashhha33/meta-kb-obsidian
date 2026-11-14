import { test } from "node:test";
import assert from "node:assert/strict";
import {
	buildNewObject,
	findTypeDefinitionId,
	objectFilename,
} from "../src/core/create";

const NOW = new Date("2026-11-14T10:00:00.000Z");

test("objectFilename: {type_prefix}_{id}.md", () => {
	assert.equal(
		objectFilename("person", "01a17d3b-4a00-747f-b063-cd02895e0d4f"),
		"person_01a17d3b-4a00-747f-b063-cd02895e0d4f.md",
	);
});

test("buildNewObject: универсальное ядро объекта", () => {
	const plan = buildNewObject({
		typeValue: "person",
		title: "Алиса",
		id: "id-1",
		now: NOW,
	});
	assert.equal(plan.filename, "person_id-1.md");
	assert.equal(plan.frontmatter.id, "id-1");
	assert.equal(plan.frontmatter.type, "person");
	assert.equal(plan.frontmatter.title, "Алиса");
	assert.equal(plan.frontmatter.status, "draft");
	assert.equal(plan.frontmatter.created_at, "2026-11-14T10:00:00.000Z");
	assert.equal(plan.frontmatter.updated_at, "2026-11-14T10:00:00.000Z");
});

test("buildNewObject: aliases[0] = title (INV-08)", () => {
	const plan = buildNewObject({ typeValue: "person", title: "Алиса", id: "i" });
	assert.deepEqual(plan.frontmatter.aliases, ["Алиса"]);
});

test("buildNewObject: слой берётся из метамодели", () => {
	const person = buildNewObject({ typeValue: "person", title: "А", id: "i" });
	assert.equal(person.frontmatter.layer, "content");

	const category = buildNewObject({ typeValue: "category", title: "К", id: "i" });
	assert.equal(category.frontmatter.layer, "classification");

	const typeObj = buildNewObject({ typeValue: "type", title: "Т", id: "i" });
	assert.equal(typeObj.frontmatter.layer, "system");
});

test("buildNewObject: defined_by только когда определение найдено", () => {
	const withDef = buildNewObject({
		typeValue: "person",
		title: "А",
		id: "i",
		definedBy: "def-1",
	});
	assert.equal(withDef.frontmatter.defined_by, "def-1");

	const withoutDef = buildNewObject({
		typeValue: "person",
		title: "А",
		id: "i",
		definedBy: null,
	});
	assert.ok(!("defined_by" in withoutDef.frontmatter));
});

test("findTypeDefinitionId: ищет по type_value среди type-объектов", () => {
	const records = [
		{ id: "x1", type: "person", props: { type_value: "person" } },
		{ id: "x2", type: "type", props: { type_value: "book" } },
		{ id: "x3", type: "type", props: { type_value: "person" } },
	];
	assert.equal(findTypeDefinitionId(records, "person"), "x3");
	assert.equal(findTypeDefinitionId(records, "book"), "x2");
	assert.equal(findTypeDefinitionId(records, "film"), null);
});
