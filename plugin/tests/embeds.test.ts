import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEmbed } from "../src/core/embeds";

/** Заглушки поиска: обёртка есть только для img/cover.png. */
const lookups = {
	wrapperForAttachment: (path: string) =>
		path === "img/cover.png" ? { id: "w1", title: "Обложка" } : undefined,
	resolveLink: (linkpath: string) =>
		linkpath === "image_w1"
			? { id: "w1", type: "image", title: "Обложка" }
			: undefined,
};

test("resolveEmbed: файл с обёрткой → открыть обёртку (C-IMG-03)", () => {
	const target = resolveEmbed("img/cover.png", lookups);
	assert.deepEqual(target, {
		action: "open-wrapper",
		attachment: "img/cover.png",
		wrapperId: "w1",
		label: "Обложка",
	});
});

test("resolveEmbed: файл без обёртки → создать обёртку", () => {
	const target = resolveEmbed("img/free.png", lookups);
	assert.equal(target?.action, "create-wrapper");
	assert.equal(target?.attachment, "img/free.png");
	assert.equal(target?.wrapperId, undefined);
	assert.equal(target?.label, "img/free.png");
});

test("resolveEmbed: embed обёртки ![[image_id]] → открыть обёртку", () => {
	const target = resolveEmbed("image_w1", lookups);
	assert.equal(target?.action, "open-wrapper");
	assert.equal(target?.wrapperId, "w1");
	assert.equal(target?.attachment, "");
});

test("resolveEmbed: не изображение → значка нет", () => {
	assert.equal(resolveEmbed("note_abc", lookups), null);
	assert.equal(resolveEmbed("doc.pdf", lookups), null);
	assert.equal(resolveEmbed("", lookups), null);
	assert.equal(resolveEmbed("   ", lookups), null);
});

test("resolveEmbed: нормализация пути (слэши и префиксы)", () => {
	// Obsidian может отдать `./img/cover.png` или с обратными слэшами.
	assert.equal(
		resolveEmbed("./img\\cover.png", lookups)?.action,
		"open-wrapper",
	);
	assert.equal(
		resolveEmbed("/img/free.png", lookups)?.action,
		"create-wrapper",
	);
});

test("resolveEmbed: ссылка не на image не считается обёрткой", () => {
	const other = {
		wrapperForAttachment: () => undefined,
		resolveLink: () => ({ id: "b1", type: "book", title: "Книга" }),
	};
	// `book_b1` — не изображение: значок не нужен.
	assert.equal(resolveEmbed("book_b1", other), null);
});