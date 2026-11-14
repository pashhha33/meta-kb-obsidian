import { App } from "obsidian";
import { FieldModal } from "../BaseFieldModal";
import type { FieldModalParams } from "../BaseFieldModal";

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
 * Модалка date — DESIGN.md §7.5.5.
 * date picker → запись YYYY-MM-DD (ISO 8601 без времени).
 * Пусто → удалить ключ.
 */
export class DateModal extends FieldModal {
	private input: HTMLInputElement | null = null;

	constructor(app: App, params: FieldModalParams) {
		super(app, params);
	}

	protected renderBody(body: HTMLElement): void {
		const input = body.createEl("input", { cls: "meta-kb-input" });
		input.type = "date";

		const current = asScalarText(this.params.currentValue);
		if (/^\d{4}-\d{2}-\d{2}$/.test(current)) {
			input.value = current;
		} else if (current !== "") {
			body.createEl("div", {
				cls: "meta-kb-modal-hint",
				text: `Текущее значение «${current}» не распознано как дата YYYY-MM-DD и не подставлено.`,
			});
		}

		body.createEl("div", {
			cls: "meta-kb-modal-hint",
			text: "Пусто — удалить ключ.",
		});
		this.input = input;
	}

	protected readValue(): unknown {
		const raw = this.input ? this.input.value : "";
		return raw !== "" ? raw : undefined;
	}
}
