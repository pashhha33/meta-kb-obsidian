/**
 * Suggest: кандидаты для модалок link/media из Registry.
 * Чистая логика: без импортов obsidian (UI вызывает с результатом).
 */
import type { ObjectRecord } from "./loader";

export interface SuggestCandidate {
	id: string;
	title: string;
	type: string;
	/** Каноническая ссылка без скобок: `{type}_{id}`. */
	linkpath: string;
}

export function candidateOf(rec: ObjectRecord): SuggestCandidate {
	return {
		id: rec.id,
		title: rec.title,
		type: rec.type,
		linkpath: `${rec.type}_${rec.id}`,
	};
}

/**
 * Подобрать кандидатов по запросу.
 * @param records все объекты (обычно Registry.all()).
 * @param query подстрока title/aliases/id (регистронезависимо).
 * @param opts.targetTypes ограничение по типу цели; null/["*"] — любой.
 */
export function suggestLinks(
	records: ObjectRecord[],
	query: string,
	opts: { targetTypes?: string[] | null; limit?: number } = {},
): SuggestCandidate[] {
	const q = query.trim().toLowerCase();
	const limited = opts.targetTypes && opts.targetTypes.length > 0
		? opts.targetTypes.filter((t) => t !== "*")
		: [];
	const target = limited.length > 0 ? new Set(limited) : null;
	const limit = opts.limit ?? 20;

	const scored: { candidate: SuggestCandidate; score: number }[] = [];
	for (const rec of records) {
		if (!rec.id || !rec.type) {
			continue;
		}
		if (target && !target.has(rec.type)) {
			continue;
		}
		const haystack = [rec.title, ...rec.aliases, rec.id].map((s) =>
			s.toLowerCase(),
		);
		if (q && !haystack.some((s) => s.includes(q))) {
			continue;
		}
		const score = q ? (haystack.some((s) => s.startsWith(q)) ? 0 : 1) : 0;
		scored.push({ candidate: candidateOf(rec), score });
	}

	scored.sort(
		(a, b) =>
			a.score - b.score ||
			a.candidate.title.localeCompare(b.candidate.title),
	);
	return scored.slice(0, limit).map((x) => x.candidate);
}
