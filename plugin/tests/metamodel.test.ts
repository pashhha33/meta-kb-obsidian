import { test } from "node:test";
import assert from "node:assert/strict";
import {
	resolveField,
	enumValueLabel,
	VALUE_TYPES,
	METATYPES,
	propertyDef,
	relationDef,
} from "../src/core/metamodel";

test("контракт загружен: 14 value_type, 10 метатипов", () => {
	assert.equal(VALUE_TYPES.length, 14);
	assert.equal(METATYPES.length, 10);
});

test("occupation: label, value_type, enum 29 значений", () => {
	const f = resolveField("occupation", ["politician"]);
	assert.equal(f.label, "Профессия");
	assert.equal(f.valueType, "list<enum>");
	assert.equal(f.enumValues?.length, 29);
	assert.ok(f.enumValues?.includes("politician"));
	assert.equal(f.readOnly, false);
});

test("enumValueLabel: occupation из контракта", () => {
	assert.equal(enumValueLabel("occupation", "developer"), "Разработчик");
	assert.equal(enumValueLabel("occupation", "activist"), "Общественный деятель");
	assert.equal(enumValueLabel("occupation", "не-значение"), "не-значение");
});

test("enumValueLabel: layer/status UI-подписи", () => {
	assert.equal(enumValueLabel("layer", "system"), "Системный");
	assert.equal(enumValueLabel("status", "accepted"), "Принято");
});

test("relation: chapter-of 1..1 → link (не список)", () => {
	const f = resolveField("chapter-of", "[[book_x|Книга]]");
	assert.equal(f.group, "relations");
	assert.equal(f.valueType, "link");
});

test("relation: author 0..* → list<link>", () => {
	const f = resolveField("author", ["[[person_x|А]]"]);
	assert.equal(f.valueType, "list<link>");
});

test("системные ключи: readOnly + group system", () => {
	assert.equal(resolveField("id", "x").readOnly, true);
	assert.equal(resolveField("id", "x").group, "system");
	assert.equal(resolveField("type", "person").group, "system");
	assert.equal(resolveField("created_at", "2026-11-05T00:00:00Z").readOnly, true);
});

test("вычисляемые: char-count/author-sheets → group computed, readOnly", () => {
	assert.equal(resolveField("char-count", 123).group, "computed");
	assert.equal(resolveField("char-count", 123).readOnly, true);
	assert.equal(resolveField("author-sheets", 3).group, "computed");
});

test("неизвестный ключ → label = key, вывод из значения", () => {
	assert.equal(resolveField("my-own-key", "hello").label, "my-own-key");
	assert.equal(resolveField("my-own-key", true).valueType, "boolean");
});

test("propertyDef/relationDef не пусты", () => {
	assert.ok(propertyDef("occupation"));
	assert.ok(relationDef("author"));
	assert.equal(propertyDef("несуществующее"), undefined);
});
