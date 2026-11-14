import { App } from "obsidian";
import { FieldModal } from "../BaseFieldModal";
import type { FieldModalParams } from "../BaseFieldModal";
import { renderSuggestSelect } from "../suggestSelect";
import { candidatesToValue, linksToCandidates } from "../../../core/suggest";
import type { SuggestCandidate } from "../../../core/suggest";

/**
 * Модалка media / list<media>: выбор обёртки `image` из Registry (INV-23).
 * Значение — каноническая ссылка на image, не путь к файлу.
 */
export class MediaModal extends FieldModal {
	private handle: { getSelected(): SuggestCandidate[] } | null = null;

	constructor(app: App, params: FieldModalParams) {
		super(app, params);
	}

	protected renderBody(body: HTMLElement): void {
		const multiple = this.params.valueType === "list<media>";
		this.handle = renderSuggestSelect(body, {
			multiple,
			suggest: this.params.suggest ?? (() => []),
			initial: linksToCandidates(this.params.currentValue),
			placeholder: multiple
				? "Добавить изображение — поиск по названию или id"
				: "Найти изображение",
		});
	}

	protected readValue(): unknown {
		const selected = this.handle?.getSelected() ?? [];
		return candidatesToValue(
			selected,
			this.params.valueType === "list<media>",
		);
	}
}
