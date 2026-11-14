/**
 * Validation: находки по правилам контракта (`validationRules` в
 * `schema/metamodel.json`, проза — `metamodel/validation.md`).
 *
 * Чистая логика: без импортов obsidian, только Registry-записи. Это
 * единственная реализация правил — UI и команды показывают то, что вернул
 * `validateVault`. `tools/accept.mjs` остаётся проверкой ожиданий на
 * фикстурах и новыми правилами не расширяется.
 *
 * Данные не удаляются и не правятся: находка — это сообщение, а не действие
 * (`validation.md`: «данные не удаляются»).
 */
import type { ObjectRecord } from "./loader";
import { normalizeAttachmentPath } from "./attachment";
import { parseCanonicalLink } from "./link";
import {
	isKnownType,
	isMetatype,
	propertyDef,
	relationDef,
	requiredFor,
	resolveField,
} from "./metamodel";
import type { RelationDef } from "./metamodel";
import { effectiveSchema } from "./schema";

export type Severity = "error" | "warning";

/** Все правила, которые умеет проверять этот модуль. */
export const IMPLEMENTED_RULE_KEYS: string[] = [
	"unique-id",
	"filename-matches-object",
	"aliases-first-equals-title",
	"media-target-is-image",
	"image-has-attachment",
	"image-attachment-unique",
	"extends-acyclic",
	"defined-by-consistent",
	"trigger-values-subset",
	"expansion-keys-exist",
	"link-target-exists",
	"unique-machine-keys",
	"relation-acyclic",
	"relation-endpoints-match",
	"relation-cardinality-form",
	"facet-target-is-facet",
	"chapter-position-unique",
	"chapter-of-required",
	"inactive-field-value",
	"extends-depth",
	"deprecated-link-target",
	"collection-element-consistent",
	"orphan-attachment",
];

/** Одна находка валидатора. */
export interface Finding {
	/** `rule_key` из контракта. */
	rule_key: string;
	severity: Severity;
	/** `id` объекта (может быть пустым, если нарушен `unique-id`). */
	objectId: string;
	/** Имя файла без `.md` — по нему находку находит UI. */
	path: string;
	/** Ключ свойства/отношения, если находка про конкретное поле. */
	field?: string;
	/** Текст для интерфейса. */
	message: string;
}

export interface ValidationResult {
	findings: Finding[];
	errors: number;
	warnings: number;
}

/** Дополнительные данные, которых нет в Registry. */
export interface ValidationOptions {
	/** Все изображения хранилища — для `orphan-attachment`. */
	imagePaths?: string[];
}

/** Ключи, которые не проверяются как пользовательские поля. */
const SYSTEM_KEYS = new Set([
	"id",
	"type",
	"title",
	"aliases",
	"defined_by",
	"layer",
	"status",
	"created_at",
	"updated_at",
]);

/** Каноническая ссылка на объект: `{type}_{id}` (INV-15). */
function linkpathOf(record: ObjectRecord): string {
	return `${record.type}_${record.id}`;
}

interface Context {
	records: ObjectRecord[];
	/** `{type}_{id}` → запись. */
	byLinkpath: Map<string, ObjectRecord>;
	/** `id` → запись (для `defined_by`: это uuid, а не ссылка). */
	byId: Map<string, ObjectRecord>;
	/** Пользовательские ключи записи (без системных). */
	contentKeys: (record: ObjectRecord) => string[];
}

function finding(
	record: ObjectRecord,
	rule_key: string,
	severity: Severity,
	field: string | undefined,
	message: string,
): Finding {
	return {
		rule_key,
		severity,
		objectId: record.id,
		path: record.path,
		...(field === undefined ? {} : { field }),
		message,
	};
}

/** Ссылки-значения поля: одиночная или списком. */
function linkValues(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === "string");
	}
	return typeof value === "string" ? [value] : [];
}

/** `unique-id` — `id` есть и уникален в vault (INV-02). */
function ruleUniqueId(ctx: Context): Finding[] {
	const counts = new Map<string, number>();
	for (const record of ctx.records) {
		if (record.id !== "") {
			counts.set(record.id, (counts.get(record.id) ?? 0) + 1);
		}
	}
	const out: Finding[] = [];
	for (const record of ctx.records) {
		if (record.id === "") {
			out.push(
				finding(record, "unique-id", "error", "id", "у объекта нет id (INV-02)"),
			);
			continue;
		}
		const count = counts.get(record.id) ?? 0;
		if (count > 1) {
			out.push(
				finding(
					record,
					"unique-id",
					"error",
					"id",
					`id «${record.id}» встречается ${count} раза (INV-02)`,
				),
			);
		}
	}
	return out;
}

/** `filename-matches-object` — имя файла = `{type_prefix}_{id}` (INV-05, INV-06). */
function ruleFilename(record: ObjectRecord): Finding[] {
	if (record.type === "" || record.id === "") {
		return [];
	}
	const expected = linkpathOf(record);
	if (record.path === expected) {
		return [];
	}
	return [
		finding(
			record,
			"filename-matches-object",
			"error",
			undefined,
			`файл «${record.path}» не совпадает с «${expected}» (INV-05, INV-06)`,
		),
	];
}

/** `aliases-first-equals-title` — `aliases[0] = title` (INV-08). */
function ruleAliases(record: ObjectRecord): Finding[] {
	if (record.title === "") {
		return [];
	}
	const first = record.aliases[0] ?? "";
	if (first === record.title) {
		return [];
	}
	return [
		finding(
			record,
			"aliases-first-equals-title",
			"error",
			"aliases",
			`aliases[0] = «${first}», ожидается title «${record.title}» (INV-08)`,
		),
	];
}

/** `image-has-attachment` — у обёртки `image` есть `attachment` (INV-24). */
function ruleImageAttachment(record: ObjectRecord): Finding[] {
	if (record.type !== "image") {
		return [];
	}
	if (requiredFor("attachment", "image") === "never") {
		return [];
	}
	const value = record.props["attachment"];
	if (typeof value === "string" && normalizeAttachmentPath(value) !== "") {
		return [];
	}
	return [
		finding(
			record,
			"image-has-attachment",
			"error",
			"attachment",
			"у обёртки image нет attachment (INV-24, C-IMG)",
		),
	];
}

/** `image-attachment-unique` — один файл → одна обёртка (C-IMG-05). */
function ruleAttachmentUnique(ctx: Context): Finding[] {
	const idsByPath = new Map<string, ObjectRecord[]>();
	for (const record of ctx.records) {
		if (record.type !== "image") {
			continue;
		}
		const value = record.props["attachment"];
		if (typeof value !== "string") {
			continue;
		}
		// Нормализация обязательна: `./img/a.png` и `img\a.png` — один файл.
		const path = normalizeAttachmentPath(value);
		if (path === "") {
			continue;
		}
		const list = idsByPath.get(path);
		if (list) {
			list.push(record);
		} else {
			idsByPath.set(path, [record]);
		}
	}
	const out: Finding[] = [];
	for (const [path, records] of idsByPath) {
		if (records.length < 2) {
			continue;
		}
		for (const record of records) {
			out.push(
				finding(
					record,
					"image-attachment-unique",
					"error",
					"attachment",
					`файл «${path}» привязан к ${records.length} обёрткам (C-IMG-05)`,
				),
			);
		}
	}
	return out;
}

/**
 * `link-target-exists` / `media-target-is-image` / `deprecated-link-target` —
 * проверки значений-ссылок одного объекта.
 */
function ruleLinks(record: ObjectRecord, ctx: Context): Finding[] {
	const out: Finding[] = [];
	for (const key of ctx.contentKeys(record)) {
		const field = resolveField(key, record.props[key]);
		const valueType = field.valueType;
		if (
			valueType !== "link" &&
			valueType !== "list<link>" &&
			valueType !== "media" &&
			valueType !== "list<media>"
		) {
			continue;
		}
		const isMedia = valueType === "media" || valueType === "list<media>";
		for (const raw of linkValues(record.props[key])) {
			const parsed = parseCanonicalLink(raw);
			if (!parsed) {
				out.push(
					finding(
						record,
						isMedia ? "media-target-is-image" : "link-target-exists",
						"error",
						key,
						`значение «${raw}» не является канонической ссылкой (INV-15)`,
					),
				);
				continue;
			}
			const target = ctx.byLinkpath.get(parsed.linkpath);
			if (!target) {
				out.push(
					finding(
						record,
						isMedia ? "media-target-is-image" : "link-target-exists",
						"error",
						key,
						isMedia
							? `цель media «${parsed.linkpath}» не найдена (INV-23)`
							: `цель ссылки «${parsed.linkpath}» не найдена (INV-15)`,
					),
				);
				continue;
			}
			if (isMedia && target.type !== "image") {
				out.push(
					finding(
						record,
						"media-target-is-image",
						"error",
						key,
						`цель media «${parsed.linkpath}» имеет тип «${target.type}», ` +
							"а не image (INV-23)",
					),
				);
			}
			if (target.status === "deprecated") {
				out.push(
					finding(
						record,
						"deprecated-link-target",
						"warning",
						key,
						`ссылка ведёт на устаревший объект «${target.title || target.path}» (INV-10)`,
					),
				);
			}
		}
	}
	return out;
}

/**
 * `inactive-field-value` — значение заполнено, а поля нет в эффективной схеме
 * типа (INV-27: правило FE управляет формой, не допустимостью).
 */
function ruleInactiveField(record: ObjectRecord, ctx: Context): Finding[] {
	if (record.type === "" || !isKnownType(record.type)) {
		return [];
	}
	// Определения метамодели (type, property, field-expansion, ...) держат
	// структурные поля вроде `extends`, `trigger_property`, `type_value` — их
	// нет в списке свойств контракта, и INV-27 к ним не относится. Иначе каждый
	// файл определений давал бы по несколько ложных предупреждений.
	if (isMetatype(record.type) || record.layer === "system") {
		return [];
	}
	const schema = effectiveSchema(record.type, record.props);
	const active = new Set([...schema.properties, ...schema.relations]);
	const out: Finding[] = [];
	for (const key of ctx.contentKeys(record)) {
		if (active.has(key)) {
			continue;
		}
		const field = resolveField(key, record.props[key]);
		if (field.group === "computed" || field.group === "system") {
			continue;
		}
		// Известное свойство/отношение, но не применимое к типу — либо
		// незнакомый ключ: и то, и другое заслуживает внимания владельца.
		const known =
			propertyDef(key) !== undefined || relationDef(key) !== undefined;
		out.push(
			finding(
				record,
				"inactive-field-value",
				"warning",
				key,
				known
					? `поле «${key}» не применимо к типу «${record.type}» (INV-27)`
					: `неизвестное поле «${key}» для типа «${record.type}» (INV-27)`,
			),
		);
	}
	return out;
}

/** Значения enum свойства из контракта ([] — не enum). */
function enumValuesOf(key: string): string[] {
	return propertyDef(key)?.enum_values ?? [];
}

/** Значение как список непустых строк. */
function stringList(value: unknown): string[] {
	const raw = Array.isArray(value) ? value : [value];
	return raw
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter((item) => item !== "");
}

/** Ссылки записи по ключу → нормализованные `linkpath`. */
function linkpathsOf(record: ObjectRecord, key: string): string[] {
	const out: string[] = [];
	for (const raw of linkValues(record.props[key])) {
		const parsed = parseCanonicalLink(raw);
		if (parsed) {
			out.push(parsed.linkpath);
		}
	}
	return out;
}

/** Тип объекта, в который указывает `defined_by` (uuid, а не ссылка). */
function typeValueOf(record: ObjectRecord): string {
	const value = record.props["type_value"];
	return typeof value === "string" ? value.trim() : "";
}

/**
 * `extends-acyclic` / `extends-depth` — цепочка `extends` у определений типа:
 * без циклов (INV-18) и не глубже 5.
 */
function ruleExtends(ctx: Context): Finding[] {
	const byTypeValue = new Map<string, ObjectRecord>();
	for (const record of ctx.records) {
		if (record.type !== "type") {
			continue;
		}
		const value = typeValueOf(record);
		if (value !== "") {
			byTypeValue.set(value, record);
		}
	}

	const out: Finding[] = [];
	for (const record of ctx.records) {
		if (record.type !== "type") {
			continue;
		}
		const start = typeValueOf(record);
		if (start === "") {
			continue;
		}
		const seen = new Set<string>();
		const chain: string[] = [];
		let current: string | null = start;
		let cycleAt: string | null = null;
		while (current !== null && current !== "") {
			if (seen.has(current)) {
				cycleAt = current;
				break;
			}
			seen.add(current);
			chain.push(current);
			const parent = byTypeValue.get(current);
			if (!parent) {
				break;
			}
			const next = parent.props["extends"];
			current = typeof next === "string" && next.trim() !== "" ? next.trim() : null;
		}
		if (cycleAt !== null) {
			out.push(
				finding(
					record,
					"extends-acyclic",
					"error",
					"extends",
					`цикл extends через «${cycleAt}»: ${chain.join(" → ")} (INV-18)`,
				),
			);
			continue;
		}
		const depth = chain.length - 1;
		if (depth > 5) {
			out.push(
				finding(
					record,
					"extends-depth",
					"warning",
					"extends",
					`глубина extends ${depth}, максимум 5 (INV-18)`,
				),
			);
		}
	}
	return out;
}

/** Пары «тип определения → ключ, который обязан быть уникален». */
const MACHINE_KEYS: Array<{ type: string; key: string }> = [
	{ type: "type", key: "type_value" },
	{ type: "property", key: "property_key" },
	{ type: "relation", key: "relation_key" },
	{ type: "validation-rule", key: "rule_key" },
];

/** `unique-machine-keys` — машинные ключи определений уникальны (INV-13/16/17). */
function ruleMachineKeys(ctx: Context): Finding[] {
	const out: Finding[] = [];
	for (const { type, key } of MACHINE_KEYS) {
		const byValue = new Map<string, ObjectRecord[]>();
		for (const record of ctx.records) {
			if (record.type !== type) {
				continue;
			}
			const value = record.props[key];
			if (typeof value !== "string" || value.trim() === "") {
				continue;
			}
			const list = byValue.get(value.trim());
			if (list) {
				list.push(record);
			} else {
				byValue.set(value.trim(), [record]);
			}
		}
		for (const [value, records] of byValue) {
			if (records.length < 2) {
				continue;
			}
			for (const record of records) {
				out.push(
					finding(
						record,
						"unique-machine-keys",
						"error",
						key,
						`«${key}: ${value}» встречается у ${records.length} определений ` +
							"(INV-13, INV-16, INV-17)",
					),
				);
			}
		}
	}
	return out;
}

/** `defined-by-consistent` — `defined_by` ведёт на определение своего типа (INV-12, INV-13). */
function ruleDefinedBy(record: ObjectRecord, ctx: Context): Finding[] {
	const raw = record.props["defined_by"];
	if (typeof raw !== "string" || raw.trim() === "") {
		return []; // нет ссылки — не несогласованность
	}
	const target = ctx.byId.get(raw.trim());
	if (!target) {
		return [
			finding(
				record,
				"defined-by-consistent",
				"error",
				"defined_by",
				`определение типа «${raw.trim()}» не найдено (INV-12, INV-13)`,
			),
		];
	}
	if (target.type !== "type") {
		return [
			finding(
				record,
				"defined-by-consistent",
				"error",
				"defined_by",
				`defined_by указывает на объект типа «${target.type}», а не type`,
			),
		];
	}
	const value = typeValueOf(target);
	if (value !== record.type) {
		return [
			finding(
				record,
				"defined-by-consistent",
				"error",
				"defined_by",
				`определение типа «${value}» не описывает тип «${record.type}»`,
			),
		];
	}
	return [];
}

/**
 * `expansion-keys-exist` / `trigger-values-subset` — правило развёртывания
 * полей: ключи существуют, триггер — enum, значения входят в его enum (INV-25).
 */
function ruleFieldExpansion(record: ObjectRecord): Finding[] {
	if (record.type !== "field-expansion") {
		return [];
	}
	const out: Finding[] = [];
	const trigger = stringList(record.props["trigger_property"])[0] ?? "";
	if (trigger === "") {
		out.push(
			finding(
				record,
				"expansion-keys-exist",
				"error",
				"trigger_property",
				"не задан trigger_property (INV-25)",
			),
		);
	} else {
		const definition = propertyDef(trigger);
		if (!definition) {
			out.push(
				finding(
					record,
					"expansion-keys-exist",
					"error",
					"trigger_property",
					`триггер «${trigger}» не является свойством контракта (INV-25)`,
				),
			);
		} else if (
			definition.value_type !== "enum" &&
			definition.value_type !== "list<enum>"
		) {
			out.push(
				finding(
					record,
					"expansion-keys-exist",
					"error",
					"trigger_property",
					`триггер «${trigger}» имеет тип ${definition.value_type}, ` +
						"ожидается enum (INV-25)",
				),
			);
		} else {
			const allowed = new Set(enumValuesOf(trigger));
			for (const value of stringList(record.props["trigger_values"])) {
				if (!allowed.has(value)) {
					out.push(
						finding(
							record,
							"trigger-values-subset",
							"error",
							"trigger_values",
							`значение «${value}» не входит в enum «${trigger}» (INV-25)`,
						),
					);
				}
			}
		}
	}

	for (const key of [
		...stringList(record.props["adds_properties"]),
		...stringList(record.props["adds_relations"]),
	]) {
		if (!propertyDef(key) && !relationDef(key)) {
			out.push(
				finding(
					record,
					"expansion-keys-exist",
					"error",
					"adds_properties",
					`поле «${key}» не найдено в контракте (INV-25)`,
				),
			);
		}
	}
	for (const typeValue of stringList(record.props["applies_to_type"])) {
		if (!isKnownType(typeValue)) {
			out.push(
				finding(
					record,
					"expansion-keys-exist",
					"error",
					"applies_to_type",
					`тип «${typeValue}» не найден в контракте (INV-25)`,
				),
			);
		}
	}
	return out;
}

/** `relation-endpoints-match` / `relation-cardinality-form` (INV-17). */
function ruleRelations(record: ObjectRecord, ctx: Context): Finding[] {
	const out: Finding[] = [];
	for (const key of ctx.contentKeys(record)) {
		const relation: RelationDef | undefined = relationDef(key);
		if (!relation) {
			continue;
		}
		const value = record.props[key];
		if (value === undefined) {
			continue;
		}
		const multiple = relation.cardinality.endsWith("*");
		const isList = Array.isArray(value);
		if (multiple && !isList) {
			out.push(
				finding(
					record,
					"relation-cardinality-form",
					"error",
					key,
					`«${key}» ожидает список (cardinality ${relation.cardinality}, INV-17)`,
				),
			);
		}
		if (!multiple && isList) {
			out.push(
				finding(
					record,
					"relation-cardinality-form",
					"error",
					key,
					`«${key}» ожидает одно значение (cardinality ${relation.cardinality}, INV-17)`,
				),
			);
		}
		if (
			!relation.source_type.includes("*") &&
			!relation.source_type.includes(record.type)
		) {
			out.push(
				finding(
					record,
					"relation-endpoints-match",
					"error",
					key,
					`тип «${record.type}» не входит в источник «${key}» ` +
						`(${relation.source_type.join(" | ")}, INV-17)`,
				),
			);
		}
		for (const linkpath of linkpathsOf(record, key)) {
			const target = ctx.byLinkpath.get(linkpath);
			if (!target) {
				continue; // отсутствие цели — link-target-exists
			}
			if (
				!relation.target_type.includes("*") &&
				!relation.target_type.includes(target.type)
			) {
				out.push(
					finding(
						record,
						"relation-endpoints-match",
						"error",
						key,
						`цель «${key}» имеет тип «${target.type}», ожидается ` +
							`${relation.target_type.join(" | ")} (INV-17)`,
					),
				);
			}
		}
	}
	return out;
}

/** Связи, по которым проверяется ацикличность (INV-17). */
const ACYCLIC_RELATIONS = ["parent", "part-of", "blocks"];

/** `relation-acyclic` — нет циклов по `parent`/`part-of`/`blocks`. */
function ruleRelationCycles(ctx: Context): Finding[] {
	const keys = ACYCLIC_RELATIONS.filter((key) => relationDef(key) !== undefined);
	if (keys.length === 0) {
		return [];
	}
	const edges = new Map<string, string[]>();
	for (const record of ctx.records) {
		const from = linkpathOf(record);
		for (const key of keys) {
			for (const to of linkpathsOf(record, key)) {
				const list = edges.get(from);
				if (list) {
					list.push(to);
				} else {
					edges.set(from, [to]);
				}
			}
		}
	}

	const state = new Map<string, 1 | 2>();
	const reported = new Set<string>();
	const out: Finding[] = [];
	const visit = (node: string, path: string[]): void => {
		const current = state.get(node);
		if (current === 2) {
			return;
		}
		if (current === 1) {
			const record = ctx.byLinkpath.get(node);
			const cycle = [...path.slice(path.indexOf(node)), node].join(" → ");
			if (record && !reported.has(record.path + cycle)) {
				reported.add(record.path + cycle);
				out.push(
					finding(
						record,
						"relation-acyclic",
						"error",
						keys[0],
						`цикл в «${keys.join("/")}»: ${cycle} (INV-17)`,
					),
				);
			}
			return;
		}
		state.set(node, 1);
		for (const next of edges.get(node) ?? []) {
			visit(next, [...path, node]);
		}
		state.set(node, 2);
	};
	for (const node of edges.keys()) {
		visit(node, []);
	}
	return out;
}

/** `facet-target-is-facet` — у `facet-value` связь ведёт на тип `facet` (INV-15). */
function ruleFacet(record: ObjectRecord, ctx: Context): Finding[] {
	if (record.type !== "facet-value") {
		return [];
	}
	const out: Finding[] = [];
	for (const key of ["facet", "facet-of"]) {
		for (const linkpath of linkpathsOf(record, key)) {
			const target = ctx.byLinkpath.get(linkpath);
			if (target && target.type !== "facet") {
				out.push(
					finding(
						record,
						"facet-target-is-facet",
						"error",
						key,
						`цель «${key}» имеет тип «${target.type}», ожидается facet (INV-15)`,
					),
				);
			}
		}
	}
	return out;
}

/** `chapter-of-required` / `chapter-position-unique` (C-CH-05). */
function ruleChapters(ctx: Context): Finding[] {
	const out: Finding[] = [];
	const byBook = new Map<string, Array<{ record: ObjectRecord; position: number }>>();

	for (const record of ctx.records) {
		if (record.type !== "chapter") {
			continue;
		}
		const linkpaths = linkpathsOf(record, "chapter-of");
		if (linkpaths.length === 0) {
			out.push(
				finding(
					record,
					"chapter-of-required",
					"error",
					"chapter-of",
					"у главы нет chapter-of (C-CH-05)",
				),
			);
			continue;
		}
		const target = ctx.byLinkpath.get(linkpaths[0]);
		if (!target) {
			continue; // цели нет — link-target-exists
		}
		const position = Number(record.props["position"]);
		if (!Number.isFinite(position)) {
			continue; // обязательность position — отдельная норма C-CH-05
		}
		const list = byBook.get(target.path);
		if (list) {
			list.push({ record, position });
		} else {
			byBook.set(target.path, [{ record, position }]);
		}
	}

	for (const list of byBook.values()) {
		const byPosition = new Map<number, ObjectRecord[]>();
		for (const { record, position } of list) {
			const same = byPosition.get(position);
			if (same) {
				same.push(record);
			} else {
				byPosition.set(position, [record]);
			}
		}
		for (const [position, records] of byPosition) {
			if (records.length < 2) {
				continue;
			}
			for (const record of records) {
				out.push(
					finding(
						record,
						"chapter-position-unique",
						"error",
						"position",
						`position ${position} занят другой главой этой книги (C-CH-05)`,
					),
				);
			}
		}
	}
	return out;
}

/** Ожидаемый тип коллекции для элемента (DL-025). */
const COLLECTION_TARGETS: Record<string, string> = {
	film: "film-series",
	track: "album",
	image: "gallery",
};

/** `collection-element-consistent` — элемент входит в коллекцию своего вида. */
function ruleCollections(record: ObjectRecord, ctx: Context): Finding[] {
	const expected = COLLECTION_TARGETS[record.type];
	if (!expected) {
		return [];
	}
	const out: Finding[] = [];
	for (const linkpath of linkpathsOf(record, "part-of-collection")) {
		const target = ctx.byLinkpath.get(linkpath);
		if (target && target.type !== expected) {
			out.push(
				finding(
					record,
					"collection-element-consistent",
					"warning",
					"part-of-collection",
					`«${record.type}» входит в «${expected}», а цель — «${target.type}» (DL-025)`,
				),
			);
		}
	}
	return out;
}

/**
 * `orphan-attachment` — файл-изображение без обёртки (C-IMG).
 *
 * Нужен список файлов хранилища: у файла без обёртки нет объекта, поэтому
 * находка не привязана к записи (`objectId` пуст).
 */
function ruleOrphans(ctx: Context, options: ValidationOptions): Finding[] {
	const paths = options.imagePaths;
	if (!paths || paths.length === 0) {
		return [];
	}
	const wrapped = new Set<string>();
	for (const record of ctx.records) {
		if (record.type !== "image") {
			continue;
		}
		const path = normalizeAttachmentPath(record.props["attachment"]);
		if (path !== "") {
			wrapped.add(path);
		}
	}
	const out: Finding[] = [];
	const seen = new Set<string>();
	for (const raw of paths) {
		const path = normalizeAttachmentPath(raw);
		if (path === "" || wrapped.has(path) || seen.has(path)) {
			continue;
		}
		seen.add(path);
		out.push({
			rule_key: "orphan-attachment",
			severity: "warning",
			objectId: "",
			path,
			message: `файл «${path}» не обёрнут — можно создать обёртку (C-IMG)`,
		});
	}
	return out;
}

/**
 * Прогнать все правила по записям Registry.
 *
 * Порядок находок стабилен: по файлу, затем по `rule_key` — чтобы отчёт не
 * «прыгал» между запусками.
 */
export function validateVault(
	records: ObjectRecord[],
	options: ValidationOptions = {},
): ValidationResult {
	const ctx: Context = {
		records,
		byLinkpath: new Map(records.map((record) => [linkpathOf(record), record])),
		byId: new Map(
			records.filter((record) => record.id !== "").map((record) => [record.id, record]),
		),
		contentKeys: (record) =>
			Object.keys(record.props).filter((key) => !SYSTEM_KEYS.has(key)),
	};

	const findings: Finding[] = [];
	findings.push(...ruleUniqueId(ctx));
	findings.push(...ruleAttachmentUnique(ctx));
	findings.push(...ruleExtends(ctx));
	findings.push(...ruleMachineKeys(ctx));
	findings.push(...ruleChapters(ctx));
	findings.push(...ruleRelationCycles(ctx));
	findings.push(...ruleOrphans(ctx, options));
	for (const record of records) {
		findings.push(...ruleFilename(record));
		findings.push(...ruleAliases(record));
		findings.push(...ruleImageAttachment(record));
		findings.push(...ruleLinks(record, ctx));
		findings.push(...ruleInactiveField(record, ctx));
		findings.push(...ruleDefinedBy(record, ctx));
		findings.push(...ruleFieldExpansion(record));
		findings.push(...ruleRelations(record, ctx));
		findings.push(...ruleFacet(record, ctx));
		findings.push(...ruleCollections(record, ctx));
	}

	findings.sort(
		(a, b) => a.path.localeCompare(b.path) || a.rule_key.localeCompare(b.rule_key),
	);

	return {
		findings,
		errors: findings.filter((item) => item.severity === "error").length,
		warnings: findings.filter((item) => item.severity === "warning").length,
	};
}

/** Находки одного объекта (для строки свойств и команды «проверить заметку»). */
export function findingsForPath(
	result: ValidationResult,
	path: string,
): Finding[] {
	return result.findings.filter((item) => item.path === path);
}

/** Есть ли в объекте ошибки (не только предупреждения). */
export function hasErrors(findings: Finding[]): boolean {
	return findings.some((item) => item.severity === "error");
}