/**
 * Канонические ссылки и вывод value_type из значения.
 * Чистая логика: без импортов obsidian.
 */
import type { FieldValueType } from "./metamodel";

const WIKILINK_RE = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/;

/** Каноническая ссылка `[[{type_prefix}_{id}|{title}]]` (INV-15) или null. */
export function parseCanonicalLink(
	raw: string,
): { linkpath: string; alias: string } | null {
	const match = WIKILINK_RE.exec(raw.trim());
	if (!match) {
		return null;
	}
	const linkpath = match[1].split("#")[0].trim();
	if (!linkpath) {
		return null;
	}
	return { linkpath, alias: (match[2] ?? "").trim() || linkpath };
}

/** Вывод value_type из значения для ключей без определения в контракте. */
export function inferValueType(value: unknown): FieldValueType {
	if (typeof value === "boolean") {
		return "boolean";
	}
	if (typeof value === "number") {
		return "number";
	}
	if (Array.isArray(value)) {
		const allLinks =
			value.length > 0 &&
			value.every(
				(item) => typeof item === "string" && WIKILINK_RE.test(item.trim()),
			);
		return allLinks ? "list<link>" : "list<string>";
	}
	if (typeof value === "string") {
		const s = value.trim();
		if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
			return "date";
		}
		if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) {
			return "datetime";
		}
		if (WIKILINK_RE.test(s)) {
			return "link";
		}
		return "string";
	}
	return "string";
}
