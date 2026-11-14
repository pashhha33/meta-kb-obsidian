import { App, Modal } from "obsidian";
import type { LogEntry, Logger } from "../../core/logging";

/** Подпись уровня для журнала. */
const LEVEL_LABELS: Record<LogEntry["level"], string> = {
	error: "Ошибка",
	warn: "Предупреждение",
	info: "Сообщение",
	debug: "Отладка",
};

/** `2026-11-14T17:20:03.123Z` → `14.11 17:20:03` в локальном времени. */
function formatTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return iso;
	}
	const pad = (value: number): string => String(value).padStart(2, "0");
	return (
		`${pad(date.getDate())}.${pad(date.getMonth() + 1)} ` +
		`${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
	);
}

/**
 * Журнал плагина: последние записи из памяти.
 *
 * Нужен потому, что сообщения плагина раньше уходили только в консоль
 * Obsidian, а её видно лишь с открытым DevTools. Порядок — новые сверху.
 */
export class LogModal extends Modal {
	private readonly logger: Logger;

	constructor(app: App, logger: Logger) {
		super(app);
		this.logger = logger;
	}

	override onOpen(): void {
		this.modalEl.addClass("meta-kb-log-modal");
		this.titleEl.setText("Журнал Meta KB");
		this.render();
	}

	private render(): void {
		this.contentEl.empty();
		const body = this.contentEl.createEl("div", { cls: "meta-kb-modal-body" });
		const entries = [...this.logger.entries()].reverse();

		body.createEl("div", {
			cls: "meta-kb-modal-hint",
			text:
				`Уровень: ${this.logger.getLevel()}. Записей: ${entries.length}. ` +
				"Уровень и вывод в консоль настраиваются в настройках плагина.",
		});

		if (entries.length === 0) {
			body.createEl("div", {
				cls: "meta-kb-modal-todo",
				text: "Журнал пуст.",
			});
		} else {
			const list = body.createEl("div", { cls: "meta-kb-log-list" });
			for (const entry of entries) {
				const row = list.createEl("div", {
					cls: `meta-kb-log-entry is-${entry.level}`,
				});
				const head = row.createEl("div", { cls: "meta-kb-log-head" });
				head.createEl("span", {
					cls: "meta-kb-log-time",
					text: formatTime(entry.at),
				});
				head.createEl("span", {
					cls: "meta-kb-log-level",
					text: LEVEL_LABELS[entry.level],
				});
				head.createEl("span", {
					cls: "meta-kb-log-message",
					text: entry.message,
				});
				if (entry.details) {
					row.createEl("div", { cls: "meta-kb-log-details", text: entry.details });
				}
			}
		}

		const footer = this.contentEl.createEl("div", { cls: "meta-kb-modal-footer" });
		const clearBtn = footer.createEl("button", { text: "Очистить" });
		clearBtn.type = "button";
		clearBtn.addEventListener("click", () => {
			this.logger.clear();
			this.render();
		});

		const closeBtn = footer.createEl("button", { text: "Закрыть", cls: "mod-cta" });
		closeBtn.type = "button";
		closeBtn.addEventListener("click", () => this.close());
	}
}