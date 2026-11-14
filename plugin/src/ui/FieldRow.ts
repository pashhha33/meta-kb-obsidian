import { setIcon } from "obsidian";
import { FieldValueType, VALUE_TYPE_ICONS, parseCanonicalLink } from "../labels";

/** Данные для отрисовки одной строки поля. */
export interface FieldRowModel {
	key: string;
	label: string;
	valueType: FieldValueType;
	value: unknown;
	readOnly: boolean;
	/**
	 * Поле есть в эффективной схеме типа, но отсутствует в frontmatter:
	 * строка показывается приглушённо, как приглашение заполнить.
	 */
	absent?: boolean;
	/** Форматирование datetime по настройкам плагина. */
	formatDatetime: (iso: unknown) => string;
	/** Подпись значения enum (из контракта). */
	enumValueLabelFn: (raw: string) => string;
}

/** Действия строки. */
export interface FieldRowActions {
	/** Открыть модалку редактирования (кнопка ✎ / Alt+click). */
	onEdit: () => void;
	/** Переключить boolean в строке (DESIGN.md §7.5.2). */
	onBooleanToggle: (next: boolean) => void;
	/** Открыть цель ссылки (link / list<link>). */
	onOpenLink: (raw: string) => void;
}

function asBoolean(value: unknown): boolean {
	return value === true || value === "true";
}

/**
 * Строка поля в виджете (DESIGN.md §7.4):
 *   [icon value_type]  Label  [value summary]  [✎]
 * boolean — toggle прямо в строке, Alt+click — модалка.
 */
export class FieldRow {
	constructor(
		container: HTMLElement,
		model: FieldRowModel,
		actions: FieldRowActions,
	) {
		const row = container.createEl("div", {
			cls:
				"meta-kb-field-row" +
				(model.readOnly ? " is-read-only" : "") +
				(model.absent ? " is-absent" : ""),
		});
		row.setAttribute("data-key", model.key);
		row.setAttribute("data-value-type", model.valueType);

		// Иконка value_type
		const iconEl = row.createEl("span", { cls: "meta-kb-field-icon" });
		setIcon(iconEl, VALUE_TYPE_ICONS[model.valueType]);
		iconEl.setAttribute("aria-hidden", "true");

		// Label (+ tooltip = property_key)
		const labelEl = row.createEl("span", {
			cls: "meta-kb-field-label",
			text: model.label,
		});
		labelEl.setAttribute("title", model.key);

		// Значение: boolean → toggle, иначе summary
		if (model.valueType === "boolean" && !model.readOnly) {
			this.renderInlineToggle(row, model, actions);
		} else {
			const valueEl = row.createEl("span", { cls: "meta-kb-field-value" });
			this.renderValue(valueEl, model, actions);
		}

		// Кнопка ✎ (только для редактируемых полей)
		if (!model.readOnly) {
			const actionsEl = row.createEl("span", { cls: "meta-kb-field-actions" });
			const editBtn = actionsEl.createEl("button", {
				cls: "meta-kb-icon-button",
			});
			editBtn.type = "button";
			editBtn.setAttribute("aria-label", "Редактировать");
			setIcon(editBtn, "pencil");
			editBtn.addEventListener("click", (evt: MouseEvent) => {
				evt.stopPropagation();
				actions.onEdit();
			});
		}

		// Alt+click по строке → модалка (для boolean — DESIGN.md §7.5.2,
		// для остальных — быстрый доступ к полному редактору).
		row.addEventListener("click", (evt: MouseEvent) => {
			if (evt.altKey && !model.readOnly) {
				actions.onEdit();
			}
		});
	}

	/** Toggle boolean без модалки (критерий приёмки задания). */
	private renderInlineToggle(
		row: HTMLElement,
		model: FieldRowModel,
		actions: FieldRowActions,
	): void {
		const isOn = asBoolean(model.value);
		const toggle = row.createEl("div", {
			cls: `meta-kb-switch${isOn ? " is-on" : ""}`,
		});
		toggle.setAttribute("role", "switch");
		toggle.setAttribute("aria-checked", String(isOn));
		toggle.addEventListener("click", (evt: MouseEvent) => {
			if (evt.altKey) {
				actions.onEdit();
				return;
			}
			actions.onBooleanToggle(!toggle.hasClass("is-on"));
		});
	}

	/** Сводка значения по value_type (DESIGN.md §7.4, §7.5.1.6). */
	private renderValue(
		valueEl: HTMLElement,
		model: FieldRowModel,
		actions: FieldRowActions,
	): void {
		const v = model.value;

		if (v === null || v === undefined) {
			valueEl.setText("—");
			valueEl.addClass("is-empty");
			return;
		}

		if (Array.isArray(v)) {
			if (v.length === 0) {
				valueEl.setText("—");
				valueEl.addClass("is-empty");
				return;
			}
			if (model.valueType === "list<link>" || model.valueType === "list<media>") {
				// до 2 title + «+N» (DESIGN.md §7.5.1.6)
				const titles = v.map((item) => {
					const parsed =
						typeof item === "string" ? parseCanonicalLink(item) : null;
					return parsed ? parsed.alias : String(item);
				});
				const head = titles.slice(0, 2).join(", ");
				valueEl.setText(titles.length > 2 ? `${head} +${titles.length - 2}` : head);
				valueEl.setAttribute("title", titles.join("\n"));
				const first = v[0];
				if (typeof first === "string") {
					this.makeLinkOpenable(valueEl, first, actions);
				}
			} else {
				// list<string> / list<enum>
				const shown = v
					.slice(0, 3)
					.map((item) =>
						typeof item === "string" ? model.enumValueLabelFn(item) : String(item),
					);
				const text =
					v.length > 3 ? `${shown.join(", ")} +${v.length - 3}` : shown.join(", ");
				valueEl.setText(text);
				valueEl.setAttribute("title", v.map(String).join("\n"));
			}
			return;
		}

		if (typeof v === "boolean") {
			valueEl.setText(v ? "Да" : "Нет");
			return;
		}

		if (typeof v === "number") {
			valueEl.setText(String(v));
			return;
		}

		if (typeof v === "string") {
			switch (model.valueType) {
				case "datetime":
					valueEl.setText(model.formatDatetime(v));
					return;
				case "date":
					valueEl.setText(v);
					return;
				case "link":
				case "media": {
					const parsed = parseCanonicalLink(v);
					valueEl.setText(parsed ? parsed.alias : v);
					this.makeLinkOpenable(valueEl, v, actions);
					return;
				}
				default: {
					const multiline = v.includes("\n");
					const display = multiline ? `${v.split("\n")[0]}…` : v;
					valueEl.setText(display);
					if (v.length > 40 || multiline) {
						valueEl.setAttribute("title", v);
					}
					return;
				}
			}
		}

		valueEl.setText(String(v));
	}

	/** Клик по значению-ссылке открывает цель (если резолвится). */
	private makeLinkOpenable(
		el: HTMLElement,
		raw: string,
		actions: FieldRowActions,
	): void {
		if (!parseCanonicalLink(raw)) {
			return;
		}
		el.addClass("is-link");
		el.addEventListener("click", (evt: Event) => {
			evt.stopPropagation();
			actions.onOpenLink(raw);
		});
	}
}
