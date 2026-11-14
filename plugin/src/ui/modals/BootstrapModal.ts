import { App, Modal } from "obsidian";

export interface BootstrapPlanSummary {
	typeValue: string;
	label: string;
}

export interface BootstrapModalParams {
	missingMetatypes: BootstrapPlanSummary[];
	missingCoreTypes: BootstrapPlanSummary[];
	/** Папка для определений ('' — корень хранилища). */
	folder: string;
	onConfirm: (withCoreTypes: boolean) => void | Promise<void>;
}

/**
 * Модалка bootstrap: что будет создано.
 *
 * Обязательная часть — 10 метатипов (bootstrap.md §Обязательно). Определения
 * 29 типов ядра — опциональны, но без них у новых объектов не заполняется
 * `defined_by`, поэтому предлагаются включёнными по умолчанию.
 */
export class BootstrapModal extends Modal {
	private readonly params: BootstrapModalParams;
	private withCoreTypes: boolean;

	constructor(app: App, params: BootstrapModalParams) {
		super(app);
		this.params = params;
		this.withCoreTypes = params.missingCoreTypes.length > 0;
	}

	override onOpen(): void {
		this.titleEl.setText("Bootstrap метамодели");
		const body = this.contentEl.createEl("div", { cls: "meta-kb-modal-body" });

		const folder = this.params.folder ? `${this.params.folder}/` : "корень хранилища";
		body.createEl("div", {
			cls: "meta-kb-modal-hint",
			text: `Определения будут созданы как заметки в папке: ${folder}`,
		});

		body.createEl("div", {
			cls: "meta-kb-modal-subtitle",
			text: `Метатипы: не хватает ${this.params.missingMetatypes.length} из 10`,
		});
		if (this.params.missingMetatypes.length > 0) {
			const list = body.createEl("div", { cls: "meta-kb-chips" });
			for (const item of this.params.missingMetatypes) {
				list.createEl("span", { cls: "meta-kb-chip", text: item.label });
			}
		}

		if (this.params.missingCoreTypes.length > 0) {
			const row = body.createEl("div", { cls: "meta-kb-modal-row" });
			const checkbox = row.createEl("input");
			checkbox.type = "checkbox";
			checkbox.checked = this.withCoreTypes;
			checkbox.addEventListener("change", () => {
				this.withCoreTypes = checkbox.checked;
			});
			row.createEl("label", {
				text:
					`Определения 29 типов ядра (не хватает ${this.params.missingCoreTypes.length}) — ` +
					"нужны, чтобы у новых объектов заполнялся defined_by",
			});
		}

		const footer = this.contentEl.createEl("div", { cls: "meta-kb-modal-footer" });
		const cancelBtn = footer.createEl("button", { text: "Отмена" });
		cancelBtn.type = "button";
		cancelBtn.addEventListener("click", () => this.close());
		const okBtn = footer.createEl("button", { text: "Создать", cls: "mod-cta" });
		okBtn.type = "button";
		okBtn.disabled =
			this.params.missingMetatypes.length === 0 &&
			this.params.missingCoreTypes.length === 0;
		okBtn.addEventListener("click", () => {
			const withCoreTypes = this.withCoreTypes;
			this.close();
			void this.params.onConfirm(withCoreTypes);
		});
	}
}
