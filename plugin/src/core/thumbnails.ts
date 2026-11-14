/**
 * Параметры миниатюр галереи изображений.
 *
 * Размер и пропорции задаются в настройках плагина; по умолчанию — квадрат
 * 120 px. Значения проходят нормализацию, чтобы битая настройка не ломала
 * вёрстку галереи.
 *
 * Чистая логика: без импортов obsidian.
 */

export const THUMBNAIL_ASPECTS = ["square", "native", "4:3", "16:9"] as const;
export type ThumbnailAspect = (typeof THUMBNAIL_ASPECTS)[number];

export const THUMBNAIL_SIZE_DEFAULT = 120;
export const THUMBNAIL_SIZE_MIN = 48;
export const THUMBNAIL_SIZE_MAX = 320;

/** Человекочитаемые подписи пропорций (UI-строки, не семантика модели). */
export const THUMBNAIL_ASPECT_LABELS: Record<ThumbnailAspect, string> = {
	square: "Квадрат (1:1)",
	native: "Как в файле",
	"4:3": "4:3",
	"16:9": "16:9",
};

/** Привести размер к допустимому диапазону. */
export function clampThumbnailSize(value: unknown): number {
	const parsed =
		typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
	if (!Number.isFinite(parsed)) {
		return THUMBNAIL_SIZE_DEFAULT;
	}
	const rounded = Math.round(parsed);
	if (rounded < THUMBNAIL_SIZE_MIN) {
		return THUMBNAIL_SIZE_MIN;
	}
	if (rounded > THUMBNAIL_SIZE_MAX) {
		return THUMBNAIL_SIZE_MAX;
	}
	return rounded;
}

/** Известны ли такие пропорции; иначе — квадрат. */
export function normalizeThumbnailAspect(value: unknown): ThumbnailAspect {
	return THUMBNAIL_ASPECTS.includes(value as ThumbnailAspect)
		? (value as ThumbnailAspect)
		: "square";
}

/**
 * Значение CSS `aspect-ratio` для пропорции.
 * `null` — пропорции не фиксируются (показываем как в файле).
 */
export function thumbnailAspectRatio(aspect: unknown): string | null {
	switch (normalizeThumbnailAspect(aspect)) {
		case "square":
			return "1 / 1";
		case "4:3":
			return "4 / 3";
		case "16:9":
			return "16 / 9";
		case "native":
			return null;
	}
}
