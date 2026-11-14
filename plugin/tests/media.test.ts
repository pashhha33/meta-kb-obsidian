import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAttachmentIndex } from "../src/core/attachment";
import {
	buildMediaPickItems,
	isMediaListValueType,
	isMediaValueType,
	mediaItemToCandidate,
} from "../src/core/media";
import { candidatesToValue } from "../src/core/suggest";
import { resolveField } from "../src/core/metamodel";

const records = [
	{
		id: "img1",
		type: "image",
		title: "Обложка",
		props: { attachment: "img/cover.png" },
	},
	{
		id: "img2",
		type: "image",
		title: "Постер",
		props: { attachment: "img/poster.jpg" },
	},
	// обёртка без attachment — в галерею не попадает (нарушение INV-24)
	{ id: "img3", type: "image", title: "Пустая", props: {} },
	// не image — не кандидат
	{ id: "b1", type: "book", title: "Книга", props: {} },
];

const imagePaths = [
	"img/cover.png",
	"img/poster.jpg",
	"img/free.webp",
	"doc.pdf",
];

test("isMediaValueType / isMediaListValueType", () => {
	assert.equal(isMediaValueType("media"), true);
	assert.equal(isMediaValueType("list<media>"), true);
	assert.equal(isMediaValueType("link"), false);
	assert.equal(isMediaValueType("attachment"), false);
	assert.equal(isMediaListValueType("list<media>"), true);
	assert.equal(isMediaListValueType("media"), false);
});

test("контракт: cover/poster/photo — media, artwork — list<media>", () => {
	// Маршрутизация в галерею опирается на valueType из resolveField: если
	// контракт отдаст другое значение, свойство молча откроется как текст.
	for (const key of ["cover", "poster", "photo"]) {
		const field = resolveField(key, undefined);
		assert.equal(field.valueType, "media", `${key}: valueType`);
		assert.equal(isMediaValueType(field.valueType), true, `${key}: маршрут`);
	}
	const artwork = resolveField("artwork", undefined);
	assert.equal(artwork.valueType, "list<media>");
	assert.equal(isMediaListValueType(artwork.valueType), true);
	assert.equal(isMediaValueType(artwork.valueType), true);
});

test("buildMediaPickItems: сначала обёртки, затем свободные изображения", () => {
	const items = buildMediaPickItems({
		records,
		imagePaths,
		index: buildAttachmentIndex(records),
	});
	assert.deepEqual(
		items.map((item) => [item.kind, item.value]),
		[
			["wrapper", "image_img1"],
			["wrapper", "image_img2"],
			["file", "img/free.webp"],
		],
	);
	// Превью обёртки берётся из её attachment.
	assert.equal(items[0].previewPath, "img/cover.png");
	assert.equal(items[0].title, "Обложка");
	assert.equal(items[0].id, "img1");
	// У файла — заготовка названия и пометка, что нужна обёртка.
	assert.equal(items[2].title, "free");
	assert.equal(items[2].note, "создать обёртку");
	assert.equal(items[2].id, undefined);
});

test("buildMediaPickItems: занятые файлы не дублируются как свободные", () => {
	const items = buildMediaPickItems({
		records,
		imagePaths,
		index: buildAttachmentIndex(records),
	});
	const files = items.filter((item) => item.kind === "file");
	assert.equal(files.length, 1);
	assert.ok(!files.some((item) => item.value === "img/cover.png"));
});

test("buildMediaPickItems: пустой vault и пустой индекс", () => {
	assert.deepEqual(
		buildMediaPickItems({
			records: [],
			imagePaths: [],
			index: buildAttachmentIndex([]),
		}),
		[],
	);
});

test("mediaItemToCandidate: ссылка на обёртку, а не на файл (INV-23)", () => {
	const items = buildMediaPickItems({
		records,
		imagePaths,
		index: buildAttachmentIndex(records),
	});
	const wrapper = items[0];
	const candidate = mediaItemToCandidate(wrapper);
	assert.equal(candidate.linkpath, "image_img1");
	assert.equal(candidate.type, "image");
	// Запись значения — каноническая ссылка с названием.
	assert.equal(
		candidatesToValue([candidate], false),
		"[[image_img1|Обложка]]",
	);
	// Список для list<media>.
	assert.deepEqual(candidatesToValue([candidate], true), [
		"[[image_img1|Обложка]]",
	]);
});