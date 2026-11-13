import { test } from "node:test";
import assert from "node:assert/strict";
import {
	parseDatetimeOffset,
	formatDatetime,
	DatetimeFormatOptions,
} from "../src/core/datetime";

const opts = (datetimeDisplay: DatetimeFormatOptions["datetimeDisplay"], datetimeOffset = "+00:00"): DatetimeFormatOptions => ({
	datetimeDisplay,
	datetimeOffset,
});

test("parseDatetimeOffset", () => {
	assert.equal(parseDatetimeOffset("+03:00"), 180);
	assert.equal(parseDatetimeOffset("-0130"), -90);
	assert.equal(parseDatetimeOffset("+0330"), 210);
	assert.equal(parseDatetimeOffset("bad"), null);
});

test("formatDatetime: date без времени — как есть", () => {
	assert.equal(formatDatetime("2026-11-05", opts("utc")), "2026-11-05");
});

test("formatDatetime: utc", () => {
	assert.equal(
		formatDatetime("2026-11-05T10:00:00Z", opts("utc")),
		"2026-11-05 10:00 UTC",
	);
});

test("formatDatetime: fixed-offset", () => {
	assert.equal(
		formatDatetime("2026-11-05T10:00:00Z", opts("fixed-offset", "+03:00")),
		"2026-11-05 13:00 +03:00",
	);
});

test("formatDatetime: битые значения", () => {
	assert.equal(formatDatetime("", opts("utc")), "—");
	assert.equal(formatDatetime("not-a-date", opts("utc")), "not-a-date");
});
