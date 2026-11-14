import { App } from "obsidian";
import { FieldModal } from "../BaseFieldModal";
import type { FieldModalParams } from "../BaseFieldModal";

/**
 * Модалка number — DESIGN.md §7.5.5.
 * input[type=number]; пусто → удалить ключ; без единиц в значении.
 */
export class NumberModal extends FieldModal {
        private input: HTMLInputElement | null = null;

        constructor(app: App, params: FieldModalParams) {
                super(app, params);
        }

        protected renderBody(body: HTMLElement): void {
                const input = body.createEl("input", { cls: "meta-kb-input" });
                input.type = "number";
                input.step = "any";

                const current = this.params.currentValue;
                if (typeof current === "number" && Number.isFinite(current)) {
                        input.value = String(current);
                }

                body.createEl("div", {
                        cls: "meta-kb-modal-hint",
                        text: "Пусто — удалить ключ.",
                });
                this.input = input;
                window.setTimeout(() => this.input?.focus(), 50);
        }

        protected readValue(): unknown {
                const raw = this.input ? this.input.value.trim() : "";
                if (raw === "") {
                        return undefined;
                }
                const num = Number(raw);
                return Number.isFinite(num) ? num : undefined;
        }

        protected override validateValue(value: unknown): string | null {
                if (value === undefined) {
                        return null;
                }
                if (typeof value !== "number" || !Number.isFinite(value)) {
                        return "Ожидается число.";
                }
                return null;
        }
}
