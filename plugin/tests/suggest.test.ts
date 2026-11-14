import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestLinks } from "../src/core/suggest";
import { toObjectRecord } from "../src/core/loader";

const records = [
	toObjectRecord("person_alice", { id: "alice", type: "person", title: "Алиса", aliases: ["Alice"] }, ""),
	toObjectRecord("person_bob", { id: "bob", type: "person", title: "Борис" }, ""),
	toObjectRecord("book_wp", { id: "wp", type: "book", title: "Война и мир" }, ""),
];

test("suggestLinks: пустой запрос возвращает всех", () => {
	assert.equal(suggestLinks(records, "").length, 3);
});

test("suggestLinks: фильтр по title (регистронезависимо)", () => {
	const r = suggestLinks(records, "ал");
	assert.equal(r.length, 1);
	assert.equal(r[0].id, "alice");
});

test("suggestLinks: поиск по alias", () => {
	const r = suggestLinks(records, "alice");
	assert.equal(r.length, 1);
	assert.equal(r[0].linkpath, "person_alice");
});

test("suggestLinks: ограничение targetTypes", () => {
	const r = suggestLinks(records, "", { targetTypes: ["book"] });
	assert.equal(r.length, 1);
	assert.equal(r[0].type, "book");
});

test("suggestLinks: '*' — любой тип", () => {
	assert.equal(suggestLinks(records, "", { targetTypes: ["*"] }).length, 3);
});

test("suggestLinks: linkpath = {type}_{id}", () => {
	assert.equal(suggestLinks(records, "Война")[0].linkpath, "book_wp");
});
