/**
 * Статический stub определений полей и отношений.
 *
 * Итерация: ITER-2026-11-06-0 (AGENT-TASK.md, требование 3).
 * Временно замещает чтение объектов `property` / `relation` из vault:
 * полноценный Registry появится в следующем срезе (plugin/DESIGN.md §7.8).
 *
 * Источники значений — метамодель baseline v1:
 *   - metamodel/ontology.md  §4.1 (универсальные свойства)
 *   - metamodel/properties.md §2–3 (свойства ядра, person, computed)
 *   - metamodel/relations.md  §2–3 (отношения классификации и ядра)
 *   - metamodel/types.md      §2 (value_type), §3.1 (labels occupation)
 */

/** Все 14 value_type из metamodel/types.md §2. */
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

interface PropertyStub {
	label: string;
	valueType: FieldValueType;
	enumValues?: string[];
	readOnly?: boolean;
	/** По умолчанию "schema". */
	group?: FieldGroup;
}

/** Значения enum `occupation` — properties.md §3.5 (29 значений). */
export const OCCUPATION_VALUES: string[] = [
	"developer",
	"designer",
	"researcher",
	"teacher",
	"writer",
	"manager",
	"actor",
	"director",
	"producer",
	"screenwriter",
	"composer",
	"musician",
	"singer",
	"photographer",
	"artist",
	"animator",
	"journalist",
	"host",
	"voice-actor",
	"politician",
	"ruler",
	"military",
	"scientist",
	"philosopher",
	"religious-figure",
	"explorer",
	"entrepreneur",
	"athlete",
	"activist",
];

/**
 * Статические определения свойств.
 * `label` = будущий `title` объекта `property` (INV-16).
 */
export const FIELD_STUBS: Record<string, PropertyStub> = {
	// --- Универсальные свойства (ontology.md §4.1 / properties.md §2) ---
	id: { label: "Идентификатор", valueType: "uuid", group: "system", readOnly: true },
	type: { label: "Тип", valueType: "string", group: "system" },
	defined_by: { label: "Определён типом", valueType: "uuid", group: "system", readOnly: true },
	title: { label: "Название", valueType: "string" },
	aliases: { label: "Альтернативные имена", valueType: "list<string>" },
	layer: {
		label: "Слой",
		valueType: "enum",
		enumValues: ["system", "classification", "content"],
		group: "system",
	},
	status: {
		label: "Статус",
		valueType: "enum",
		enumValues: ["draft", "accepted", "deprecated"],
		group: "system",
	},
	created_at: { label: "Создано", valueType: "datetime", group: "system", readOnly: true },
	updated_at: { label: "Изменено", valueType: "datetime", group: "system", readOnly: true },

	// Служебный ключ определений типа (properties.md §2)
	type_value: { label: "Значение типа", valueType: "string" },

	// --- Медиа и вложения (properties.md §3.1) ---
	cover: { label: "Обложка", valueType: "media" },
	poster: { label: "Постер", valueType: "media" },
	photo: { label: "Фотография", valueType: "media" },
	artwork: { label: "Иллюстрации", valueType: "list<media>" },
	attachment: { label: "Вложение", valueType: "string" },
	roles: {
		label: "Роли изображения",
		valueType: "list<enum>",
		enumValues: [
			"cover",
			"poster",
			"logo",
			"illustration",
			"art",
			"photo",
			"icon",
			"thumbnail",
		],
	},

	// --- Идентификаторы и даты (properties.md §3.2) ---
	url: { label: "URL", valueType: "string" },
	isbn: { label: "ISBN", valueType: "string" },
	published: { label: "Дата публикации", valueType: "date" },
	year: { label: "Год", valueType: "number" },
	date: { label: "Дата", valueType: "date" },
	due: { label: "Срок", valueType: "date" },
	completed: { label: "Выполнено", valueType: "date" },

	// --- Размер, порядок, страница (properties.md §3.3) ---
	duration: { label: "Длительность", valueType: "number" },
	position: { label: "Позиция", valueType: "number" },
	page: { label: "Страница", valueType: "string" },
	"page-count": { label: "Объём в страницах", valueType: "number" },
	"char-count": { label: "Знаки", valueType: "number", group: "computed", readOnly: true },
	"author-sheets": {
		label: "Авторские листы",
		valueType: "number",
		group: "computed",
		readOnly: true,
	},

	// --- Фильм: сборы (properties.md §3.4) ---
	"box-office-domestic": { label: "Внутренние сборы", valueType: "number" },
	"box-office-worldwide": { label: "Мировые сборы", valueType: "number" },

	// --- Персона и триггеры field-expansion (properties.md §3.5) ---
	occupation: { label: "Профессия", valueType: "list<enum>", enumValues: OCCUPATION_VALUES },
	specialization: { label: "Специализация", valueType: "list<string>" },
	format: {
		label: "Формат издания",
		valueType: "enum",
		enumValues: ["ebook", "paper", "audiobook"],
	},
	"creation-method": {
		label: "Способ создания",
		valueType: "enum",
		enumValues: ["ai-generated", "photograph", "scan", "illustration"],
	},
	model: { label: "Модель", valueType: "string" },
	prompt: { label: "Запрос", valueType: "text" },
	seed: { label: "Сид", valueType: "number" },

	// --- Свойства person (properties.md §3) ---
	"birth-date": { label: "Дата рождения", valueType: "date" },
	"death-date": { label: "Дата смерти", valueType: "date" },
	"birth-place": { label: "Место рождения", valueType: "link" },
	"death-place": { label: "Место смерти", valueType: "link" },
	citizenship: { label: "Гражданство", valueType: "list<string>" },
	"field-of-work": { label: "Область деятельности", valueType: "list<string>" },
	office: { label: "Должность / пост", valueType: "list<string>" },
	party: { label: "Партия", valueType: "list<string>" },
	"military-rank": { label: "Воинское звание", valueType: "string" },
	sport: { label: "Вид спорта", valueType: "list<string>" },
	instrument: { label: "Инструмент", valueType: "list<string>" },
	genre: { label: "Жанр", valueType: "list<string>" },
};

/**
 * Отношения ядра и классификации (relations.md §2–3).
 * `multiple` = кратность 0..* / 1..* (хранение списком);
 * одиночная кратность (0..1 / 1..1) — значение-ссылка.
 */
export const RELATION_STUBS: Record<string, { label: string; multiple: boolean }> = {
	// Классификация (4)
	parent: { label: "Родительская категория", multiple: false },
	"category-domain": { label: "Домен категории", multiple: false },
	"object-category": { label: "Категория объекта", multiple: true },
	"object-facet-value": { label: "Значение фасета", multiple: true },

	// Ядро (16)
	author: { label: "Автор", multiple: true },
	about: { label: "О чём", multiple: true },
	"part-of": { label: "Часть целого", multiple: true },
	participant: { label: "Участник", multiple: true },
	"derived-from": { label: "Произведено из", multiple: true },
	supports: { label: "Поддерживает", multiple: true },
	blocks: { label: "Блокирует", multiple: true },
	"located-in": { label: "Находится в", multiple: true },
	"member-of": { label: "Состоит в", multiple: true },
	references: { label: "Ссылается на", multiple: true },
	contradicts: { label: "Противоречит", multiple: true },
	"chapter-of": { label: "Глава книги", multiple: false },
	"part-of-collection": { label: "Элемент коллекции", multiple: true },
	narrator: { label: "Чтец", multiple: true },
	director: { label: "Режиссёр", multiple: true },
	actor: { label: "Актёр", multiple: true },
};

/** Русские подписи значений enum (types.md §3.1, ontology.md §3/§5). */
export const ENUM_VALUE_LABELS: Record<string, Record<string, string>> = {
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
	occupation: {
		developer: "Разработчик",
		designer: "Дизайнер",
		researcher: "Исследователь",
		teacher: "Преподаватель",
		writer: "Писатель",
		manager: "Менеджер",
		actor: "Актёр",
		director: "Режиссёр",
		producer: "Продюсер",
		screenwriter: "Сценарист",
		composer: "Композитор",
		musician: "Музыкант",
		singer: "Певец",
		photographer: "Фотограф",
		artist: "Художник",
		animator: "Аниматор",
		journalist: "Журналист",
		host: "Ведущий",
		"voice-actor": "Актёр озвучки",
		politician: "Политик",
		ruler: "Правитель",
		military: "Военный",
		scientist: "Учёный",
		philosopher: "Философ",
		"religious-figure": "Религиозный деятель",
		explorer: "Путешественник",
		entrepreneur: "Предприниматель",
		athlete: "Спортсмен",
		activist: "Общественный деятель",
	},
};

/** Подпись значения enum: из статического stub или само значение. */
export function enumValueLabel(propertyKey: string, raw: string): string {
	return ENUM_VALUE_LABELS[propertyKey]?.[raw] ?? raw;
}

/** Иконки value_type (lucide) для строки виджета — DESIGN.md §7.4. */
export const VALUE_TYPE_ICONS: Record<FieldValueType, string> = {
	string: "type",
	text: "align-left",
	number: "hash",
	boolean: "toggle-left",
	date: "calendar",
	datetime: "clock",
	enum: "list",
	"list<string>": "list",
	"list<enum>": "list-checks",
	link: "link",
	"list<link>": "link-2",
	uuid: "fingerprint",
	media: "image",
	"list<media>": "images",
};

const WIKILINK_RE = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/;

/**
 * Разбор канонической ссылки `[[{type_prefix}_{id}|{title}]]` (INV-15).
 * Возвращает { linkpath, alias } или null для неканонических строк.
 */
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

/** Вывод value_type из значения для ключей без stub. */
function inferValueType(value: unknown): FieldValueType {
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

/**
 * Статическое разрешение ключа frontmatter в описание поля.
 *
 * Порядок: отношение → свойство из stub → вывод из значения.
 * Ключ без определения: label = key (требование 3 задания).
 */
export function resolveField(key: string, value: unknown): ResolvedField {
	const relation = RELATION_STUBS[key];
	if (relation) {
		return {
			key,
			label: relation.label,
			valueType: relation.multiple ? "list<link>" : "link",
			readOnly: false,
			group: "relations",
		};
	}

	const stub = FIELD_STUBS[key];
	if (stub) {
		return {
			key,
			label: stub.label,
			valueType: stub.valueType,
			enumValues: stub.enumValues,
			readOnly: stub.readOnly ?? false,
			group: stub.group ?? "schema",
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
