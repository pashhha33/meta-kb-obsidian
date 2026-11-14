/**
 * Создание объекта: имя файла и frontmatter нового объекта.
 * Чистая логика: без импортов obsidian.
 */
import { generateId } from "./id";
import { layerOfInstance, TYPE_METATYPE_VALUE } from "./metamodel";

/** Каноническое имя файла объекта: `{type_prefix}_{id}.md` (INV-05/06). */
export function objectFilename(typeValue: string, id: string): string {
	return `${typeValue}_${id}.md`;
}

export interface NewObjectInput {
	typeValue: string;
	title: string;
	/** Фиксированные значения — для тестов. */
	id?: string;
	now?: Date;
	/**
	 * `id` определения типа (`defined_by`). Если определения нет в vault —
	 * не задаётся: INV-12/13 требует, чтобы `defined_by` указывал на
	 * существующее определение типа.
	 */
	definedBy?: string | null;
}

export interface NewObjectPlan {
	filename: string;
	frontmatter: Record<string, unknown>;
}

/**
 * Собрать план нового объекта.
 *
 * Универсальное ядро объекта (01_Second_Brain_Architecture_Specification.md §2):
 * `id`, `type`, `defined_by`, `title`, `aliases`, `layer`, `status`,
 * `created_at`, `updated_at`. `aliases[0] = title` (INV-08).
 */
export function buildNewObject(input: NewObjectInput): NewObjectPlan {
	const id = input.id ?? generateId();
	const timestamp = (input.now ?? new Date()).toISOString();

	const frontmatter: Record<string, unknown> = {
		id,
		type: input.typeValue,
		title: input.title,
		aliases: [input.title],
		layer: layerOfInstance(input.typeValue),
		status: "draft",
		created_at: timestamp,
		updated_at: timestamp,
	};
	if (input.definedBy) {
		frontmatter.defined_by = input.definedBy;
	}

	return { filename: objectFilename(input.typeValue, id), frontmatter };
}

/** Минимальная форма записи для поиска определения типа. */
export interface TypeDefinitionCandidate {
	id: string;
	type: string;
	props: Record<string, unknown>;
}

/**
 * Найти `id` определения типа по `type_value`.
 *
 * Определение типа — объект `type: type` со свойством `type_value`
 * (properties.md §2). Нужен, чтобы заполнить `defined_by` нового объекта.
 */
export function findTypeDefinitionId(
	records: TypeDefinitionCandidate[],
	typeValue: string,
): string | null {
	for (const record of records) {
		if (record.type !== TYPE_METATYPE_VALUE) {
			continue;
		}
		const value = record.props?.["type_value"];
		if (typeof value === "string" && value === typeValue) {
			return record.id;
		}
	}
	return null;
}
