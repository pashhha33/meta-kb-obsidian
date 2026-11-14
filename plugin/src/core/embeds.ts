/**
 * Hover-поведение над изображением в теле заметки (C-IMG-03).
 *
 * Значок при наведении зависит от того, есть ли у файла обёртка:
 *   уже есть  → «Открыть обёртку» (переход к объекту);
 *   обёртки нет → «Создать обёртку» (запуск C-IMG-04).
 *
 * Чистая логика: без импортов obsidian. Здесь только решение «что показать»,
 * а сам значок и его позиционирование — в `ui/EmbedHoverActions.ts`.
 */
import { isImagePath, normalizeAttachmentPath } from "./attachment";

export type EmbedAction = "open-wrapper" | "create-wrapper";

export interface ResolvedEmbed {
	action: EmbedAction;
	/** Путь файла-изображения (нужен для создания обёртки). */
	attachment: string;
	/** `id` обёртки — для перехода к объекту. */
	wrapperId?: string;
	/** Название обёртки или имя файла — для подсказки значка. */
	label: string;
}

export interface EmbedLookups {
	/** Обёртка для файла-вложения: `attachment` → объект `image`. */
	wrapperForAttachment: (
		path: string,
	) => { id: string; title: string } | undefined;
	/** Объект по канонической ссылке `{type}_{id}`. */
	resolveLink: (
		linkpath: string,
	) => { id: string; type: string; title: string } | undefined;
}

/**
 * Что показать над изображением, у которого `src` из embed.
 *
 * `null` — это не изображение (например, `![[note_x]]` или ссылка на PDF):
 * значок не показываем, чтобы не предлагать лишнего.
 */
export function resolveEmbed(
	src: string,
	lookups: EmbedLookups,
): ResolvedEmbed | null {
	const raw = src.trim();
	if (raw === "") {
		return null;
	}

	// `![[image_{id}]]` — embed самой обёртки: путь к файлу тут неизвестен,
	// но объект разрешается по канонической ссылке.
	const path = normalizeAttachmentPath(raw);
	const linked = lookups.resolveLink(path);
	if (linked && linked.type === "image") {
		return {
			action: "open-wrapper",
			attachment: "",
			wrapperId: linked.id,
			label: linked.title !== "" ? linked.title : linked.id,
		};
	}

	if (!isImagePath(path)) {
		return null;
	}

	const wrapper = lookups.wrapperForAttachment(path);
	if (wrapper) {
		return {
			action: "open-wrapper",
			attachment: path,
			wrapperId: wrapper.id,
			label: wrapper.title !== "" ? wrapper.title : path,
		};
	}

	return { action: "create-wrapper", attachment: path, label: path };
}