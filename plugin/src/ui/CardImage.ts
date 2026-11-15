/**
 * Карточка «изображение» для представления карточек (C-IMG-02).
 *
 * Показывает миниатюру обёртки (из её `attachment`) и название; клик открывает
 * обёртку.
 *
 * Реализовано фабрикой, а не web-компонентом: `class X extends HTMLElement`
 * вычисляется при загрузке модуля, а ворота G3c грузят бандл в Node, где
 * `HTMLElement` нет. Фабрика создаёт DOM при вызове и безопасна при импорте.
 */

export interface CardImageProps {
	url: string;
	width: number;
	height: number;
	label: string;
	onClick: () => void;
}

/** Создать карточку изображения внутри `parent`. */
export function renderCardImage(
	parent: HTMLElement,
	props: CardImageProps,
): HTMLElement {
	const card = parent.createDiv({ cls: "meta-kb-card-image" });
	card.setAttribute("role", "button");
	card.setAttribute("tabIndex", "0");
	card.setAttribute("aria-label", props.label);

	const img = card.createEl("img", {
		cls: "meta-kb-card-image-img",
		attr: { src: props.url, alt: props.label },
	});
	img.style.width = `${props.width}px`;
	img.style.height = `${props.height}px`;
	img.style.objectFit = "cover";

	card.createDiv({ cls: "meta-kb-card-image-label", text: props.label });

	const activate = (): void => props.onClick();
	card.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		activate();
	});
	card.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			activate();
		}
	});

	return card;
}