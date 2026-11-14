import type { App } from "obsidian";
import { FieldModal } from "./BaseFieldModal";
import type { FieldModalParams } from "./BaseFieldModal";
import { StringModal } from "./types/StringModal";
import { NumberModal } from "./types/NumberModal";
import { BooleanModal } from "./types/BooleanModal";
import { EnumModal } from "./types/EnumModal";
import { DateModal } from "./types/DateModal";
import { LinkModal } from "./types/LinkModal";

// Реэкспорт, чтобы потребители по-прежнему импортировали из "./modals/FieldModal".
export { FieldModal };
export type { FieldModalParams };

/**
 * Фабрика модалок поля.
 *
 * ВНИМАНИЕ: этот модуль импортирует всех наследников `FieldModal`. Базовый
 * класс вынесен в `BaseFieldModal.ts`, у которого нет обратных зависимостей —
 * иначе возникает цикл «база ↔ наследники» и `main.js` не загружается
 * (см. комментарий в `BaseFieldModal.ts`).
 */

/** Открыть модалку редактирования поля по value_type. */
export function openFieldModal(app: App, params: FieldModalParams): void {
	const modal = createFieldModal(app, params);
	if (modal) {
		modal.open();
	}
}

function createFieldModal(app: App, params: FieldModalParams): FieldModal | null {
	switch (params.valueType) {
		case "string":
		case "text":
		case "list<string>":
		case "datetime":
			return new StringModal(app, params);
		case "number":
			return new NumberModal(app, params);
		case "boolean":
			return new BooleanModal(app, params);
		case "enum":
		case "list<enum>":
			return new EnumModal(app, params);
		case "date":
			return new DateModal(app, params);
		case "link":
		case "list<link>":
			return new LinkModal(app, params);
		case "media":
		case "list<media>":
			// `media` редактируется галереей миниатюр (`MediaPickerModal`) из
			// `PropertiesView`: ей нужны Registry, индекс вложений и создание
			// обёртки на месте, которых нет в `FieldModalParams` (DESIGN §4–5).
			// Сюда управление не попадает; null — чтобы не открыть текстовый
			// редактор вместо выбора изображения.
			return null;
		case "uuid":
			// Машинное поле: UI-редактирование запрещено (DESIGN.md §7.5.6).
			return null;
		default:
			return new StringModal(app, params);
	}
}
