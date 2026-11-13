/**
 * Фасад определений полей/отношений. Ранее — статический stub; теперь все
 * данные приходят из машинного контракта `schema/metamodel.json` через
 * `core/metamodel.ts`. Здесь остаётся только презентация (иконки value_type).
 */
export {
	enumValueLabel,
	resolveField,
	propertyDef,
	relationDef,
	VALUE_TYPES,
	METATYPES,
} from "./core/metamodel";
export type {
	FieldValueType,
	FieldGroup,
	ResolvedField,
	MetamodelContract,
} from "./core/metamodel";
export { parseCanonicalLink } from "./core/link";

/** Иконки value_type (lucide) для строки виджета — DESIGN.md §7.4. */
export const VALUE_TYPE_ICONS: Record<string, string> = {
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
