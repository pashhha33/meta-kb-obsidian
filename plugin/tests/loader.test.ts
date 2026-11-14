import { test } from "node:test";
import assert from "node:assert/strict";
import { toObjectRecord } from "../src/core/loader";

test("toObjectRecord: извлечение системных полей", () => {
	const rec = toObjectRecord(
		"person_alice",
		{
			id: "alice",
			type: "person",
			title: "Алиса",
			aliases: ["Alice"],
			occupation: ["politician"],
		},
		"тело",
	);
	assert.equal(rec.id, "alice");
	assert.equal(rec.type, "person");
	assert.equal(rec.title, "Алиса");
	assert.deepEqual(rec.aliases, ["Alice"]);
	assert.deepEqual(rec.props.occupation, ["politician"]);
	assert.equal(rec.body, "тело");
});

test("toObjectRecord: пустые поля → '' / undefined", () => {
	const rec = toObjectRecord("x", {}, "");
	assert.equal(rec.id, "");
	assert.equal(rec.layer, undefined);
	assert.equal(rec.status, undefined);
});
