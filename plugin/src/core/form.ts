/**
 * Форма по типу: слияние эффективной схемы типа с фактическим frontmatter.
 *
 * Отвечает на вопрос «какие поля должны быть у объекта этого типа»:
 *   - эффективная схема (`effectiveSchema`: `extends` + field-expansion);
 *   - плюс всё, что уже лежит в frontmatter (даже если контракт этого не знает).
 *
 * Отсутствующие поля эффективной схемы попадают в форму как пустые строки —
 * это и делает виджет формой, а не просмотрщиком frontmatter.
 *
 * Чистая логика: без импортов obsidian (тестируется через node:test).
 */
import { isKnownType, propertyDef, relationDef, resolveField } from "./metamodel";
import type { FieldGroup, ResolvedField } from "./metamodel";
import { effectiveSchema } from "./schema";

export interface FormRow {
	field: ResolvedField;
	/** Ключ присутствует в frontmatter. */
	present: boolean;
	value: unknown;
}

export interface FormModel {
	/** Тип, по которому построена форма ('' — тип не распознан). */
	typeValue: string;
	system: FormRow[];
	schema: FormRow[];
	relations: FormRow[];
	computed: FormRow[];
	/** Ключи эффективной формы, которых нет в frontmatter (редактируемые). */
	missing: string[];
	/** Ключи frontmatter без определения в контракте. */
	unknown: string[];
	/** Заполнено / всего (без системной и вычисляемой секций). */
	filled: number;
	total: number;
}

/** Канонический порядок системных ключей. */
const SYSTEM_ORDER = [
	"id",
	"type",
	"defined_by",
	"layer",
	"status",
	"created_at",
	"updated_at",
];

export function buildForm(
	typeValue: string,
	frontmatter: Record<string, unknown>,
): FormModel {
	const present = new Set(Object.keys(frontmatter));
	const groups: Record<FieldGroup, FormRow[]> = {
		system: [],
		schema: [],
		relations: [],
		computed: [],
	};
	const seen = new Set<string>();
	const missing: string[] = [];
	const unknown: string[] = [];

	const push = (key: string): void => {
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		const isPresent = present.has(key);
		const field = resolveField(key, frontmatter[key]);
		// Системные поля не показываем пустыми: их ставит плагин, а не пользователь.
		if (field.group === "system" && !isPresent) {
			return;
		}
		if (!isPresent && !field.readOnly) {
			missing.push(key);
		}
		groups[field.group].push({ field, present: isPresent, value: frontmatter[key] });
	};

	// 1. Системные — только присутствующие, в каноническом порядке.
	for (const key of SYSTEM_ORDER) {
		push(key);
	}

	// 2. Эффективная схема типа: свойства, затем отношения.
	const known = isKnownType(typeValue);
	const tv = known ? typeValue : "";
	if (known) {
		const eff = effectiveSchema(tv, frontmatter);
		for (const key of eff.properties) {
			push(key);
		}
		for (const key of eff.relations) {
			push(key);
		}
	}

	// 3. Всё остальное, что есть в frontmatter.
	for (const key of Object.keys(frontmatter)) {
		if (!propertyDef(key) && !relationDef(key)) {
			unknown.push(key);
		}
		push(key);
	}

	const editable = [...groups.schema, ...groups.relations];
	return {
		typeValue: tv,
		system: groups.system,
		schema: groups.schema,
		relations: groups.relations,
		computed: groups.computed,
		missing,
		unknown,
		filled: editable.filter((row) => row.present).length,
		total: editable.length,
	};
}
