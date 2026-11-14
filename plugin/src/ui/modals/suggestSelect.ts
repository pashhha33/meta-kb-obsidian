/**
 * Универсальный выбор кандидатов из Registry для модалок link/media.
 * DOM-логика Obsidian (createEl/empty — расширения Obsidian), без импорта модуля.
 */
import type { SuggestCandidate } from "../../core/suggest";

export interface SuggestSelectHandle {
	getSelected(): SuggestCandidate[];
}

export interface SuggestSelectOptions {
	multiple: boolean;
	suggest: (query: string) => SuggestCandidate[];
	initial: SuggestCandidate[];
	placeholder: string;
}

export function renderSuggestSelect(
	container: HTMLElement,
	opts: SuggestSelectOptions,
): SuggestSelectHandle {
	let selected = [...opts.initial];

	const chips = container.createEl("div", { cls: "meta-kb-chips" });
	const input = container.createEl("input", { cls: "meta-kb-input" });
	input.type = "text";
	input.placeholder = opts.placeholder;
	const list = container.createEl("div", { cls: "meta-kb-suggest-list" });

	const renderChips = (): void => {
		chips.empty();
		for (const c of selected) {
			const chip = chips.createEl("span", { cls: "meta-kb-chip" });
			chip.createEl("span", { text: c.title || c.linkpath });
			const remove = chip.createEl("button", { text: "×" });
			remove.type = "button";
			remove.addEventListener("click", () => {
				selected = selected.filter((x) => x.linkpath !== c.linkpath);
				renderChips();
			});
		}
	};

	const renderList = (): void => {
		list.empty();
		const results = opts.suggest(input.value).slice(0, 50);
		if (results.length === 0) {
			list.createEl("div", {
				cls: "meta-kb-modal-hint",
				text: "Ничего не найдено",
			});
			return;
		}
		for (const c of results) {
			const item = list.createEl("button", { cls: "meta-kb-suggest-item" });
			item.type = "button";
			item.createEl("span", { text: c.title || c.linkpath });
			const typeLabel = c.type || "";
			if (typeLabel) {
				item.createEl("span", { cls: "meta-kb-suggest-type", text: typeLabel });
			}
			item.addEventListener("click", () => {
				if (!opts.multiple) {
					selected = [c];
				} else if (!selected.some((x) => x.linkpath === c.linkpath)) {
					selected = [...selected, c];
				}
				renderChips();
				renderList();
			});
		}
	};

	input.addEventListener("input", renderList);
	renderChips();
	renderList();

	return { getSelected: () => selected };
}
