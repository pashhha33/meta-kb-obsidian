import { test } from "node:test";
import assert from "node:assert/strict";
import {
	isBootstrapped,
	missingDefinitions,
	planBootstrap,
	planCoreTypes,
	planMetatypes,
	typeMetatypeId,
} from "../src/core/bootstrap";
import { METATYPES, CORE_TYPES } from "../src/core/metamodel";
import { isValidId } from "../src/core/id";

const NOW = new Date("2026-11-14T10:00:00.000Z");

test("planMetatypes: 10 метатипов с фиксированными id из контракта", () => {
	const plans = planMetatypes(NOW);
	assert.equal(plans.length, 10);
	assert.deepEqual(
		plans.map((p) => p.id),
		METATYPES.map((m) => m.id),
	);
	assert.ok(plans.every((p) => p.kind === "metatype"));
});

test("planMetatypes: файл {type}_{id}.md, type: type, status accepted, layer system", () => {
	const plan = planMetatypes(NOW).find((p) => p.typeValue === "property");
	assert.ok(plan);
	assert.equal(plan.filename, `type_${plan.id}.md`);
	assert.equal(plan.frontmatter.type, "type");
	assert.equal(plan.frontmatter.status, "accepted");
	assert.equal(plan.frontmatter.layer, "system");
	assert.equal(plan.frontmatter.type_value, "property");
});

test("planMetatypes: title = type_value, aliases = [type_value, русское имя] (types.md §1)", () => {
	const plan = planMetatypes(NOW).find((p) => p.typeValue === "category");
	assert.ok(plan);
	assert.equal(plan.frontmatter.title, "category");
	assert.deepEqual(plan.frontmatter.aliases, ["category", "Категория"]);
});

test("planMetatypes: defined_by — сам на себя у type, иначе на метатип type", () => {
	const plans = planMetatypes(NOW);
	const typePlan = plans.find((p) => p.typeValue === "type");
	assert.ok(typePlan);
	assert.equal(typePlan.frontmatter.defined_by, typePlan.id);

	for (const plan of plans.filter((p) => p.typeValue !== "type")) {
		assert.equal(plan.frontmatter.defined_by, typeMetatypeId());
	}
});

test("planCoreTypes: 29 определений, id из генератора, defined_by = метатип type", () => {
	let counter = 0;
	const plans = planCoreTypes({
		now: NOW,
		idFactory: () => `generated-${++counter}`,
	});
	assert.equal(plans.length, CORE_TYPES.length);
	assert.equal(plans.length, 29);
	assert.equal(plans[0].id, "generated-1");
	assert.ok(plans.every((p) => p.frontmatter.defined_by === typeMetatypeId()));
	assert.ok(plans.every((p) => p.frontmatter.layer === "system"));
});

test("planBootstrap: по умолчанию метатипы + определения ядра", () => {
	assert.equal(planBootstrap({ now: NOW, idFactory: () => "x" }).length, 39);
	assert.equal(planBootstrap({ now: NOW, withCoreTypes: false }).length, 10);
});

test("missingDefinitions: отбрасывает уже существующие id", () => {
	const plans = planMetatypes(NOW);
	const existing = plans.slice(0, 3).map((p) => p.id);
	assert.equal(missingDefinitions(plans, existing).length, 7);
	assert.equal(missingDefinitions(plans, plans.map((p) => p.id)).length, 0);
});

test("isBootstrapped: нужны все 10 метатипов", () => {
	const all = METATYPES.map((m) => m.id);
	assert.equal(isBootstrapped(all), true);
	assert.equal(isBootstrapped(all.slice(0, 9)), false);
	assert.equal(isBootstrapped([]), false);
});

test("planCoreTypes: id — валидные UUIDv7, когда генератор настоящий", () => {
	const plans = planCoreTypes({ now: NOW });
	assert.ok(plans.every((p) => isValidId(p.id)));
});
