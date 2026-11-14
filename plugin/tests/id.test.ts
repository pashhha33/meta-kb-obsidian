import { test } from "node:test";
import assert from "node:assert/strict";
import { generateId, idTimestamp, isValidId } from "../src/core/id";

const FIXED_RANDOM = (count: number) => new Uint8Array(count).fill(0xab);

test("generateId: форма UUIDv7", () => {
	const id = generateId(1_700_000_000_000, FIXED_RANDOM);
	assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	assert.ok(isValidId(id));
});

test("generateId: версия 7 и вариант 10 в битах", () => {
	const id = generateId(1_700_000_000_000, FIXED_RANDOM);
	assert.equal(id[14], "7"); // первая цифра третьей группы
	assert.ok(["8", "9", "a", "b"].includes(id[19])); // первая цифра четвёртой группы
});

test("generateId: время читается обратно", () => {
	const ms = 1_700_000_000_000;
	assert.equal(idTimestamp(generateId(ms, FIXED_RANDOM)), ms);
});

test("generateId: порядок по времени (лексикографически)", () => {
	const early = generateId(1_000, FIXED_RANDOM);
	const late = generateId(2_000, FIXED_RANDOM);
	assert.ok(early < late, `${early} должно быть меньше ${late}`);
});

test("generateId: разная случайность — разные id при одном времени", () => {
	const a = generateId(1_700_000_000_000, () => new Uint8Array(10).fill(1));
	const b = generateId(1_700_000_000_000, () => new Uint8Array(10).fill(2));
	assert.notEqual(a, b);
});

test("isValidId: отвергает UUIDv4 и мусор", () => {
	assert.equal(isValidId("9c5b94b1-35ad-49bb-b118-8e8fc24abf80"), false);
	assert.equal(isValidId("не-uuid"), false);
	assert.equal(isValidId(""), false);
});

test("idTimestamp: null для не-UUIDv7", () => {
	assert.equal(idTimestamp("не-uuid"), null);
});
