/**
 * Генерация идентификаторов объектов: UUIDv7.
 *
 * ontology.md / 02_Метамодель_v1.0.md §3: `id` уникален, стабилен, неизменяем,
 * не зависит от названия и не переиспользуется; допускается ULID или UUID v7.
 * Выбран UUIDv7: он лексикографически сортируется по времени создания, поэтому
 * файлы `{type}_{id}.md` упорядочены хронологически.
 *
 * Раскладка (RFC 9562):
 *   биты 0..47   — Unix-время в миллисекундах (big-endian)
 *   биты 48..51  — версия (0111 = 7)
 *   биты 52..63  — rand_a
 *   биты 64..65  — вариант (10)
 *   биты 66..127 — rand_b
 *
 * Чистая логика: без импортов obsidian.
 */

const HEX = "0123456789abcdef";

function randomBytes(count: number): Uint8Array {
	const out = new Uint8Array(count);
	const webCrypto = globalThis.crypto;
	if (webCrypto && typeof webCrypto.getRandomValues === "function") {
		webCrypto.getRandomValues(out);
		return out;
	}
	for (let i = 0; i < count; i += 1) {
		out[i] = Math.floor(Math.random() * 256);
	}
	return out;
}

function formatUuid(bytes: Uint8Array): string {
	const hex: string[] = [];
	for (let i = 0; i < 16; i += 1) {
		hex.push(HEX[bytes[i] >> 4] + HEX[bytes[i] & 0x0f]);
	}
	return (
		hex.slice(0, 4).join("") +
		"-" +
		hex.slice(4, 6).join("") +
		"-" +
		hex.slice(6, 8).join("") +
		"-" +
		hex.slice(8, 10).join("") +
		"-" +
		hex.slice(10, 16).join("")
	);
}

/**
 * Сгенерировать UUIDv7.
 * @param nowMs время в миллисекундах (для тестов можно зафиксировать)
 * @param random источник случайных байт (для тестов можно подменить)
 */
export function generateId(
	nowMs: number = Date.now(),
	random: (count: number) => Uint8Array = randomBytes,
): string {
	const bytes = new Uint8Array(16);

	let rest = Math.floor(nowMs);
	for (let i = 5; i >= 0; i -= 1) {
		bytes[i] = rest % 256;
		rest = Math.floor(rest / 256);
	}

	const r = random(10);
	bytes[6] = 0x70 | (r[0] & 0x0f);
	bytes[7] = r[1];
	bytes[8] = 0x80 | (r[2] & 0x3f);
	for (let i = 0; i < 7; i += 1) {
		bytes[9 + i] = r[3 + i];
	}

	return formatUuid(bytes);
}

const UUID_V7_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Проверка формы UUIDv7 (нижний регистр). */
export function isValidId(value: string): boolean {
	return UUID_V7_RE.test(value);
}

/** Время создания, зашитое в UUIDv7 (мс). null — если это не UUIDv7. */
export function idTimestamp(value: string): number | null {
	if (!isValidId(value)) {
		return null;
	}
	const hex = value.replace(/-/g, "").slice(0, 12);
	return Number.parseInt(hex, 16);
}
