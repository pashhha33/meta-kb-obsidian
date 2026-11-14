import { App, Modal, setIcon } from "obsidian";

/** Пункт окна команд. */
export interface CommandItem {
	label: string;
	description?: string;
	/** Имя иконки lucide. */
	icon: string;
	/**
	 * `false` — пункт виден, но недоступен: так видно, что возможность есть,
	 * и понятно, при каком условии она работает.
	 */
	enabled?: boolean;
	run: () => void;
}

export interface CommandGroup {
	title: string;
	items: CommandItem[];
}

/**
 * Окно команд плагина: сгруппированный список на русском.
 *
 * В палитре Obsidian команды плагина перемешаны с чужими и названы
 * по-английски. Это окно даёт одну точку входа: группы «Объекты»,
 * «Изображения», «Метамодель». Команды остаются зарегистрированными и в
 * палитре — на них можно назначить горячие клавиши.
 */
export class CommandsModal extends Modal {
	private readonly groups: CommandGroup[];

	constructor(app: App, groups: CommandGroup[]) {
		super(app);
		this.groups = groups;
	}

	override onOpen(): void {
		this.modalEl.addClass("meta-kb-commands");
		this.titleEl.setText("Команды Meta KB");

		const body = this.contentEl.createEl("div", { cls: "meta-kb-modal-body" });
		for (const group of this.groups) {
			if (group.items.length === 0) {
				continue;
			}
			body.createEl("div", {
				cls: "meta-kb-command-group-title",
				text: group.title,
			});
			const list = body.createEl("div", { cls: "meta-kb-command-list" });
			for (const item of group.items) {
				this.renderItem(list, item);
			}
		}

		body.createEl("div", {
			cls: "meta-kb-modal-hint",
			text:
				"Эти же команды есть в палитре Obsidian (Ctrl+P) — можно назначить " +
				"горячие клавиши.",
		});

		const footer = this.contentEl.createEl("div", { cls: "meta-kb-modal-footer" });
		const closeBtn = footer.createEl("button", { text: "Закрыть" });
		closeBtn.type = "button";
		closeBtn.addEventListener("click", () => this.close());
	}

	private renderItem(list: HTMLElement, item: CommandItem): void {
		const enabled = item.enabled !== false;
		const button = list.createEl("button", { cls: "meta-kb-command-item" });
		button.type = "button";
		button.setAttribute("title", item.label);

		const iconEl = button.createEl("span", { cls: "meta-kb-command-icon" });
		setIcon(iconEl, item.icon);
		iconEl.setAttribute("aria-hidden", "true");

		const textEl = button.createEl("span", { cls: "meta-kb-command-text" });
		textEl.createEl("span", { cls: "meta-kb-command-label", text: item.label });
		if (item.description) {
			textEl.createEl("span", {
				cls: "meta-kb-command-desc",
				text: item.description,
			});
		}

		if (!enabled) {
			button.addClass("is-disabled");
			button.disabled = true;
			return;
		}
		button.addEventListener("click", () => {
			this.close();
			item.run();
		});
	}
}