import { App } from "obsidian";
import { enumValueLabel } from "../../../labels";
import { FieldModal } from "../BaseFieldModal";
import type { FieldModalParams } from "../BaseFieldModal";

function asStringSet(value: unknown): Set<string> {
	const result = new Set<string>();
	if (Array.isArray(value)) {
		for (const item of value) {
			result.add(String(item));
		}
	} else if (typeof value === "string" && value.trim() !== "") {
		result.add(value.trim());
	}
	return result;
}

function asScalarText(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return "";
}

/**
 * Модалка enum / list\<enum\> — DESIGN.md §7.5.3, §7.5.4.
 *
 * enum (одиночный)       → radio-список + вариант «(не задано)»
 * list\<enum\>            → multi-checkbox
 * Порядок значений — порядок enum_values (стабильность).
 * Если определения нет (ключ вне stub) — text input как fallback.
 */
export class EnumModal extends FieldModal {
	private selected = new Set<string>();
	private fallbackInput: HTMLInputElement | null = null;

	constructor(app: App, params: FieldModalParams) {
		super(app, params);
	}

	protected renderBody(body: HTMLElement): void {
		const values = this.params.enumValues;
		const isList = this.params.valueType === "list<enum>";

		if (!values || values.length === 0) {
			body.createEl("div", {
				cls: "meta-kb-modal-hint",
				text: "Определение enum пока недоступно (статический stub). Введите значение вручную.",
			});
			const input = body.createEl("input", { cls: "meta-kb-input" });
			input.type = "text";
			input.value = asScalarText(this.params.currentValue);
			this.fallbackInput = input;
			window.setTimeout(() => input.focus(), 50);
			return;
		}

		this.selected = asStringSet(this.params.currentValue);
		const list = body.createEl("div", { cls: "meta-kb-enum-list" });
		const radioGroupName = `meta-kb-enum-${this.params.key}`;

		if (!isList) {
			// Вариант «(не задано)» = удалить ключ (если поле не required).
			const noneRow = list.createEl("label", { cls: "meta-kb-enum-option" });
			const noneInput = noneRow.createEl("input");
			noneInput.type = "radio";
			noneInput.name = radioGroupName;
			noneInput.value = "";
			noneInput.checked = this.selected.size === 0;
			noneInput.addEventListener("change", () => {
				if (noneInput.checked) {
					this.selected.clear();
				}
			});
			noneRow.createEl("span", { cls: "meta-kb-enum-value", text: "(не задано)" });
		}

		for (const value of values) {
			const row = list.createEl("label", { cls: "meta-kb-enum-option" });
			const input = row.createEl("input");
			input.type = isList ? "checkbox" : "radio";
			if (!isList) {
				input.name = radioGroupName;
			}
			input.value = value;
			input.checked = this.selected.has(value);
			input.addEventListener("change", () => {
				if (isList) {
					if (input.checked) {
						this.selected.add(value);
					} else {
						this.selected.delete(value);
					}
				} else {
					this.selected.clear();
					if (input.checked) {
						this.selected.add(value);
					}
				}
			});
			row.createEl("span", {
				cls: "meta-kb-enum-value",
				text: enumValueLabel(this.params.key, value),
			});
			row.createEl("span", { cls: "meta-kb-enum-raw", text: value });
		}

		body.createEl("div", {
			cls: "meta-kb-modal-hint",
			text: isList
				? "Порядок значений — по определению. Пусто — удалить ключ."
				: "«(не задано)» — удалить ключ.",
		});
	}

	protected readValue(): unknown {
		if (this.fallbackInput) {
			const raw = this.fallbackInput.value.trim();
			return raw.length > 0 ? raw : undefined;
		}
		const values = this.params.enumValues ?? [];
		const chosen = values.filter((value) => this.selected.has(value));
		if (chosen.length === 0) {
			return undefined;
		}
		return this.params.valueType === "list<enum>" ? chosen : chosen[0];
	}
}
