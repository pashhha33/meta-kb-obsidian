// Правила валидации второго среза: граф определений, отношения, главы,
// коллекции и «сироты». Плюс сверка: все правила контракта реализованы.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ObjectRecord } from "../src/core/loader";
import { VALIDATION_RULE_KEYS } from "../src/core/metamodel";
import {
	IMPLEMENTED_RULE_KEYS,
	validateVault,
} from "../src/core/validation";

function rec(
	type: string,
	id: string,
	props: Record<string, unknown> = {},
	overrides: Partial<ObjectRecord> = {},
): ObjectRecord {
	const title = typeof props.title === "string" ? props.title : "Название";
	return {
		path: `${type}_${id}`,
		id,
		type,
		title,
		aliases: [title],
		status: "accepted",
		props: { type, id, title, aliases: [title], status: "accepted", ...props },
		body: "",
		...overrides,
	};
}

const rulesOf = (findings: Array<{ rule_key: string }>): string[] =>
	findings.map((item) => item.rule_key);

test("все правила контракта реализованы", () => {
	const implemented = new Set(IMPLEMENTED_RULE_KEYS);
	const missing = VALIDATION_RULE_KEYS.filter((key) => !implemented.has(key));
	assert.deepEqual(missing, [], `не реализованы: ${missing.join(", ")}`);
	// И наоборот: лишних правил, которых нет в контракте, быть не должно.
	const contract = new Set(VALIDATION_RULE_KEYS);
	const extra = IMPLEMENTED_RULE_KEYS.filter((key) => !contract.has(key));
	assert.deepEqual(extra, [], `лишние правила: ${extra.join(", ")}`);
});

test("extends-acyclic: цикл в цепочке extends", () => {
	const a = rec("type", "t1", { type_value: "a", extends: "b" });
	const b = rec("type", "t2", { type_value: "b", extends: "a" });
	const result = validateVault([a, b]);
	const findings = result.findings.filter((f) => f.rule_key === "extends-acyclic");
	assert.equal(findings.length, 2, "находка на каждый тип в цикле");
	assert.ok(findings[0].message.includes("цикл"));
});

test("extends-depth: глубже пяти — предупреждение", () => {
	// Цепочка t0 → t1 → ... → t6: глубина 6.
	const records: ObjectRecord[] = [];
	for (let index = 0; index <= 6; index += 1) {
		records.push(
			rec("type", `t${index}`, {
				type_value: `t${index}`,
				extends: index === 0 ? null : `t${index - 1}`,
			}),
		);
	}
	const result = validateVault(records);
	const deep = result.findings.filter((f) => f.rule_key === "extends-depth");
	assert.equal(deep.length, 1, "только самый глубокий тип");
	assert.equal(deep[0].severity, "warning");
	assert.ok(deep[0].message.includes("максимум 5"));
});

test("extends-depth: ровно 5 — без находки", () => {
	const records: ObjectRecord[] = [];
	for (let index = 0; index <= 5; index += 1) {
		records.push(
			rec("type", `t${index}`, {
				type_value: `t${index}`,
				extends: index === 0 ? null : `t${index - 1}`,
			}),
		);
	}
	assert.deepEqual(
		rulesOf(validateVault(records).findings).filter((key) => key === "extends-depth"),
		[],
	);
});

test("unique-machine-keys: повтор type_value", () => {
	const first = rec("type", "t1", { type_value: "note" });
	const second = rec("type", "t2", { type_value: "note" });
	const findings = validateVault([first, second]).findings.filter(
		(f) => f.rule_key === "unique-machine-keys",
	);
	assert.equal(findings.length, 2);
	assert.ok(findings[0].message.includes("type_value: note"));
});

test("defined-by-consistent: определение найдено и совпадает по типу", () => {
	const definition = rec("type", "d1", { type_value: "book" });
	const book = rec("book", "b1", { defined_by: "d1" });
	const result = validateVault([definition, book]);
	assert.deepEqual(rulesOf(result.findings), []);
});

test("defined-by-consistent: цель не type и не тот type_value", () => {
	const wrongType = rec("note", "n1", { title: "x" });
	const targetWrongType = rec("note", "n2", { defined_by: "n1" });
	const definition = rec("type", "d1", { type_value: "book" });
	const targetWrongValue = rec("note", "n3", { defined_by: "d1" });
	const missing = rec("note", "n4", { defined_by: "nope" });
	const result = validateVault([
		wrongType,
		targetWrongType,
		definition,
		targetWrongValue,
		missing,
	]);
	const findings = result.findings.filter(
		(f) => f.rule_key === "defined-by-consistent",
	);
	assert.equal(findings.length, 3);
	assert.ok(findings.some((f) => f.message.includes("а не type")));
	assert.ok(findings.some((f) => f.message.includes("не описывает тип")));
	assert.ok(findings.some((f) => f.message.includes("не найдено")));
});

test("trigger-values-subset / expansion-keys-exist", () => {
	const good = rec("field-expansion", "fe1", {
		trigger_property: "format",
		trigger_values: ["paper"],
		adds_properties: ["page-count"],
		applies_to_type: ["book"],
	});
	assert.deepEqual(rulesOf(validateVault([good]).findings), []);

	const badValue = rec("field-expansion", "fe2", {
		trigger_property: "format",
		trigger_values: ["not-a-format"],
	});
	const badTrigger = rec("field-expansion", "fe3", {
		trigger_property: "title", // string, не enum
	});
	const badKey = rec("field-expansion", "fe4", {
		trigger_property: "format",
		trigger_values: ["paper"],
		adds_properties: ["нет-такого"],
	});
	const badType = rec("field-expansion", "fe5", {
		trigger_property: "format",
		applies_to_type: ["нет-типа"],
	});
	const result = validateVault([badValue, badTrigger, badKey, badType]);
	assert.ok(rulesOf(result.findings).includes("trigger-values-subset"));
	assert.equal(
		result.findings.filter((f) => f.rule_key === "expansion-keys-exist").length,
		3,
	);
});

test("relation-cardinality-form: список для 0..* и одно значение для 1..1", () => {
	const person = rec("person", "p1");
	const book = rec("book", "b1");
	// author — 0..*, ожидает список.
	const asString = rec("book", "b2", { author: "[[person_p1|Автор]]" });
	// chapter-of — 1..1, ожидает одно значение.
	const asList = rec("chapter", "c1", { "chapter-of": ["[[book_b1|Книга]]"], position: 1 });
	const result = validateVault([person, book, asString, asList]);
	const findings = result.findings.filter(
		(f) => f.rule_key === "relation-cardinality-form",
	);
	assert.equal(findings.length, 2);
	assert.ok(findings.some((f) => f.message.includes("ожидает список")));
	assert.ok(findings.some((f) => f.message.includes("ожидает одно значение")));
});

test("relation-endpoints-match: тип цели вне области отношения", () => {
	const person = rec("person", "p1");
	const note = rec("note", "n1");
	// chapter-of: цель book, а указывает на person.
	const chapter = rec("chapter", "c1", {
		"chapter-of": "[[person_p1|Человек]]",
		position: 1,
	});
	const result = validateVault([person, note, chapter]);
	const findings = result.findings.filter(
		(f) => f.rule_key === "relation-endpoints-match",
	);
	assert.equal(findings.length, 1);
	assert.ok(findings[0].message.includes("ожидается book"));
});

test("relation-acyclic: цикл part-of", () => {
	const a = rec("note", "a");
	const b = rec("note", "b");
	a.props["part-of"] = ["[[note_b|B]]"];
	b.props["part-of"] = ["[[note_a|A]]"];
	const result = validateVault([a, b]);
	const findings = result.findings.filter((f) => f.rule_key === "relation-acyclic");
	assert.ok(findings.length >= 1, "цикл должен быть найден");
	assert.ok(findings[0].message.includes("цикл"));
});

test("relation-acyclic: ациклическая цепочка не даёт находок", () => {
	const a = rec("note", "a");
	const b = rec("note", "b", { "part-of": ["[[note_a|A]]"] });
	assert.deepEqual(
		rulesOf(validateVault([a, b]).findings).filter(
			(key) => key === "relation-acyclic",
		),
		[],
	);
});

test("chapter-of-required: глава без книги", () => {
	const chapter = rec("chapter", "c1", { position: 1 });
	const findings = validateVault([chapter]).findings.filter(
		(f) => f.rule_key === "chapter-of-required",
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0].severity, "error");
});

test("chapter-position-unique: две главы с одним position в одной книге", () => {
	const book = rec("book", "b1");
	const first = rec("chapter", "c1", {
		"chapter-of": "[[book_b1|Книга]]",
		position: 3,
	});
	const second = rec("chapter", "c2", {
		"chapter-of": "[[book_b1|Книга]]",
		position: 3,
	});
	const other = rec("chapter", "c3", {
		"chapter-of": "[[book_b1|Книга]]",
		position: 4,
	});
	const result = validateVault([book, first, second, other]);
	const findings = result.findings.filter(
		(f) => f.rule_key === "chapter-position-unique",
	);
	assert.equal(findings.length, 2, "по находке на каждую из двух глав");
});

test("chapter-position-unique: один position в разных книгах — норма", () => {
	const firstBook = rec("book", "b1");
	const secondBook = rec("book", "b2");
	const first = rec("chapter", "c1", {
		"chapter-of": "[[book_b1|Книга]]",
		position: 1,
	});
	const second = rec("chapter", "c2", {
		"chapter-of": "[[book_b2|Книга]]",
		position: 1,
	});
	assert.deepEqual(
		rulesOf(validateVault([firstBook, secondBook, first, second]).findings).filter(
			(key) => key === "chapter-position-unique",
		),
		[],
	);
});

test("collection-element-consistent: фильм в альбоме", () => {
	const album = rec("album", "a1");
	const film = rec("film", "f1", {
		"part-of-collection": ["[[album_a1|Альбом]]"],
	});
	const track = rec("track", "t1");
	const result = validateVault([album, film, track]);
	const findings = result.findings.filter(
		(f) => f.rule_key === "collection-element-consistent",
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0].severity, "warning");
	assert.ok(findings[0].message.includes("film-series"));
});

test("facet-target-is-facet: значение фасета ссылается не на facet", () => {
	const note = rec("note", "n1");
	const facetValue = rec("facet-value", "fv1", { facet: "[[note_n1|Заметка]]" });
	const result = validateVault([note, facetValue]);
	const findings = result.findings.filter(
		(f) => f.rule_key === "facet-target-is-facet",
	);
	assert.equal(findings.length, 1);
	assert.ok(findings[0].message.includes("ожидается facet"));
});

test("orphan-attachment: файл без обёртки (warning)", () => {
	const image = rec("image", "i1", { attachment: "img/wrapped.png" });
	const result = validateVault([image], {
		imagePaths: ["img/wrapped.png", "./img/orphan.png"],
	});
	const findings = result.findings.filter(
		(f) => f.rule_key === "orphan-attachment",
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0].severity, "warning");
	assert.equal(findings[0].path, "img/orphan.png");
	assert.equal(findings[0].objectId, "");
});

test("orphan-attachment: без списка файлов правило молчит", () => {
	const image = rec("image", "i1", { attachment: "img/wrapped.png" });
	assert.deepEqual(
		rulesOf(validateVault([image]).findings).filter(
			(key) => key === "orphan-attachment",
		),
		[],
	);
});

test("enum-value-in-set: значение вне списка свойства (properties)", () => {
	const person = rec("person", "p1", {
		occupation: ["not-a-job"],
	});
	const findings = validateVault([person]).findings.filter(
		(f) => f.rule_key === "enum-value-in-set",
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0].field, "occupation");
	assert.ok(findings[0].message.includes("not-a-job"));
});

test("enum-value-in-set: системные enum тоже проверяются", () => {
	// Значение должно попасть в `props`: правило читает frontmatter, а не поле
	// записи, поэтому переопределяем именно свойства.
	const badStatus = rec("note", "n1", { status: "active" });
	const badLayer = rec("note", "n2", { layer: "domain" });
	const findings = validateVault([badStatus, badLayer]).findings.filter(
		(f) => f.rule_key === "enum-value-in-set",
	);
	assert.equal(findings.length, 2);
	assert.ok(findings.some((f) => f.field === "status"));
	assert.ok(findings.some((f) => f.field === "layer"));
});

test("enum-value-in-set: корректные значения молчат", () => {
	const person = rec("person", "p1", {
		occupation: ["politician", "writer"],
		layer: "content",
	});
	assert.deepEqual(
		rulesOf(validateVault([person]).findings).filter(
			(key) => key === "enum-value-in-set",
		),
		[],
	);
});

test("relation-endpoints-match: наследование по extends учитывается", () => {
	// `author` объявлен для source|quote, но `book` наследует source (INV-18).
	const person = rec("person", "p1");
	const book = rec("book", "b1", { author: ["[[person_p1|Алиса]]"] });
	const result = validateVault([person, book]);
	assert.deepEqual(
		result.findings.filter((f) => f.rule_key === "relation-endpoints-match"),
		[],
	);
});

test("type-known: неизвестный и пустой тип (INV-04)", () => {
	const unknown = rec("nonsense", "n1");
	const empty = rec("", "n2", {}, { path: "n2" });
	const findings = validateVault([unknown, empty]).findings.filter(
		(f) => f.rule_key === "type-known",
	);
	assert.equal(findings.length, 2);
	assert.ok(findings.some((f) => f.message.includes("отсутствует в метамодели")));
	assert.ok(findings.some((f) => f.message.includes("не указан type")));
});

test("type-known: известный тип молчит", () => {
	assert.deepEqual(
		rulesOf(validateVault([rec("note", "n1")]).findings).filter(
			(key) => key === "type-known",
		),
		[],
	);
});

test("title-required: пустой заголовок (INV-07)", () => {
	const findings = validateVault([rec("note", "n1", { title: "" })]).findings.filter(
		(f) => f.rule_key === "title-required",
	);
	assert.equal(findings.length, 1);
	assert.equal(findings[0].field, "title");
});

test("title-required: заголовок есть — молчит", () => {
	assert.deepEqual(
		rulesOf(validateVault([rec("note", "n1", { title: "Заголовок" })]).findings).filter(
			(key) => key === "title-required",
		),
		[],
	);
});