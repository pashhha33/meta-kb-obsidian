import { App, Modal } from "obsidian";
import { FieldValueType } from "../../labels";
import { StringModal } from "./types/StringModal";
import { NumberModal } from "./types/NumberModal";
import { BooleanModal } from "./types/BooleanModal";
import { EnumModal } from "./types/EnumModal";
import { DateModal } from "./types/DateModal";
import { LinkModal } from "./types/LinkModal";
import { MediaModal } from "./types/MediaModal";

/** Параметры модалки поля. */
export interface FieldModalParams {
        key: string;
        label: string;
        valueType: FieldValueType;
        currentValue: unknown;
        /** Значения enum из определения свойства (статический stub). */
        enumValues?: string[];
        /**
         * Применить значение: undefined → удалить ключ
         * (пустое значение = отсутствие ключа, ontology.md §4.4).
         */
        onApply: (value: unknown) => void | Promise<void>;
}

/** Открыть модалку редактирования поля по value_type. */
export function openFieldModal(app: App, params: FieldModalParams): void {
        const modal = createFieldModal(app, params);
        if (modal) {
                modal.open();
        }
}

function createFieldModal(app: App, params: FieldModalParams): FieldModal | null {
        switch (params.valueType) {
                case "string":
                case "text":
                case "list<string>":
                case "datetime":
                        return new StringModal(app, params);
                case "number":
                        return new NumberModal(app, params);
                case "boolean":
                        return new BooleanModal(app, params);
                case "enum":
                case "list<enum>":
                        return new EnumModal(app, params);
                case "date":
                        return new DateModal(app, params);
                case "link":
                case "list<link>":
                        return new LinkModal(app, params);
                case "media":
                case "list<media>":
                        return new MediaModal(app, params);
                case "uuid":
                        // Машинное поле: UI-редактирование запрещено (DESIGN.md §7.5.6).
                        return null;
                default:
                        return new StringModal(app, params);
        }
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

        /** Можно ли применить значение (для TODO-заглушек link/media — нет). */
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
