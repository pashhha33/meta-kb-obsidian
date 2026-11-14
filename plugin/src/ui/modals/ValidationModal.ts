import { App, Modal } from "obsidian";
import type { Finding, ValidationResult } from "../../core/validation";

/**
 * Отчёт проверки хранилища: находки валидатора по файлам.
 *
 * Бейдж в виджете показывает только открытую заметку; этот отчёт отвечает на
 * вопрос «что не так во всём хранилище».
 */
export class ValidationModal extends Modal {
	private readonly result: ValidationResult;
	private readonly onRerun?: () => void;

	constructor(app: App, result: ValidationResult, onRerun?: () => void) {
		super(app);
		this.result = result;
		this.onRerun = onRerun;
	}

	override onOpen(): void {
		this.modalEl.addClass("meta-kb-report-modal");
		this.titleEl.setText("Проверка хранилища");
		this.render();
	}

	private render(): void {
		this.contentEl.empty();
		const body = this.contentEl.createEl("div", { cls: "meta-kb-modal-body" });
		const { findings, errors, warnings } = this.result;

		body.createEl("div", {
			cls: "meta-kb-modal-hint",
			text:
				findings.length === 0
					? "Находок нет."
					: `Ошибок: ${errors} · предупреждений: ${warnings} · всего: ${findings.length}`,
		});

		if (findings.length === 0) {
			body.createEl("div", {
				cls: "meta-kb-modal-todo",
				text: "Всё соответствует правилам контракта.",
			});
		} else {
			// Группировка по файлу: находки одного объекта читаются вместе.
			const byPath = new Map<string, Finding[]>();
			for (const finding of findings) {
				const list = byPath.get(finding.path);
				if (list) {
					list.push(finding);
				} else {
					byPath.set(finding.path, [finding]);
				}
			}

			const list = body.createEl("div", { cls: "meta-kb-report-list" });
			for (const [path, items] of byPath) {
				const group = list.createEl("div", { cls: "meta-kb-report-group" });
				group.createEl("div", { cls: "meta-kb-report-path", text: path });
				for (const finding of items) {
					const row = group.createEl("div", {
						cls: `meta-kb-report-finding is-${finding.severity}`,
					});
					row.createEl("span", {
						cls: "meta-kb-report-rule",
						text: finding.rule_key,
					});
					row.createEl("span", {
						cls: "meta-kb-report-message",
						text: finding.field ? `${finding.field}: ${finding.message}` : finding.message,
					});
				}
			}
		}

		const footer = this.contentEl.createEl("div", { cls: "meta-kb-modal-footer" });
		if (this.onRerun) {
			const again = footer.createEl("button", { text: "Проверить снова" });
			again.type = "button";
			again.addEventListener("click", () => {
				const handler = this.onRerun;
				this.close();
				handler?.();
			});
		}
		const close = footer.createEl("button", { text: "Закрыть", cls: "mod-cta" });
		close.type = "button";
		close.addEventListener("click", () => this.close());
	}
}