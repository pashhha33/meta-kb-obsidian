import { App } from "obsidian";
import { FieldModal, FieldModalParams } from "../FieldModal";
import { renderSuggestSelect } from "../suggestSelect";
import { candidatesToValue, linksToCandidates } from "../../../core/suggest";
import type { SuggestCandidate } from "../../../core/suggest";

/**
 * Модалка link / list<link>: выбор цели из Registry по title/aliases/id.
 * Значение записывается канонической ссылкой (INV-15) `[[{type}_{id}|{title}]]`.
 */
export class LinkModal extends FieldModal {
	private handle: { getSelected(): SuggestCandidate[] } | null = null;

	constructor(app: App, params: FieldModalParams) {
		super(app, params);
	}

	protected renderBody(body: HTMLElement): void {
		const multiple = this.params.valueType === "list<link>";
		this.handle = renderSuggestSelect(body, {
			multiple,
			suggest: this.params.suggest ?? (() => []),
			initial: linksToCandidates(this.params.currentValue),
			placeholder: multiple
				? "Добавить ссылку — поиск по названию или id"
				: "Найти объект",
		});
	}

	protected readValue(): unknown {
		const selected = this.handle?.getSelected() ?? [];
		return candidatesToValue(
			selected,
			this.params.valueType === "list<link>",
		);
	}
}
