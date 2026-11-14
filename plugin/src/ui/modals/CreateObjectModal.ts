import { App, Modal } from "obsidian";

export interface CreateObjectTypeOption {
	typeValue: string;
	label: string;
	group?: string;
}

export interface CreateObjectModalParams {
	types: CreateObjectTypeOption[];
	/** `id` определения типа или null, если определения нет в хранилище. */
	definitionLookup: (typeValue: string) => string | null;
	/** Папка, куда попадёт файл ('' — корень хранилища). */
	folder: string;
	onSubmit: (typeValue: string, title: string) => void | Promise<void>;
}

/**
 * Модалка создания объекта: выбор типа и названия.
 *
 * Показывает, как будет называться файл и заполнится ли `defined_by` —
 * последнее зависит от того, созданы ли определения типов (bootstrap).
 */
export class CreateObjectModal extends Modal {
	private readonly params: CreateObjectModalParams;
	private selectEl: HTMLSelectElement | null = null;
	private inputEl: HTMLInputElement | null = null;
	private hintEl: HTMLElement | null = null;
	private okBtn: HTMLButtonElement | null = null;

	constructor(app: App, params: CreateObjectModalParams) {
		super(app);
		this.params = params;
	}

	override onOpen(): void {
		this.titleEl.setText("Создать объект");
		const body = this.contentEl.createEl("div", { cls: "meta-kb-modal-body" });

		const typeRow = body.createEl("div", { cls: "meta-kb-modal-row" });
		typeRow.createEl("label", { text: "Тип" });
		const select = typeRow.createEl("select", { cls: "dropdown" });
		this.selectEl = select;

		const groups = new Map<string, CreateObjectTypeOption[]>();
		for (const type of this.params.types) {
			const key = type.group ?? "";
			const bucket = groups.get(key);
			if (bucket) {
				bucket.push(type);
			} else {
				groups.set(key, [type]);
			}
		}
		for (const [group, items] of groups) {
			const parent: HTMLElement = group
				? select.createEl("optgroup", { attr: { label: group } })
				: select;
			for (const item of items) {
				parent.createEl("option", {
					text: item.label,
					value: item.typeValue,
				});
			}
		}
		select.addEventListener("change", () => this.updateHint());

		const titleRow = body.createEl("div", { cls: "meta-kb-modal-row" });
		titleRow.createEl("label", { text: "Название" });
		const input = titleRow.createEl("input", { cls: "meta-kb-input" });
		input.type = "text";
		input.placeholder = "Например: Мастер и Маргарита";
		this.inputEl = input;
		input.addEventListener("input", () => this.updateOk());
		input.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				void this.submit();
			}
		});

		this.hintEl = body.createEl("div", { cls: "meta-kb-modal-hint" });

		const footer = this.contentEl.createEl("div", { cls: "meta-kb-modal-footer" });
		const cancelBtn = footer.createEl("button", { text: "Отмена" });
		cancelBtn.type = "button";
		cancelBtn.addEventListener("click", () => this.close());
		const okBtn = footer.createEl("button", { text: "Создать", cls: "mod-cta" });
		okBtn.type = "button";
		this.okBtn = okBtn;
		okBtn.addEventListener("click", () => {
			void this.submit();
		});

		this.updateHint();
		this.updateOk();
		input.focus();
	}

	private currentType(): string {
		return this.selectEl?.value ?? "";
	}

	private updateHint(): void {
		if (!this.hintEl) {
			return;
		}
		const typeValue = this.currentType();
		const folder = this.params.folder ? `${this.params.folder}/` : "";
		const defined = this.params.definitionLookup(typeValue);
		const lines: string[] = [`Файл: ${folder}${typeValue}_{id}.md`];
		if (defined) {
			lines.push("defined_by будет заполнен определением типа.");
		} else {
			lines.push(
				"Определение этого типа в хранилище не найдено: defined_by не будет " +
					"заполнен. Выполните команду «Bootstrap metamodel».",
			);
		}
		this.hintEl.setText(lines.join("\n"));
	}

	private updateOk(): void {
		if (this.okBtn) {
			this.okBtn.disabled = (this.inputEl?.value ?? "").trim() === "";
		}
	}

	private async submit(): Promise<void> {
		const title = (this.inputEl?.value ?? "").trim();
		const typeValue = this.currentType();
		if (!title || !typeValue) {
			return;
		}
		this.close();
		await this.params.onSubmit(typeValue, title);
	}
}
