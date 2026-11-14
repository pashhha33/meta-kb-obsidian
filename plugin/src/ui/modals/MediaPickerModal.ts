import { App, Modal } from "obsidian";
import type { MediaPickItem } from "../../core/media";
import { mediaItemToCandidate } from "../../core/media";
import type { SuggestCandidate } from "../../core/suggest";

export interface MediaPickerParams {
	/** Пункты галереи: обёртки и свободные изображения (см. core/media.ts). */
	items: MediaPickItem[];
	/** `list<media>` — можно выбрать несколько. */
	multiple: boolean;
	/** Текущие значения (`{type}_{id}`) — сразу помечаются выбранными. */
	initialValues: string[];
	/** URL превью через getResourcePath; null — превью недоступно. */
	resourcePath: (path: string) => string | null;
	/** Сторона миниатюры, px. */
	thumbnailSize: number;
	/** Пропорции миниатюры (CSS-значение `aspect-ratio`; null — как в файле). */
	thumbnailRatio: string | null;
	/** Создать обёртку для файла без неё; null — не удалось (C-IMG-04). */
	onCreateWrapper: (item: MediaPickItem) => Promise<SuggestCandidate | null>;
	onSubmit: (candidates: SuggestCandidate[]) => void | Promise<void>;
}

/**
 * Модалка `media` / `list<media>` (plugin/DESIGN.md §4–5).
 *
 * Значение свойства — ссылка на объект `image` (INV-23), поэтому галерея
 * показывает миниатюрами и готовые обёртки, и свободные файлы: для файла
 * обёртка создаётся в момент подтверждения выбора.
 */
export class MediaPickerModal extends Modal {
	private readonly params: MediaPickerParams;
	private readonly selected = new Set<string>();
	private messageEl: HTMLElement | null = null;
	private okBtn: HTMLButtonElement | null = null;
	private galleryEl: HTMLElement | null = null;

	constructor(app: App, params: MediaPickerParams) {
		super(app);
		this.params = params;
		for (const value of params.initialValues) {
			this.selected.add(value);
		}
	}

	override onOpen(): void {
		this.modalEl.addClass("meta-kb-image-picker");
		this.titleEl.setText(
			this.params.multiple ? "Выбрать изображения" : "Выбрать изображение",
		);

		const body = this.contentEl.createEl("div", { cls: "meta-kb-modal-body" });

		if (this.params.items.length === 0) {
			body.createEl("div", {
				cls: "meta-kb-modal-todo",
				text:
					"В хранилище нет изображений. Добавьте файл-картинку и создайте " +
					"обёртку командой «Create image wrapper».",
			});
		} else {
			const gallery = body.createEl("div", { cls: "meta-kb-gallery" });
			this.galleryEl = gallery;
			gallery.style.setProperty(
				"--meta-kb-thumb-size",
				`${this.params.thumbnailSize}px`,
			);
			if (this.params.thumbnailRatio) {
				gallery.style.setProperty(
					"--meta-kb-thumb-ratio",
					this.params.thumbnailRatio,
				);
			} else {
				gallery.addClass("is-native");
			}
			for (const item of this.params.items) {
				this.renderThumb(gallery, item);
			}
		}

		// Подсказка, а не ошибка: выбранный файл ещё не обёрнут, обёртка будет
		// создана при подтверждении (C-IMG-04).
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
	}

	private renderThumb(gallery: HTMLElement, item: MediaPickItem): void {
		const button = gallery.createEl("button", { cls: "meta-kb-thumb" });
		button.type = "button";
		button.setAttribute(
			"title",
			item.kind === "wrapper"
				? `${item.title} — обёртка image`
				: `${item.previewPath} — файл без обёртки`,
		);

		const url = this.params.resourcePath(item.previewPath);
		if (url) {
			button.createEl("img", { attr: { src: url, alt: item.title } });
		} else {
			button.createEl("div", { cls: "meta-kb-thumb-fallback", text: item.title });
		}
		button.createEl("span", { cls: "meta-kb-thumb-name", text: item.title });
		if (item.note) {
			button.createEl("span", { cls: "meta-kb-thumb-badge", text: item.note });
		}

		if (this.selected.has(item.value)) {
			button.addClass("is-selected");
		}

		button.addEventListener("click", () => {
			this.toggle(item, button);
		});
	}

	private toggle(item: MediaPickItem, button: HTMLElement): void {
		if (!this.params.multiple) {
			for (const node of Array.from(this.galleryEl?.children ?? [])) {
				node.removeClass("is-selected");
			}
			this.selected.clear();
			this.selected.add(item.value);
			button.addClass("is-selected");
		} else if (this.selected.has(item.value)) {
			this.selected.delete(item.value);
			button.removeClass("is-selected");
		} else {
			this.selected.add(item.value);
			button.addClass("is-selected");
		}
		this.updateState();
	}

	private selectedItems(): MediaPickItem[] {
		return this.params.items.filter((item) => this.selected.has(item.value));
	}

	private updateState(): void {
		const picked = this.selectedItems();
		const files = picked.filter((item) => item.kind === "file").length;

		let message = "";
		if (picked.length === 0) {
			message = "Выберите изображение.";
		} else if (files > 0) {
			message =
				files === 1
					? "Для выбранного файла будет создана обёртка image."
					: `Для выбранных файлов будет создано обёрток: ${files}.`;
		}

		if (this.messageEl) {
			this.messageEl.setText(message);
			if (message) {
				this.messageEl.show();
			} else {
				this.messageEl.hide();
			}
		}
		if (this.okBtn) {
			this.okBtn.disabled = picked.length === 0;
		}
	}

	private async submit(): Promise<void> {
		const picked = this.selectedItems();
		if (picked.length === 0) {
			return;
		}
		this.close();

		const candidates: SuggestCandidate[] = [];
		for (const item of picked) {
			if (item.kind === "wrapper") {
				candidates.push(mediaItemToCandidate(item));
				continue;
			}
			const created = await this.params.onCreateWrapper(item);
			if (created) {
				candidates.push(created);
			}
		}
		if (candidates.length > 0) {
			await this.params.onSubmit(candidates);
		}
	}
}