import { App, Modal } from "obsidian";

export interface DeleteWrapperModalParams {
	wrapperTitle: string;
	attachmentPath: string;
	attachmentExists: boolean;
	/** Сколько других обёрток ссылается на тот же файл (нарушение C-IMG-05). */
	otherWrappers: number;
	onDeleteWrapper: () => void | Promise<void>;
	onDeleteBoth: () => void | Promise<void>;
}

/**
 * Удаление обёртки: обязательный запрос «удалять ли привязанный файл»
 * (ADR-003, C-IMG-07). Файл удаляется только по явному выбору.
 */
export class DeleteWrapperModal extends Modal {
	private readonly params: DeleteWrapperModalParams;

	constructor(app: App, params: DeleteWrapperModalParams) {
		super(app);
		this.params = params;
	}

	override onOpen(): void {
		this.titleEl.setText("Удалить обёртку изображения");
		const body = this.contentEl.createEl("div", { cls: "meta-kb-modal-body" });

		body.createEl("div", {
			cls: "meta-kb-modal-hint",
			text: `Обёртка: «${this.params.wrapperTitle}»`,
		});
		body.createEl("div", {
			cls: "meta-kb-modal-hint",
			text: this.params.attachmentPath
				? `Файл вложения: ${this.params.attachmentPath}`
				: "У обёртки не заполнено свойство «Вложение».",
		});

		if (this.params.attachmentExists && this.params.otherWrappers > 0) {
			body.createEl("div", {
				cls: "meta-kb-modal-todo",
				text:
					`На этот файл ссылается ещё ${this.params.otherWrappers} ` +
					"обёртка(и) — это нарушение инварианта «один файл → одна обёртка». " +
					"Удаление файла затронет и их.",
			});
		}

		const footer = this.contentEl.createEl("div", { cls: "meta-kb-modal-footer" });

		const cancelBtn = footer.createEl("button", { text: "Отмена" });
		cancelBtn.type = "button";
		cancelBtn.addEventListener("click", () => this.close());

		const wrapperOnlyBtn = footer.createEl("button", {
			text: "Только обёртку",
			cls: "mod-cta",
		});
		wrapperOnlyBtn.type = "button";
		wrapperOnlyBtn.addEventListener("click", () => {
			this.close();
			void this.params.onDeleteWrapper();
		});

		if (this.params.attachmentExists) {
			const bothBtn = footer.createEl("button", { text: "Обёртку и файл" });
			bothBtn.type = "button";
			bothBtn.addClass("mod-warning");
			bothBtn.addEventListener("click", () => {
				this.close();
				void this.params.onDeleteBoth();
			});
		}
	}
}
