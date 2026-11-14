import { test } from "node:test";
import assert from "node:assert/strict";
import { Registry } from "../src/core/registry";
import { toObjectRecord } from "../src/core/loader";

function makeRegistry() {
	const r = new Registry();
	r.add(
		toObjectRecord("person_alice", { id: "alice", type: "person", title: "Алиса" }, ""),
	);
	r.add(
		toObjectRecord("book_wp", { id: "wp", type: "book", title: "Война и мир" }, ""),
	);
	return r;
}

test("registry: get по id", () => {
	assert.equal(makeRegistry().get("alice")?.title, "Алиса");
});

test("registry: resolveLink по голому id", () => {
	assert.equal(makeRegistry().resolveLink("alice")?.title, "Алиса");
});

test("registry: resolveLink по имени файла {type}_{id}", () => {
	assert.equal(makeRegistry().resolveLink("person_alice")?.id, "alice");
	assert.equal(makeRegistry().resolveLink("book_wp")?.id, "wp");
});

test("registry: несуществующая ссылка → undefined", () => {
	assert.equal(makeRegistry().resolveLink("does_not_exist"), undefined);
});
