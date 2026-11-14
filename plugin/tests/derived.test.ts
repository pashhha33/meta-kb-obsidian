import { test } from "node:test";
import assert from "node:assert/strict";
import {
	isSignificantChange,
	withUpdatedAt,
	computeCharCount,
	computeAuthorSheets,
} from "../src/core/derived";

test("isSignificantChange: обычные поля значимы, системные — нет", () => {
	assert.equal(isSignificantChange("title", "a", "b"), true);
	assert.equal(isSignificantChange("title", "a", "a"), false);
	assert.equal(isSignificantChange("updated_at", "a", "b"), false);
	assert.equal(isSignificantChange("char-count", 1, 2), false);
});

test("withUpdatedAt: подставляет ISO-время, не мутирует вход", () => {
	const src = { title: "A" };
	const fixed = new Date("2026-11-13T00:00:00Z");
	const out = withUpdatedAt(src, fixed);
	assert.equal(out.updated_at, "2026-11-13T00:00:00.000Z");
	assert.equal(src.updated_at, undefined);
});

test("computeCharCount: по код-поинтам", () => {
	assert.equal(computeCharCount("привет"), 6);
	assert.equal(computeCharCount(""), 0);
	assert.equal(computeCharCount("a😀b"), 3);
});

test("computeAuthorSheets: char-count / authorSheetChars", () => {
	assert.equal(computeAuthorSheets(40000), 1);
	assert.equal(computeAuthorSheets(20000), 0.5);
	assert.equal(computeAuthorSheets(0), 0);
	assert.equal(computeAuthorSheets(100, 0), 0);
});
