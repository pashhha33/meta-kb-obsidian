/**
 * Loader: преобразование frontmatter + путь в ObjectRecord.
 * Чистая логика (Obsidian-часть — чтение metadataCache — остаётся в ui/).
 */

export interface ObjectRecord {
	/** Имя файла без расширения = `{type_prefix}_{id}`. */
	path: string;
	id: string;
	type: string;
	title: string;
	aliases: string[];
	layer?: string;
	status?: string;
	defined_by?: string;
	created_at?: string;
	updated_at?: string;
	/** Весь frontmatter как есть. */
	props: Record<string, unknown>;
	body: string;
}

const asString = (v: unknown): string => (typeof v === "string" ? v : "");
const asStringList = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const optionalString = (v: unknown): string | undefined => {
	const s = asString(v);
	return s === "" ? undefined : s;
};

export function toObjectRecord(
	path: string,
	frontmatter: Record<string, unknown>,
	body: string,
): ObjectRecord {
	return {
		path,
		id: asString(frontmatter.id),
		type: asString(frontmatter.type),
		title: asString(frontmatter.title),
		aliases: asStringList(frontmatter.aliases),
		layer: optionalString(frontmatter.layer),
		status: optionalString(frontmatter.status),
		defined_by: optionalString(frontmatter.defined_by),
		created_at: optionalString(frontmatter.created_at),
		updated_at: optionalString(frontmatter.updated_at),
		props: frontmatter,
		body,
	};
}
