import { Modal } from "obsidian";
import type { App } from "obsidian";
import type { FieldValueType } from "../../labels";
import type { SuggestCandidate } from "../../core/suggest";

/**
 * Базовый класс модалки поля.
 *
 * Живёт в отдельном модуле НАМЕРЕННО: этот файл не импортирует наследников,
 * поэтому цикла «база ↔ наследники» не возникает. Раньше базовый класс лежал
 * в `FieldModal.ts` рядом с фабрикой, которая импортирует все наследники; в
 * собранном `main.js` наследники инициализировались раньше базы, и загрузка
 * падала с `Class extends value undefined is not a constructor or null`.
 * Ловится воротами `npm run check:bundle`.
 */

/** Параметры модалки поля. */
export interface FieldModalParams {
	key: string;
	label: string;
	valueType: FieldValueType;
	currentValue: unknown;
	/** Значения enum из определения свойства (контракт). */
	enumValues?: string[];
	/** Подсказки из Registry для link/media (опционально). */
	suggest?: (query: string) => SuggestCandidate[];
	/**
	 * Применить значение: undefined → удалить ключ
	 * (пустое значение = отсутствие ключа, ontology.md §4.4).
	 */
	onApply: (value: unknown) => void | Promise<void>;
}

/**
 * Общий каркас модалки поля (DESIGN.md §7.5.1.1):
 *
 *   Заголовок: Label поля
 *   Подзаголовок: property_key · value_type
 *   [ область ввода — зависит от типа ]
 *   [ Очистить ]        [ Отмена ]  [ OK ]
 *
 * OK — валидация → onApply(значение). «Очистить» — onApply(undefined).
 */
export abstract class FieldModal extends Modal {
	protected readonly params: FieldModalParams;
	private messageEl: HTMLElement | null = null;

	constructor(app: App, params: FieldModalParams) {
		super(app);
		this.params = params;
	}

	override onOpen(): void {
		this.modalEl.addClass("meta-kb-field-modal");
		this.titleEl.setText(this.params.label);
		this.contentEl.createEl("div", {
			cls: "meta-kb-modal-subtitle",
			text: `${this.params.key} · ${this.params.valueType}`,
		});

		const body = this.contentEl.createEl("div", { cls: "meta-kb-modal-body" });
		this.renderBody(body);

		this.messageEl = this.contentEl.createEl("div", {
			cls: "meta-kb-modal-message",
		});
		this.messageEl.hide();

		const footer = this.contentEl.createEl("div", { cls: "meta-kb-modal-footer" });
		const clearBtn = footer.createEl("button", { text: "Очистить" });
		clearBtn.type = "button";
		const cancelBtn = footer.createEl("button", { text: "Отмена" });
		cancelBtn.type = "button";
		const okBtn = footer.createEl("button", { text: "OK", cls: "mod-cta" });
		okBtn.type = "button";
		if (!this.canApply()) {
			okBtn.disabled = true;
		}

		clearBtn.addEventListener("click", () => {
			void this.applyValue(undefined);
		});
		cancelBtn.addEventListener("click", () => this.close());
		okBtn.addEventListener("click", () => {
			void this.applyValue(this.readValue());
		});
	}

	/** Тело модалки: элементы ввода по value_type. */
	protected abstract renderBody(body: HTMLElement): void;

	/** Прочитать значение; undefined = пусто (ключ будет удалён). */
	protected abstract readValue(): unknown;

	/** Можно ли применить значение. */
	protected canApply(): boolean {
		return true;
	}

	/** Валидация перед записью; null = значение корректно. */
	protected validateValue(value: unknown): string | null {
		return null;
	}

	protected showMessage(text: string): void {
		if (this.messageEl) {
			this.messageEl.setText(text);
			this.messageEl.show();
		}
	}

	private async applyValue(value: unknown): Promise<void> {
		const error = this.validateValue(value);
		if (error) {
			this.showMessage(error);
			return;
		}
		try {
			await this.params.onApply(value);
			this.close();
		} catch (err) {
			console.error("Meta KB: ошибка применения значения поля", err);
			this.showMessage(
				`Не удалось записать значение: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
		}
	}
}
