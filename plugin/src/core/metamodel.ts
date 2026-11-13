/**
 * Машинный контракт метамодели (schema/metamodel.json) и запросы к нему.
 *
 * Это первый шаг «первой содержательной итерации»: статический stub `labels.ts`
 * заменён чтением контракта. Контракт — единственный источник данных о
 * свойствах, отношениях и enum-значениях; UUIDv7 выдаётся при bootstrap.
 *
 * Чистая логика: без импортов obsidian (тестируемо через node:test).
 */
import metamodelJson from "../../../schema/metamodel.json";
import { inferValueType } from "./link";

export type FieldValueType =
	| "string"
	| "text"
	| "number"
	| "boolean"
	| "date"
	| "datetime"
	| "enum"
	| "list<string>"
	| "list<enum>"
	| "link"
	| "list<link>"
	| "uuid"
	| "media"
	| "list<media>";

/** Группы строк виджета — plugin/DESIGN.md §7.10. */
export type FieldGroup = "system" | "schema" | "relations" | "computed";

/** Результат разрешения ключа frontmatter в описание поля. */
export interface ResolvedField {
	key: string;
	label: string;
	valueType: FieldValueType;
	enumValues?: string[];
	readOnly: boolean;
	group: FieldGroup;
}

interface PropertyDef {
	property_key: string;
	label: string;
	value_type: string;
	required?: string;
	applies_to?: string[];
	enum_values?: string[];
	computed?: boolean;
	trigger?: boolean;
}

interface RelationDef {
	relation_key: string;
	label: string;
	source_type: string[];
	target_type: string[];
	cardinality: string;
}

interface MetatypeDef {
	type_value: string;
	label: string;
	layer: string;
	id: string;
}

interface TypeDef {
	type_value: string;
	label: string;
	extends: string | null;
	group: string;
}

interface EnumEntry {
	value: string;
	label: string;
}

export interface MetamodelContract {
	schemaVersion: string;
	metatypes: MetatypeDef[];
	valueTypes: string[];
	listValueTypes: string[];
	types: TypeDef[];
	universalProperties: PropertyDef[];
	properties: PropertyDef[];
	relations: RelationDef[];
	fieldExpansion: unknown[];
	validationRules: unknown[];
	settings: unknown[];
	enums: {
		occupation: EnumEntry[];
		imageRoles: string[];
		bookFormat: string[];
		creationMethod: string[];
	};
}

const metamodel = metamodelJson as unknown as MetamodelContract;

/** Универсальные свойства перекрываются ядерными (ядро имеет приоритет). */
const propertyByKey = new Map<string, PropertyDef>();
for (const p of metamodel.universalProperties) propertyByKey.set(p.property_key, p);
for (const p of metamodel.properties) propertyByKey.set(p.property_key, p);

const relationByKey = new Map<string, RelationDef>();
for (const r of metamodel.relations) relationByKey.set(r.relation_key, r);

/** Ключи «Системной» секции виджета — plugin/DESIGN.md §7.10. */
const SYSTEM_KEYS = new Set([
	"id",
	"type",
	"defined_by",
	"layer",
	"status",
	"created_at",
	"updated_at",
]);

/** RU-подписи значений enum, которых нет в контракте (UI-строки, не семантика). */
const UI_ENUM_LABELS: Record<string, Record<string, string>> = {
	layer: {
		system: "Системный",
		classification: "Классификация",
		content: "Наполнение",
	},
	status: {
		draft: "Черновик",
		accepted: "Принято",
		deprecated: "Выведен",
	},
};

const occupationLabels = new Map<string, string>(
	metamodel.enums.occupation.map((o) => [o.value, o.label]),
);

/** Все 14 value_type из контракта (проверка на дрейф в тестах). */
export const VALUE_TYPES: FieldValueType[] = metamodel.valueTypes as FieldValueType[];

/** 10 метатипов с фиксированными id (для bootstrap). */
export const METATYPES: MetatypeDef[] = metamodel.metatypes;

/** Свойство по ключу (универсальное + ядро) или undefined. */
export function propertyDef(key: string): PropertyDef | undefined {
	return propertyByKey.get(key);
}

/** Отношение по ключу или undefined. */
export function relationDef(key: string): RelationDef | undefined {
	return relationByKey.get(key);
}

/** Подпись значения enum: из контракта (occupation) или UI-переопределения. */
export function enumValueLabel(propertyKey: string, raw: string): string {
	if (propertyKey === "occupation") {
		return occupationLabels.get(raw) ?? raw;
	}
	return UI_ENUM_LABELS[propertyKey]?.[raw] ?? raw;
}

/**
 * Разрешение ключа frontmatter в описание поля.
 * Порядок: отношение → свойство из контракта → вывод из значения.
 */
export function resolveField(key: string, value: unknown): ResolvedField {
	const relation = relationByKey.get(key);
	if (relation) {
		const multiple = relation.cardinality.endsWith("*");
		return {
			key,
			label: relation.label,
			valueType: multiple ? "list<link>" : "link",
			readOnly: false,
			group: "relations",
		};
	}

	const prop = propertyByKey.get(key);
	if (prop) {
		const readOnly = prop.computed === true;
		const group = SYSTEM_KEYS.has(key)
			? "system"
			: prop.computed
				? "computed"
				: "schema";
		return {
			key,
			label: prop.label,
			valueType: prop.value_type as FieldValueType,
			enumValues: prop.enum_values,
			readOnly,
			group,
		};
	}

	return {
		key,
		label: key,
		valueType: inferValueType(value),
		readOnly: false,
		group: "schema",
	};
}
