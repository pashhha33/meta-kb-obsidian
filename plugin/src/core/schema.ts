/**
 * Schema: расчёт эффективного набора полей для типа объекта.
 *
 * Порядок (field-expansion.md §3):
 *   1. поля типа по цепочке `extends` (универсальные + применимые свойства/отношения);
 *   2. активные field-expansion (accepted + тип + триггер);
 *   3. union добавляемых полей.
 * Чистая логика: без импортов obsidian.
 */
import {
	ALL_PROPERTIES,
	ALL_RELATIONS,
	FIELD_EXPANSION,
	typeChain,
} from "./metamodel";

export interface EffectiveSchema {
	/** property_key в порядке отображения. */
	properties: string[];
	/** relation_key в порядке отображения. */
	relations: string[];
}

/**
 * Разница, зафиксированная prose (field-expansion.md §3):
 * «Поля из adds_* допустимы и без активного правила (правило управляет формой,
 * не допустимостью)». Поэтому effectiveSchema ниже — это ФОРМА: базовые поля
 * типа минус те, чьей формой управляет FE, плюс добавленные по триггеру.
 */

/** Применим ли набор type_value к типу (с учётом цепочки extends). */
function applies(typeSet: string[], chain: Set<string>): boolean {
	return typeSet.some((t) => chain.has(t));
}

/**
 * Эффективные поля типа.
 * @param typeValue type_value объекта (или предок по extends).
 * @param frontmatter весь frontmatter заметки (для триггеров FE).
 */
export function effectiveSchema(
	typeValue: string,
	frontmatter: Record<string, unknown> = {},
): EffectiveSchema {
	const chain = new Set(typeChain(typeValue));

	// Поля, формой которых для этого типа управляет FE (добавляются по триггеру).
	const feAddedForType = new Set<string>();
	for (const fe of FIELD_EXPANSION) {
		if (!applies(fe.applies_to_type, chain)) {
			continue;
		}
		for (const k of fe.adds_properties) feAddedForType.add(k);
		for (const k of fe.adds_relations) feAddedForType.add(k);
	}

	const properties: string[] = [];
	for (const p of ALL_PROPERTIES) {
		// Универсальные (без applies_to) применимы всегда.
		if (!p.applies_to) {
			properties.push(p.property_key);
			continue;
		}
		if (applies(p.applies_to, chain) && !feAddedForType.has(p.property_key)) {
			properties.push(p.property_key);
		}
	}

	const relations: string[] = [];
	for (const r of ALL_RELATIONS) {
		const appliesTo =
			r.source_type.includes("*") || applies(r.source_type, chain);
		if (appliesTo && !feAddedForType.has(r.relation_key)) {
			relations.push(r.relation_key);
		}
	}

	// field-expansion: добавляем по триггеру.
	const addedProps = new Set<string>();
	const addedRels = new Set<string>();
	for (const fe of FIELD_EXPANSION) {
		if (!applies(fe.applies_to_type, chain)) {
			continue;
		}
		const trigger = frontmatter[fe.trigger_property];
		const values = Array.isArray(trigger) ? trigger : [trigger];
		const hit = values.some(
			(v) => typeof v === "string" && fe.trigger_values.includes(v),
		);
		if (!hit) {
			continue;
		}
		for (const k of fe.adds_properties) addedProps.add(k);
		for (const k of fe.adds_relations) addedRels.add(k);
	}

	return {
		properties: [...properties, ...addedProps],
		relations: [...relations, ...addedRels],
	};
}
