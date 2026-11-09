import { App } from "obsidian";
import { FieldModal, FieldModalParams } from "../FieldModal";

function asText(value: unknown): string {
        if (typeof value === "string") {
                return value;
        }
        if (typeof value === "number" || typeof value === "boolean") {
                return String(value);
        }
        if (Array.isArray(value)) {
                return value.map((item) => String(item)).join("\n");
        }
        return "";
}

function asStringArray(value: unknown): string[] {
        if (Array.isArray(value)) {
                return value.map((item) => String(item));
        }
        if (typeof value === "string" && value.trim() !== "") {
                return [value];
        }
        return [];
}

/**
 * Модалка string / text / list\<string\> / datetime — DESIGN.md §7.5.5.
 *
 * string    → однострочный input
 * text      → textarea (многострочный текст)
 * list\<string\> → textarea, одно значение на строку
 * datetime  → input + валидация ISO 8601 (хранение в UTC)
 * Пусто → удалить ключ.
 */
export class StringModal extends FieldModal {
        private input: HTMLInputElement | HTMLTextAreaElement | null = null;

        constructor(app: App, params: FieldModalParams) {
                super(app, params);
        }

        protected renderBody(body: HTMLElement): void {
                const valueType = this.params.valueType;

                if (valueType === "text") {
                        const area = this.createTextarea(body);
                        area.value = asText(this.params.currentValue);
                        body.createEl("div", {
                                cls: "meta-kb-modal-hint",
                                text: "Многострочный текст. Пусто — удалить ключ.",
                        });
                        this.input = area;
                } else if (valueType === "list<string>") {
                        const area = this.createTextarea(body);
                        area.value = asStringArray(this.params.currentValue).join("\n");
                        body.createEl("div", {
                                cls: "meta-kb-modal-hint",
                                text: "Одно значение на строку. Пусто — удалить ключ.",
                        });
                        this.input = area;
                } else {
                        const input = body.createEl("input", { cls: "meta-kb-input" });
                        input.type = "text";
                        input.value = asText(this.params.currentValue);
                        if (valueType === "datetime") {
                                body.createEl("div", {
                                        cls: "meta-kb-modal-hint",
                                        text: "ISO 8601, время в UTC (например 2026-11-06T12:30:00Z). Пусто — удалить ключ.",
                                });
                        }
                        this.input = input;
                }

                window.setTimeout(() => this.input?.focus(), 50);
        }

        protected readValue(): unknown {
                const raw = this.input ? this.input.value : "";
                if (this.params.valueType === "list<string>") {
                        const lines = raw
                                .split("\n")
                                .map((line) => line.trim())
                                .filter((line) => line.length > 0);
                        return lines.length > 0 ? lines : undefined;
                }
                const trimmed = raw.trim();
                return trimmed.length > 0 ? trimmed : undefined;
        }

        protected override validateValue(value: unknown): string | null {
                if (this.params.valueType !== "datetime") {
                        return null;
                }
                if (typeof value !== "string") {
                        return null; // undefined — очистка, допустима
                }
                if (
                        !/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(
                                value,
                        )
                ) {
                        return "Ожидается дата-время в формате ISO 8601, например 2026-11-06T12:30:00Z.";
                }
                return null;
        }

        private createTextarea(body: HTMLElement): HTMLTextAreaElement {
                const area = body.createEl("textarea", { cls: "meta-kb-input" });
                area.rows = 5;
                return area;
        }
}
