import { App, Modal } from "obsidian";

/** Книга для выпадающего списка. */
export interface ChapterBookOption {
	/** Канонический `linkpath`: `book_{id}`. */
	linkpath: string;
	label: string;
}

export interface ChapterModalParams {
	books: ChapterBookOption[];
	/**
	 * Книга и номер уже известны (C-CH-04: соседняя глава отсутствует —
	 * спрашиваем только имя).
	 */
	fixed?: {
		bookLinkpath: string;
		bookLabel: string;
		position: number;
		existingTitle?: string;
	};
	initialBook: string;
	initialPosition: number;
	/** Существующая глава для книги+номера: подсказка «будет обновлена» (C-CH-06). */
	lookup: (
		bookLinkpath: string,
		position: number,
	) => { title: string } | null;
	onSubmit: (value: {
		bookLinkpath: string;
		position: number;
		title: string;
	}) => void | Promise<void>;
}

/**
 * Диалог создания главы (ADR-002, C-CH-01, C-CH-02, C-CH-06).
 *
 * Спрашивает книгу, номер и имя. Имя можно пропустить: тогда подставляется
 * «Глава - N», а если глава с таким номером уже есть — её имя сохраняется.
 * Дырки в нумерации разрешены: номер может быть любым свободным.
 */
export class ChapterModal extends Modal {
	private readonly params: ChapterModalParams;
	private bookValue: string;
	private positionValue: number;
	private titleValue = "";
	private titleInput: HTMLInputElement | null = null;
	private messageEl: HTMLElement | null = null;
	private okBtn: HTMLButtonElement | null = null;

	constructor(app: App, params: ChapterModalParams) {
		super(app);
		this.params = params;
		this.bookValue = params.fixed?.bookLinkpath ?? params.initialBook;
		this.positionValue = params.fixed?.position ?? params.initialPosition;
	}

	override onOpen(): void {
		this.modalEl.addClass("meta-kb-chapter-modal");
		this.titleEl.setText(
			this.params.fixed ? "Новая глава" : "Создать главу",
		);

		const body = this.contentEl.createEl("div", { cls: "meta-kb-modal-body" });

		if (this.params.fixed) {
			// C-CH-04: книга и номер вычислены из текущей главы.
			body.createEl("div", {
				cls: "meta-kb-modal-subtitle",
				text:
					`${this.params.fixed.bookLabel} · глава №${this.params.fixed.position}`,
			});
		} else {
			const bookRow = body.createEl("div", { cls: "meta-kb-modal-row" });
			bookRow.createEl("label", { text: "Книга" });
			const select = bookRow.createEl("select", { cls: "meta-kb-input" });
			for (const book of this.params.books) {
				const option = select.createEl("option", {
					text: book.label,
					value: book.linkpath,
				});
				option.selected = book.linkpath === this.bookValue;
			}
			select.addEventListener("change", () => {
				this.bookValue = select.value;
				this.updateState();
			});

			const positionRow = body.createEl("div", { cls: "meta-kb-modal-row" });
			positionRow.createEl("label", { text: "Номер" });
			const positionInput = positionRow.createEl("input", {
				cls: "meta-kb-input",
			});
			positionInput.type = "number";
			positionInput.min = "1";
			positionInput.step = "1";
			positionInput.value = String(this.positionValue);
			positionInput.addEventListener("input", () => {
				this.positionValue = Number(positionInput.value);
				this.updateState();
			});
		}

		const titleRow = body.createEl("div", { cls: "meta-kb-modal-row" });
		titleRow.createEl("label", { text: "Название" });
		const titleInput = titleRow.createEl("input", { cls: "meta-kb-input" });
		titleInput.type = "text";
		titleInput.placeholder = "Можно пропустить — подставится «Глава - N»";
		titleInput.addEventListener("input", () => {
			this.titleValue = titleInput.value;
			this.updateState();
		});
		this.titleInput = titleInput;

		this.messageEl = body.createEl("div", { cls: "meta-kb-modal-hint" });

		const footer = this.contentEl.createEl("div", { cls: "meta-kb-modal-footer" });
		const cancelBtn = footer.createEl("button", { text: "Отмена" });
		cancelBtn.type = "button";
		cancelBtn.addEventListener("click", () => this.close());

		const okBtn = footer.createEl("button", { text: "OK", cls: "mod-cta" });
		okBtn.type = "button";
		okBtn.addEventListener("click", () => {
			void this.submit();
		});
		this.okBtn = okBtn;

		this.updateState();
		this.titleInput.focus();
	}

	private updateState(): void {
		const existing =
			this.bookValue === ""
				? null
				: this.params.lookup(this.bookValue, this.positionValue);

		let message = "";
		let invalid = false;
		if (this.bookValue === "") {
			message = "Выберите книгу.";
			invalid = true;
		} else if (
			!Number.isInteger(this.positionValue) ||
			this.positionValue < 1
		) {
			message = "Номер главы — целое число ≥ 1.";
			invalid = true;
		} else if (existing) {
			// Не ошибка: C-CH-06 — это обновление существующей главы.
			message =
				`Глава №${this.positionValue} уже есть: «${existing.title}». ` +
				"Имя сохранится, если не вводить своё.";
		}

		if (this.messageEl) {
			this.messageEl.setText(message);
			if (message === "") {
				this.messageEl.hide();
			} else {
				this.messageEl.show();
			}
		}
		if (this.okBtn) {
			this.okBtn.disabled = invalid;
		}
	}

	private async submit(): Promise<void> {
		if (this.okBtn?.disabled) {
			return;
		}
		this.close();
		await this.params.onSubmit({
			bookLinkpath: this.bookValue,
			position: this.positionValue,
			title: this.titleValue,
		});
	}
}