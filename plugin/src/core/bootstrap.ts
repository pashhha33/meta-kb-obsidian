/**
 * Bootstrap метамодели в хранилище (metamodel/bootstrap.md).
 *
 * Обязательная часть — 10 метатипов с фиксированными `id` из контракта.
 * Без них плагин не считает vault инициализированным. Опциональная —
 * определения 29 типов ядра: без них у новых объектов не заполняется
 * `defined_by`, поэтому рекомендуется создавать вместе.
 *
 * Чистая логика: без импортов obsidian (файлы создаёт ui-слой).
 */
import { objectFilename } from "./create";
import { generateId } from "./id";
import {
	CORE_TYPES,
	layerOfDefinition,
	METATYPES,
	TYPE_METATYPE_VALUE,
} from "./metamodel";

export interface DefinitionPlan {
	kind: "metatype" | "core-type";
	typeValue: string;
	/** Ярлык для интерфейса. */
	label: string;
	id: string;
	filename: string;
	frontmatter: Record<string, unknown>;
}

/**
 * Frontmatter определения типа: объект `type: type`.
 *
 * `title` = английское имя (`type_value`), `aliases[0] = title` (INV-08),
 * `aliases[1]` = русское имя — как задаёт types.md §1:
 * «`aliases[0]` = английский `title`, `aliases[1]` = русское имя».
 * `layer` определения — `system` (типы.md §1: у метатипов `layer: system`;
 * определения типов ядра — тоже объекты слоя определений).
 */
function definitionFrontmatter(args: {
	id: string;
	definedBy: string;
	typeValue: string;
	label: string;
	timestamp: string;
}): Record<string, unknown> {
	return {
		id: args.id,
		type: TYPE_METATYPE_VALUE,
		defined_by: args.definedBy,
		type_value: args.typeValue,
		title: args.typeValue,
		aliases: [args.typeValue, args.label],
		layer: layerOfDefinition(),
		status: "accepted",
		created_at: args.timestamp,
		updated_at: args.timestamp,
	};
}

/** `id` метатипа `type` — на него ссылаются `defined_by` остальных определений. */
export function typeMetatypeId(): string {
	const metatype = METATYPES.find(
		(entry) => entry.type_value === TYPE_METATYPE_VALUE,
	);
	if (!metatype) {
		throw new Error("контракт не содержит метатип `type`");
	}
	return metatype.id;
}

/**
 * План обязательной части bootstrap: 10 метатипов с фиксированными `id`.
 * `type` ссылается сам на себя, остальные — на него (bootstrap.md §Обязательно).
 */
export function planMetatypes(now: Date = new Date()): DefinitionPlan[] {
	const timestamp = now.toISOString();
	const typeId = typeMetatypeId();

	return METATYPES.map((metatype) => ({
		kind: "metatype" as const,
		typeValue: metatype.type_value,
		label: metatype.label,
		id: metatype.id,
		filename: objectFilename(TYPE_METATYPE_VALUE, metatype.id),
		frontmatter: definitionFrontmatter({
			id: metatype.id,
			definedBy:
				metatype.type_value === TYPE_METATYPE_VALUE ? metatype.id : typeId,
			typeValue: metatype.type_value,
			label: metatype.label,
			timestamp,
		}),
	}));
}

/**
 * План определений 29 типов ядра. `id` выдаются генератором (bootstrap.md:
 * определения типов ядра создаются «без фиксированных id»).
 */
export function planCoreTypes(opts: {
	now?: Date;
	idFactory?: () => string;
} = {}): DefinitionPlan[] {
	const timestamp = (opts.now ?? new Date()).toISOString();
	const idFactory = opts.idFactory ?? (() => generateId());
	const typeId = typeMetatypeId();

	return CORE_TYPES.map((type) => {
		const id = idFactory();
		return {
			kind: "core-type" as const,
			typeValue: type.type_value,
			label: type.label,
			id,
			filename: objectFilename(TYPE_METATYPE_VALUE, id),
			frontmatter: definitionFrontmatter({
				id,
				definedBy: typeId,
				typeValue: type.type_value,
				label: type.label,
				timestamp,
			}),
		};
	});
}

/** Полный план bootstrap. */
export function planBootstrap(opts: {
	withCoreTypes?: boolean;
	now?: Date;
	idFactory?: () => string;
} = {}): DefinitionPlan[] {
	const plans = planMetatypes(opts.now ?? new Date());
	return opts.withCoreTypes === false ? plans : [...plans, ...planCoreTypes(opts)];
}

/** Оставить только те определения, которых ещё нет в хранилище. */
export function missingDefinitions(
	plans: DefinitionPlan[],
	existingIds: Iterable<string>,
): DefinitionPlan[] {
	const existing = new Set(existingIds);
	return plans.filter((plan) => !existing.has(plan.id));
}

/** Признак «vault bootstrapped»: присутствуют все 10 метатипов. */
export function isBootstrapped(existingIds: Iterable<string>): boolean {
	const existing = new Set(existingIds);
	return METATYPES.every((metatype) => existing.has(metatype.id));
}
