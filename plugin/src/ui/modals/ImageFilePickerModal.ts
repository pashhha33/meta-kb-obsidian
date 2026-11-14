import { App, Modal } from "obsidian";
import type { AttachDecision } from "../../core/attachment";

export interface ImageFilePickerParams {
	/**
	 * `create-wrapper` — создаётся объект `image` (спрашиваем имя),
	 * `pick-attachment` — выбирается значение свойства `attachment`.
	 */
	mode: "create-wrapper" | "pick-attachment";
	/** Все изображения хранилища (пути). */
	imagePaths: string[];
	/** Решение о привязке: разрешено ли и чья обёртка уже есть (C-IMG-05). */
	decide: (path: string) => AttachDecision;
	/** URL превью через getResourcePath; null — превью недоступно. */
	resourcePath: (path: string) => string | null;
	initialPath?: string;
	onSubmit: (payload: { title: string; attachment: string }) => void | Promise<void>;
	/** Перейти к уже существующей обёртке (C-IMG-05). */
	onOpenExisting?: (id: string) => void;
}

function basename(path: string): string {
	const parts = path.split("/");
	return parts[parts.length - 1] ?? path;
}

function titleFromPath(path: string): string {
	const name = basename(path);
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Выбор изображения из хранилища: галерея миниатюр + ручной путь.
 *
 * Реализует C-IMG-04 (выбор источника и запрет второй обёртки на тот же файл)
 * и используется как для создания обёртки, так и для свойства `attachment`.
 */
export class ImageFilePickerModal extends Modal {
	private readonly params: ImageFilePickerParams;
	private titleInput: HTMLInputElement | null = null;
	private pathInput: HTMLInputElement | null = null;
	private messageEl: HTMLElement | null = null;
	private okBtn: HTMLButtonElement | null = null;
	private existingBtn: HTMLButtonElement | null = null;
	private selectedPath = "";

	constructor(app: App, params: ImageFilePickerParams) {
		super(app);
		this.params = params;
		this.selectedPath = params.initialPath ?? "";
	}

	override onOpen(): void {
		this.titleEl.setText(
			this.params.mode === "create-wrapper"
				? "Создать обёртку изображения"
				: "Выбрать вложение",
		);
		const body = this.contentEl.createEl("div", { cls: "meta-kb-modal-body" });

		if (this.params.imagePaths.length === 0) {
			body.createEl("div", {
				cls: "meta-kb-modal-todo",
				text: "В хранилище нет файлов-изображений. Добавьте картинку и повторите.",
			});
		} else {
			const gallery = body.createEl("div", { cls: "meta-kb-gallery" });
			for (const path of this.params.imagePaths) {
				this.renderThumb(gallery, path);
			}
		}

		const pathRow = body.createEl("div", { cls: "meta-kb-modal-row" });
		pathRow.createEl("label", { text: "Путь" });
		const pathInput = pathRow.createEl("input", { cls: "meta-kb-input" });
		pathInput.type = "text";
		pathInput.placeholder = "например: attachments/photo.png";
		pathInput.value = this.selectedPath;
		this.pathInput = pathInput;
		pathInput.addEventListener("input", () => {
			this.selectedPath = pathInput.value;
			this.updateState();
		});

		if (this.params.mode === "create-wrapper") {
			const titleRow = body.createEl("div", { cls: "meta-kb-modal-row" });
			titleRow.createEl("label", { text: "Название" });
			const titleInput = titleRow.createEl("input", { cls: "meta-kb-input" });
			titleInput.type = "text";
			titleInput.placeholder = "Например: Обложка книги";
			this.titleInput = titleInput;
			if (this.selectedPath) {
				titleInput.value = titleFromPath(this.selectedPath);
			}
			titleInput.addEventListener("input", () => this.updateState());
		}

		this.messageEl = body.createEl("div", { cls: "meta-kb-modal-message" });

		const footer = this.contentEl.createEl("div", { cls: "meta-kb-modal-footer" });
		const cancelBtn = footer.createEl("button", { text: "Отмена" });
		cancelBtn.type = "button";
		cancelBtn.addEventListener("click", () => this.close());

		const existingBtn = footer.createEl("button", { text: "Открыть существующую" });
		existingBtn.type = "button";
		existingBtn.hide();
		existingBtn.addEventListener("click", () => {
			const decision = this.params.decide(this.selectedPath);
			if (!decision.existing) {
				return;
			}
			this.close();
			this.params.onOpenExisting?.(decision.existing.id);
		});
		this.existingBtn = existingBtn;

		const okBtn = footer.createEl("button", { text: "OK", cls: "mod-cta" });
		okBtn.type = "button";
		okBtn.addEventListener("click", () => {
			void this.submit();
		});
		this.okBtn = okBtn;

		this.updateState();
	}

	private renderThumb(gallery: HTMLElement, path: string): void {
		const item = gallery.createEl("button", { cls: "meta-kb-thumb" });
		item.type = "button";
		item.setAttribute("title", path);

		const url = this.params.resourcePath(path);
		if (url) {
			item.createEl("img", { attr: { src: url, alt: basename(path) } });
		} else {
			item.createEl("div", { cls: "meta-kb-thumb-fallback", text: basename(path) });
		}
		item.createEl("span", { cls: "meta-kb-thumb-name", text: basename(path) });

		const decision = this.params.decide(path);
		if (decision.existing) {
			item.addClass("is-wrapped");
			item.createEl("span", { cls: "meta-kb-thumb-badge", text: "обёрнуто" });
		}

		if (path === this.selectedPath) {
			item.addClass("is-selected");
		}

		item.addEventListener("click", () => {
			this.selectedPath = path;
			if (this.pathInput) {
				this.pathInput.value = path;
			}
			if (
				this.params.mode === "create-wrapper" &&
				this.titleInput &&
				this.titleInput.value.trim() === ""
			) {
				this.titleInput.value = titleFromPath(path);
			}
			for (const node of Array.from(gallery.children)) {
				node.removeClass("is-selected");
			}
			item.addClass("is-selected");
			this.updateState();
		});
	}

	/** Проверка состояния: запрет второй обёртки на тот же файл (C-IMG-05). */
	private updateState(): void {
		const path = this.selectedPath.trim();
		const decision = this.params.decide(path);
		const conflict = decision.reason === "owned-by-other";

		let message = "";
		if (path === "") {
			message = "Выберите изображение или укажите путь.";
		} else if (conflict) {
			message =
				`Для этого файла обёртка уже существует: «${decision.existing?.title ?? ""}». ` +
				"Один файл — одна обёртка (C-IMG-05).";
		} else if (
			this.params.mode === "create-wrapper" &&
			(this.titleInput?.value ?? "").trim() === ""
		) {
			message = "Укажите название обёртки.";
		}

		if (this.messageEl) {
			this.messageEl.setText(message);
			if (message) {
				this.messageEl.show();
			} else {
				this.messageEl.hide();
			}
		}
		if (this.existingBtn) {
			if (conflict && this.params.onOpenExisting) {
				this.existingBtn.show();
			} else {
				this.existingBtn.hide();
			}
		}
		if (this.okBtn) {
			this.okBtn.disabled = message !== "";
		}
	}

	private async submit(): Promise<void> {
		const attachment = this.selectedPath.trim();
		const title =
			this.params.mode === "create-wrapper"
				? (this.titleInput?.value ?? "").trim()
				: "";
		if (attachment === "") {
			return;
		}
		this.close();
		await this.params.onSubmit({ title, attachment });
	}
}
