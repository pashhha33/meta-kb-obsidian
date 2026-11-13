/**
 * Форматирование datetime. Хранение — UTC (ADR-004), отображение — по настройкам.
 * Чистая логика: без импортов obsidian.
 */

export type DatetimeDisplay = "local" | "utc" | "fixed-offset";

export interface DatetimeFormatOptions {
	datetimeDisplay: DatetimeDisplay;
	datetimeOffset: string;
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/** "+03:00" / "-0130" → минуты; null, если формат повреждён. */
export function parseDatetimeOffset(offset: string): number | null {
	const match = /^([+-])(\d{2}):?(\d{2})$/.exec(offset.trim());
	if (!match) {
		return null;
	}
	const hours = parseInt(match[2], 10);
	const minutes = parseInt(match[3], 10);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) {
		return null;
	}
	const sign = match[1] === "-" ? -1 : 1;
	return sign * (hours * 60 + minutes);
}

function formatAsUtcParts(d: Date): string {
	return (
		`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
		`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
	);
}

/** Человекочитаемое отображение datetime. Битые значения — как есть. */
export function formatDatetime(iso: unknown, opts: DatetimeFormatOptions): string {
	if (typeof iso !== "string" || iso.trim() === "") {
		return "—";
	}
	const raw = iso.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
		return raw;
	}

	const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
	let normalized = raw.replace(" ", "T");
	if (!hasTimezone) {
		normalized += "Z";
	}
	const d = new Date(normalized);
	if (isNaN(d.getTime())) {
		return raw;
	}

	switch (opts.datetimeDisplay) {
		case "utc":
			return `${formatAsUtcParts(d)} UTC`;
		case "fixed-offset": {
			const offsetMinutes = parseDatetimeOffset(opts.datetimeOffset);
			if (offsetMinutes === null) {
				return formatAsUtcParts(d);
			}
			const shifted = new Date(d.getTime() + offsetMinutes * 60000);
			const sign = offsetMinutes < 0 ? "-" : "+";
			const abs = Math.abs(offsetMinutes);
			const offsetText = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
			return `${formatAsUtcParts(shifted)} ${offsetText}`;
		}
		case "local":
		default:
			return (
				`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
				`${pad(d.getHours())}:${pad(d.getMinutes())}`
			);
	}
}
