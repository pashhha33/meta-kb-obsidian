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
	propertyDef,
	relationDef,
	requiredFor,
	resolveField,
} from "./metamodel";
import { effectiveSchema } from "./schema";

export type Severity = "error" | "warning";

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

/**
 * Прогнать все правила по записям Registry.
 *
 * Порядок находок стабилен: по файлу, затем по `rule_key` — чтобы отчёт не
 * «прыгал» между запусками.
 */
export function validateVault(records: ObjectRecord[]): ValidationResult {
	const ctx: Context = {
		records,
		byLinkpath: new Map(records.map((record) => [linkpathOf(record), record])),
		contentKeys: (record) =>
			Object.keys(record.props).filter((key) => !SYSTEM_KEYS.has(key)),
	};

	const findings: Finding[] = [];
	findings.push(...ruleUniqueId(ctx));
	findings.push(...ruleAttachmentUnique(ctx));
	for (const record of records) {
		findings.push(...ruleFilename(record));
		findings.push(...ruleAliases(record));
		findings.push(...ruleImageAttachment(record));
		findings.push(...ruleLinks(record, ctx));
		findings.push(...ruleInactiveField(record, ctx));
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