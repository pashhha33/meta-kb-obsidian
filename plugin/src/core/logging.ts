/**
 * Логирование: уровни, буфер последних записей и вывод в приёмник.
 *
 * Зачем буфер: сообщения плагина уходили в консоль Obsidian, где их видно
 * только с открытым DevTools. Теперь последние записи хранятся в памяти и
 * показываются командой «Показать лог».
 *
 * Чистая логика: без импортов obsidian. Вывод (console) подключается
 * приёмником — так ядро тестируется без побочных эффектов.
 */

export const LOG_LEVELS = ["silent", "error", "warn", "info", "debug"] as const;

/** Уровень подробности: `silent` — писать некуда, `debug` — всё подряд. */
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Уровень самой записи (у записи не бывает `silent`). */
export type LogSeverity = Exclude<LogLevel, "silent">;

/**
 * Строгость записи: чем больше число, тем важнее.
 * Порог задаётся уровнем настройки: запись попадает в лог, если она не ниже
 * порога (`warn` пропускает `warn` и `error`, но не `info`).
 */
const SEVERITY: Record<LogSeverity, number> = {
	debug: 1,
	info: 2,
	warn: 3,
	error: 4,
};

export const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
	silent: "Выключено",
	error: "Только ошибки",
	warn: "Ошибки и предупреждения",
	info: "Сообщения, предупреждения, ошибки",
	debug: "Всё, включая отладку",
};

/** Уровень по умолчанию: сообщения и важнее. */
export const DEFAULT_LOG_LEVEL: LogLevel = "info";

/** Сколько записей держим в памяти. */
export const LOG_BUFFER_LIMIT_DEFAULT = 500;

/** Привести произвольное значение из настроек к допустимому уровню. */
export function normalizeLogLevel(raw: unknown): LogLevel {
	return (LOG_LEVELS as readonly unknown[]).includes(raw)
		? (raw as LogLevel)
		: DEFAULT_LOG_LEVEL;
}

/** Попадёт ли запись уровня `severity` в лог при настройке `configured`. */
export function shouldLog(configured: LogLevel, severity: LogSeverity): boolean {
	if (configured === "silent") {
		return false;
	}
	return SEVERITY[severity] >= SEVERITY[configured];
}

export interface LogEntry {
	/** Сквозной номер записи. */
	seq: number;
	/** Время в ISO (UTC). */
	at: string;
	level: LogSeverity;
	message: string;
	/** Подробности: текст ошибки, путь файла и т.п. */
	details?: string;
}

export type LogSink = (entry: LogEntry) => void;

/** Свести произвольные подробности к одной строке. */
export function formatDetails(details: unknown): string {
	if (details === undefined || details === null) {
		return "";
	}
	if (typeof details === "string") {
		return details;
	}
	if (details instanceof Error) {
		return details.message === "" ? details.name : `${details.name}: ${details.message}`;
	}
	if (typeof details === "object") {
		try {
			return JSON.stringify(details);
		} catch {
			return String(details);
		}
	}
	return String(details);
}

/**
 * Логгер плагина: фильтр по уровню, кольцевой буфер и необязательный приёмник.
 *
 * Приёмник (обычно консоль) подключается из плагина и может падать — ошибка
 * вывода не должна ломать вызывающий код, поэтому он обёрнут в try.
 */
export class Logger {
	private level: LogLevel;
	private sink: LogSink | undefined;
	private items: LogEntry[] = [];
	private seq = 0;
	private readonly limit: number;

	constructor(
		options: { level?: LogLevel; limit?: number; sink?: LogSink } = {},
	) {
		this.level = normalizeLogLevel(options.level);
		this.limit =
			options.limit !== undefined && options.limit > 0
				? Math.floor(options.limit)
				: LOG_BUFFER_LIMIT_DEFAULT;
		this.sink = options.sink;
	}

	setLevel(level: LogLevel): void {
		this.level = normalizeLogLevel(level);
	}

	getLevel(): LogLevel {
		return this.level;
	}

	setSink(sink: LogSink | undefined): void {
		this.sink = sink;
	}

	/** Попадёт ли запись этого уровня в лог. */
	enabled(severity: LogSeverity): boolean {
		return shouldLog(this.level, severity);
	}

	error(message: string, details?: unknown): LogEntry | null {
		return this.write("error", message, details);
	}

	warn(message: string, details?: unknown): LogEntry | null {
		return this.write("warn", message, details);
	}

	info(message: string, details?: unknown): LogEntry | null {
		return this.write("info", message, details);
	}

	debug(message: string, details?: unknown): LogEntry | null {
		return this.write("debug", message, details);
	}

	/** Записи от старых к новым (копия — менять снаружи нельзя). */
	entries(): LogEntry[] {
		return this.items.map((entry) => ({ ...entry }));
	}

	clear(): void {
		this.items = [];
	}

	/** Сколько записей хранится сейчас. */
	get size(): number {
		return this.items.length;
	}

	private write(
		severity: LogSeverity,
		message: string,
		details?: unknown,
	): LogEntry | null {
		if (!this.enabled(severity)) {
			return null;
		}
		const text = formatDetails(details);
		const entry: LogEntry = {
			seq: (this.seq += 1),
			at: new Date().toISOString(),
			level: severity,
			message,
			...(text === "" ? {} : { details: text }),
		};
		this.items.push(entry);
		if (this.items.length > this.limit) {
			this.items.splice(0, this.items.length - this.limit);
		}
		try {
			this.sink?.(entry);
		} catch {
			// Приёмник не должен ломать плагин: молча продолжаем.
		}
		return entry;
	}
}