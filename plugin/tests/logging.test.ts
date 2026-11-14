import { test } from "node:test";
import assert from "node:assert/strict";
import {
	DEFAULT_LOG_LEVEL,
	LOG_BUFFER_LIMIT_DEFAULT,
	Logger,
	formatDetails,
	normalizeLogLevel,
	shouldLog,
} from "../src/core/logging";
import type { LogEntry } from "../src/core/logging";

test("normalizeLogLevel: известные уровни и откат к умолчанию", () => {
	for (const level of ["silent", "error", "warn", "info", "debug"] as const) {
		assert.equal(normalizeLogLevel(level), level);
	}
	assert.equal(normalizeLogLevel("verbose"), DEFAULT_LOG_LEVEL);
	assert.equal(normalizeLogLevel(undefined), DEFAULT_LOG_LEVEL);
	assert.equal(normalizeLogLevel(42), DEFAULT_LOG_LEVEL);
	assert.equal(DEFAULT_LOG_LEVEL, "info");
});

test("shouldLog: порог работает как «не ниже»", () => {
	// silent — не пишем ничего.
	for (const severity of ["debug", "info", "warn", "error"] as const) {
		assert.equal(shouldLog("silent", severity), false);
	}
	// error — только ошибки.
	assert.equal(shouldLog("error", "error"), true);
	assert.equal(shouldLog("error", "warn"), false);
	assert.equal(shouldLog("error", "info"), false);
	assert.equal(shouldLog("error", "debug"), false);
	// warn — ошибки и предупреждения.
	assert.equal(shouldLog("warn", "error"), true);
	assert.equal(shouldLog("warn", "warn"), true);
	assert.equal(shouldLog("warn", "info"), false);
	// info — плюс сообщения.
	assert.equal(shouldLog("info", "info"), true);
	assert.equal(shouldLog("info", "debug"), false);
	// debug — всё.
	for (const severity of ["debug", "info", "warn", "error"] as const) {
		assert.equal(shouldLog("debug", severity), true);
	}
});

test("Logger: фильтрация по уровню", () => {
	const logger = new Logger({ level: "warn" });
	assert.equal(logger.debug("d"), null);
	assert.equal(logger.info("i"), null);
	assert.ok(logger.warn("w"));
	assert.ok(logger.error("e"));
	assert.equal(logger.size, 2);
	assert.deepEqual(
		logger.entries().map((entry) => entry.level),
		["warn", "error"],
	);
	// Смена уровня действует сразу.
	logger.setLevel("debug");
	assert.ok(logger.debug("d2"));
	assert.equal(logger.size, 3);
});

test("Logger: подробности сводятся в строку, пустые опускаются", () => {
	const logger = new Logger({ level: "debug" });
	logger.error("ошибка", new Error("нет файла"));
	logger.warn("объект", { path: "a.md" });
	logger.info("строка", "просто текст");
	logger.info("без подробностей");
	const entries = logger.entries();
	assert.equal(entries[0].details, "Error: нет файла");
	assert.equal(entries[1].details, '{"path":"a.md"}');
	assert.equal(entries[2].details, "просто текст");
	assert.equal(entries[3].details, undefined);
});

test("formatDetails: основные случаи", () => {
	assert.equal(formatDetails(undefined), "");
	assert.equal(formatDetails(null), "");
	assert.equal(formatDetails("текст"), "текст");
	assert.equal(formatDetails(7), "7");
	assert.equal(formatDetails(new Error("")), "Error");
	assert.equal(formatDetails({ a: 1 }), '{"a":1}');
	// Циклический объект не должен ронять логирование.
	const cyclic: Record<string, unknown> = {};
	cyclic.self = cyclic;
	assert.equal(typeof formatDetails(cyclic), "string");
});

test("Logger: сквозные номера и время", () => {
	const logger = new Logger({ level: "debug" });
	logger.info("первая");
	logger.info("вторая");
	const [first, second] = logger.entries();
	assert.equal(first.seq, 1);
	assert.equal(second.seq, 2);
	assert.ok(!Number.isNaN(Date.parse(first.at)), "время должно быть ISO");
});

test("Logger: буфер ограничен и хранит последние записи", () => {
	const logger = new Logger({ level: "debug", limit: 3 });
	for (let index = 1; index <= 5; index += 1) {
		logger.info(`запись ${index}`);
	}
	const entries = logger.entries();
	assert.equal(entries.length, 3);
	assert.deepEqual(
		entries.map((entry) => entry.message),
		["запись 3", "запись 4", "запись 5"],
	);
	assert.equal(logger.size, 3);
});

test("Logger: предел по умолчанию из константы", () => {
	assert.ok(LOG_BUFFER_LIMIT_DEFAULT > 0);
	const logger = new Logger({ level: "silent", limit: 0 });
	// Нулевой предел недопустим — берётся значение по умолчанию.
	assert.equal(logger.enabled("error"), false);
	logger.setLevel("debug");
	for (let index = 0; index < LOG_BUFFER_LIMIT_DEFAULT + 5; index += 1) {
		logger.info("x");
	}
	assert.equal(logger.size, LOG_BUFFER_LIMIT_DEFAULT);
});

test("Logger: clear очищает буфер, но не настройку", () => {
	const logger = new Logger({ level: "info" });
	logger.info("a");
	logger.clear();
	assert.equal(logger.size, 0);
	assert.deepEqual(logger.entries(), []);
	assert.equal(logger.getLevel(), "info");
});

test("Logger: приёмник получает только прошедшие фильтр записи", () => {
	const seen: LogEntry[] = [];
	const logger = new Logger({ level: "warn", sink: (entry) => seen.push(entry) });
	logger.info("мимо");
	logger.warn("в лог");
	assert.deepEqual(
		seen.map((entry) => entry.message),
		["в лог"],
	);
	// Без приёмника записи всё равно копятся.
	logger.setSink(undefined);
	logger.error("в буфер");
	assert.equal(logger.size, 2);
});

test("Logger: ошибка приёмника не ломает вызов", () => {
	const logger = new Logger({
		level: "debug",
		sink: () => {
			throw new Error("консоль сломалась");
		},
	});
	const entry = logger.error("важно");
	assert.ok(entry, "запись должна вернуться несмотря на сбой приёмника");
	assert.equal(logger.size, 1);
});

test("Logger: entries возвращает копию", () => {
	const logger = new Logger({ level: "info" });
	logger.info("a");
	const entries = logger.entries();
	entries[0].message = "подменено";
	assert.equal(logger.entries()[0].message, "a");
});