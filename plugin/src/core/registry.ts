/**
 * Registry: индекс id → ObjectRecord и разрешение канонических ссылок.
 * Чистая логика; инкрементальные обновления добавит ui-слой поверх.
 */
import type { ObjectRecord } from "./loader";

export class Registry {
	private readonly byId = new Map<string, ObjectRecord>();
	private readonly byPath = new Map<string, ObjectRecord>();

	add(rec: ObjectRecord): void {
		if (rec.id) this.byId.set(rec.id, rec);
		this.byPath.set(rec.path, rec);
	}

	get(id: string): ObjectRecord | undefined {
		return this.byId.get(id);
	}

	byFilename(stem: string): ObjectRecord | undefined {
		return this.byPath.get(stem);
	}

	/**
	 * Разрешить каноническую ссылку `[[{type}_{id}|...]]` или голый id.
	 * linkpath = `{type_prefix}_{id}` (совпадает с именем файла без расширения).
	 */
	resolveLink(linkpath: string): ObjectRecord | undefined {
		const byId = this.byId.get(linkpath);
		if (byId) return byId;
		const byPath = this.byPath.get(linkpath);
		if (byPath) return byPath;
		// linkpath = `{type}_{id}` → ищем по суффиксу id.
		for (const [id, rec] of this.byId) {
			if (linkpath.endsWith(`_${id}`)) return rec;
		}
		return undefined;
	}

	get size(): number {
		return this.byId.size;
	}

	/** Все записи (для suggest и обхода). */
	all(): ObjectRecord[] {
		return [...this.byId.values()];
	}
}
