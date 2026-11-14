import { test } from "node:test";
import assert from "node:assert/strict";
import { buildForm } from "../src/core/form";

const keys = (rows: { field: { key: string } }[]) => rows.map((r) => r.field.key);

test("buildForm: тип не распознан → только то, что есть в frontmatter", () => {
	const form = buildForm("", { title: "А", my_key: 1 });
	assert.equal(form.typeValue, "");
	assert.deepEqual(keys(form.schema), ["title", "my_key"]);
	assert.equal(form.relations.length, 0);
	assert.deepEqual(form.unknown, ["my_key"]);
	assert.deepEqual(form.missing, []);
});

test("buildForm: человек без данных → пустые строки эффективной схемы", () => {
	const form = buildForm("person", { id: "p1", type: "person", title: "Алиса" });
	// Системные показаны (есть в frontmatter), пустых системных строк нет.
	assert.deepEqual(keys(form.system), ["id", "type"]);
	// Применимые к person свойства присутствуют как пустые строки.
	assert.ok(keys(form.schema).includes("birth-date"));
	assert.ok(keys(form.schema).includes("occupation"));
	// Неприменимые к person — отсутствуют.
	assert.ok(!keys(form.schema).includes("isbn"));
	assert.ok(!keys(form.schema).includes("box-office-worldwide"));
	// Отношения человека: member-of объявлен в FE-02, поэтому появляется
	// только при триггере; located-in — обычное отношение типа person.
	assert.ok(keys(form.relations).includes("located-in"));
	assert.ok(!keys(form.relations).includes("member-of"));
	assert.ok(!keys(form.relations).includes("chapter-of"));
});

test("buildForm: FE-02 добавляет member-of при occupation developer", () => {
	const form = buildForm("person", {
		id: "p1",
		type: "person",
		occupation: ["developer"],
	});
	assert.ok(keys(form.relations).includes("member-of"));
});

test("buildForm: отсутствующие поля попадают в missing, присутствующие — нет", () => {
	const form = buildForm("person", {
		id: "p1",
		type: "person",
		title: "Алиса",
		occupation: ["writer"],
	});
	assert.ok(form.missing.includes("birth-date"));
	assert.ok(!form.missing.includes("title"));
	assert.ok(!form.missing.includes("occupation"));
});

test("buildForm: field-expansion — office/party только при occupation politician", () => {
	const without = buildForm("person", { id: "p1", type: "person" });
	assert.ok(!keys(without.schema).includes("office"));

	const withPolitician = buildForm("person", {
		id: "p1",
		type: "person",
		occupation: ["politician"],
	});
	assert.ok(keys(withPolitician.schema).includes("office"));
	assert.ok(keys(withPolitician.schema).includes("party"));

	const withWriter = buildForm("person", {
		id: "p1",
		type: "person",
		occupation: ["writer"],
	});
	assert.ok(keys(withWriter.schema).includes("specialization"));
	assert.ok(!keys(withWriter.schema).includes("office"));
});

test("buildForm: book + format audiobook → attachment/duration", () => {
	const form = buildForm("book", { id: "b1", type: "book", format: "audiobook" });
	assert.ok(keys(form.schema).includes("attachment"));
	assert.ok(keys(form.schema).includes("duration"));
});

test("buildForm: computed-поля не попадают в missing (их нельзя заполнить)", () => {
	const form = buildForm("chapter", { id: "c1", type: "chapter", title: "Гл. 1" });
	assert.ok(keys(form.computed).includes("char-count"));
	assert.ok(!form.missing.includes("char-count"));
});

test("buildForm: счётчики заполнения без системной секции", () => {
	const form = buildForm("person", { id: "p1", type: "person", title: "А" });
	const all = [...form.schema, ...form.relations];
	assert.equal(form.total, all.length);
	assert.equal(form.filled, all.filter((r) => r.present).length);
	assert.equal(form.filled, 1); // только title
});

test("buildForm: present-флаг отражает фактическое наличие ключа", () => {
	const form = buildForm("person", { id: "p1", type: "person", title: "А" });
	const titleRow = [...form.schema, ...form.relations].find(
		(r) => r.field.key === "title",
	);
	assert.equal(titleRow?.present, true);
	const birthRow = form.schema.find((r) => r.field.key === "birth-date");
	assert.equal(birthRow?.present, false);
	assert.equal(birthRow?.field.readOnly, false);
});
