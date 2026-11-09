import { App } from "obsidian";
import { FieldModal, FieldModalParams } from "../FieldModal";

function asBoolean(value: unknown): boolean {
	return value === true || value === "true";
}

/**
 * Модалка boolean — DESIGN.md §7.5.2.
 * В строке виджета — toggle без модалки; Alt+click / кнопка ✎ —
 * эта модалка с toggle + OK (для единообразия).
 */
export class BooleanModal extends FieldModal {
	private isOn = false;

	constructor(app: App, params: FieldModalParams) {
		super(app, params);
	}

	protected renderBody(body: HTMLElement): void {
		this.isOn = asBoolean(this.params.currentValue);

		const row = body.createEl("div", { cls: "meta-kb-modal-row" });
		row.createEl("span", { cls: "meta-kb-modal-row-label", text: "Значение" });

		const toggle = row.createEl("div", {
			cls: `meta-kb-switch${this.isOn ? " is-on" : ""}`,
		});
		toggle.setAttribute("role", "switch");
		toggle.setAttribute("aria-checked", String(this.isOn));
		toggle.addEventListener("click", () => {
			this.isOn = !this.isOn;
			toggle.toggleClass("is-on", this.isOn);
			toggle.setAttribute("aria-checked", String(this.isOn));
		});

		body.createEl("div", {
			cls: "meta-kb-modal-hint",
			text: "OK запишет true/false. «Очистить» удалит ключ.",
		});
	}

	protected readValue(): unknown {
		return this.isOn;
	}
}
