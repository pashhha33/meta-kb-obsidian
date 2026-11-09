import { App } from "obsidian";
import { FieldModal, FieldModalParams } from "../FieldModal";

/**
 * Заглушка модалки media / list\<media\> — ITER-2026-11-06-0.
 *
 * TODO (следующий срез, plugin/DESIGN.md §7.5.1.4–5):
 *   - вкладки «Обёртки» (Registry type: image + миниатюры) /
 *     «Необёрнутые файлы» / «Импорт»;
 *   - INV-23: значение — ссылка на обёртку image, не путь к файлу;
 *   - проверка индекса attachment → image (C-IMG-05).
 *
 * В этом срезе: каркас (OK/Отмена/Очистить), поиск disabled,
 * OK отключён. «Очистить» работает — удалить ключ можно безопасно.
 */
export class MediaModal extends FieldModal {
        constructor(app: App, params: FieldModalParams) {
                super(app, params);
        }

        protected renderBody(body: HTMLElement): void {
                body.createEl("div", {
                        cls: "meta-kb-modal-todo",
                        text: "TODO: выбор обёрток image / файлов — будет реализовано в следующем "
                                + "срезе (plugin/DESIGN.md §7.5.1, INV-23). Пока редактирование недоступно.",
                });

                const search = body.createEl("input", { cls: "meta-kb-input" });
                search.type = "text";
                search.placeholder = "Поиск по обёрткам image (после подключения Registry)";
                search.disabled = true;

                const current = this.params.currentValue;
                if (current !== undefined && current !== null) {
                        const values = Array.isArray(current)
                                ? current.map((item) => String(item))
                                : [String(current)];
                        const box = body.createEl("div", { cls: "meta-kb-current-values" });
                        box.createEl("div", {
                                cls: "meta-kb-modal-hint",
                                text: "Текущее значение:",
                        });
                        for (const value of values) {
                                box.createEl("div", { cls: "meta-kb-current-value", text: value });
                        }
                }
        }

        protected readValue(): unknown {
                // OK отключён — значение не применяется.
                return this.params.currentValue;
        }

        protected override canApply(): boolean {
                return false;
        }
}
