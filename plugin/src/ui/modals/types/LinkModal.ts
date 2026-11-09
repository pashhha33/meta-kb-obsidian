import { App } from "obsidian";
import { FieldModal, FieldModalParams } from "../FieldModal";

/**
 * Заглушка модалки link / list\<link\> — ITER-2026-11-06-0.
 *
 * TODO (следующий срез, plugin/DESIGN.md §7.5.1):
 *   - поиск по Registry (title, aliases, id);
 *   - фильтр кандидатов по target_type;
 *   - одиночный/множественный выбор, chips;
 *   - создание цели «на лету»;
 *   - запись канонической ссылкой [[{type_prefix}_{id}|{title}]].
 *
 * В этом срезе: каркас (OK/Отмена/Очистить), поиск disabled,
 * OK отключён. «Очистить» работает — удалить ключ можно безопасно.
 */
export class LinkModal extends FieldModal {
        constructor(app: App, params: FieldModalParams) {
                super(app, params);
        }

        protected renderBody(body: HTMLElement): void {
                body.createEl("div", {
                        cls: "meta-kb-modal-todo",
                        text: "TODO: выбор цели из Registry — будет реализовано в следующем срезе "
                                + "(plugin/DESIGN.md §7.5.1). Пока редактирование ссылок недоступно.",
                });

                const search = body.createEl("input", { cls: "meta-kb-input" });
                search.type = "text";
                search.placeholder = "Поиск по объектам (после подключения Registry)";
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
