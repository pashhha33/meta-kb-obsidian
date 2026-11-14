import { test } from "node:test";
import assert from "node:assert/strict";
import {
	suggestLinks,
	linksToCandidates,
	candidatesToValue,
} from "../src/core/suggest";
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

test("linksToCandidates: одиночная ссылка с алиасом и без", () => {
	assert.deepEqual(linksToCandidates("[[person_alice|Алиса]]"), [
		{ id: "person_alice", title: "Алиса", type: "", linkpath: "person_alice" },
	]);
	assert.deepEqual(linksToCandidates("[[book_wp]]"), [
		{ id: "book_wp", title: "book_wp", type: "", linkpath: "book_wp" },
	]);
});

test("linksToCandidates: список и пустое значение", () => {
	assert.equal(linksToCandidates(["[[a]]", "[[b|B]]"]).length, 2);
	assert.equal(linksToCandidates(undefined).length, 0);
	assert.equal(linksToCandidates("не ссылка").length, 0);
});

test("candidatesToValue: одиночное и списком, пусто → undefined", () => {
	assert.equal(
		candidatesToValue([{ id: "x", title: "X", type: "", linkpath: "person_x" }], false),
		"[[person_x|X]]",
	);
	assert.deepEqual(
		candidatesToValue(
			[
				{ id: "a", title: "a", type: "", linkpath: "a" },
				{ id: "b", title: "B", type: "", linkpath: "b" },
			],
			true,
		),
		["[[a]]", "[[b|B]]"],
	);
	assert.equal(candidatesToValue([], false), undefined);
});
