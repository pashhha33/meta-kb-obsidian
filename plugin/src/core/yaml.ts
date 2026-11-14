/**
 * Сериализация frontmatter в YAML для новых файлов.
 *
 * `processFrontMatter` работает только с существующими файлами, поэтому при
 * создании заметки frontmatter собирается вручную. Все строки пишутся в
 * двойных кавычках — это всегда корректный YAML и снимает вопросы с
 * двоеточиями, решётками и кириллицей в названиях.
 *
 * Чистая логика: без импортов obsidian.
 */

/** Экранировать скаляр в двойные кавычки. */
function scalar(value: unknown): string {
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	const text = String(value);
	return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Собрать полный текст заметки: frontmatter + тело.
 * `undefined`/`null` пропускаются; пустой массив пишется как `key: []`.
 */
export function serializeNote(
	frontmatter: Record<string, unknown>,
	body = "",
): string {
	const lines: string[] = ["---"];
	for (const [key, value] of Object.entries(frontmatter)) {
		if (value === undefined || value === null) {
			continue;
		}
		if (Array.isArray(value)) {
			if (value.length === 0) {
				lines.push(`${key}: []`);
				continue;
			}
			lines.push(`${key}:`);
			for (const item of value) {
				lines.push(`  - ${scalar(item)}`);
			}
			continue;
		}
		lines.push(`${key}: ${scalar(value)}`);
	}
	lines.push("---", "");

	const trimmedBody = body.trim();
	return trimmedBody === ""
		? lines.join("\n")
		: `${lines.join("\n")}\n${trimmedBody}\n`;
}
