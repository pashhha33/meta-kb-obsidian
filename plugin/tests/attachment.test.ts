import { test } from "node:test";
import assert from "node:assert/strict";
import {
	buildAttachmentIndex,
	buildImageWrapperPlan,
	decideAttachment,
	fileExtension,
	isImagePath,
	normalizeAttachmentPath,
	unwrappedImagePaths,
	wrapperForPath,
} from "../src/core/attachment";

test("normalizeAttachmentPath: слэши, префиксы, процент", () => {
	assert.equal(normalizeAttachmentPath("  a\\b\\c.png "), "a/b/c.png");
	assert.equal(normalizeAttachmentPath("./img/photo.png"), "img/photo.png");
	assert.equal(normalizeAttachmentPath("/img/photo.png"), "img/photo.png");
	assert.equal(normalizeAttachmentPath("img//photo.png"), "img/photo.png");
	assert.equal(normalizeAttachmentPath("img/my%20photo.png"), "img/my photo.png");
});

test("normalizeAttachmentPath: якорь и query отбрасываются", () => {
	assert.equal(normalizeAttachmentPath("photo.png#frag"), "photo.png");
	assert.equal(normalizeAttachmentPath("photo.png?v=2"), "photo.png");
});

test("normalizeAttachmentPath: пустое и не-строки", () => {
	assert.equal(normalizeAttachmentPath(""), "");
	assert.equal(normalizeAttachmentPath("   "), "");
	assert.equal(normalizeAttachmentPath(undefined), "");
	assert.equal(normalizeAttachmentPath(42), "");
});

test("fileExtension / isImagePath", () => {
	assert.equal(fileExtension("a/b/Photo.PNG"), "png");
	assert.equal(fileExtension("noext"), "");
	assert.equal(fileExtension("trailing."), "");
	assert.equal(isImagePath("photo.webp"), true);
	assert.equal(isImagePath("doc.pdf"), false);
	assert.equal(isImagePath("image_01a1.md"), false);
});

const records = [
	{ id: "img1", type: "image", title: "Обложка", props: { attachment: "img/cover.png" } },
	{ id: "img2", type: "image", title: "Постер", props: { attachment: "img\\poster.jpg" } },
	{ id: "img3", type: "image", title: "Без вложения", props: {} },
	{ id: "p1", type: "person", title: "Алиса", props: { attachment: "img/cover.png" } },
];

test("buildAttachmentIndex: только image, путь нормализован", () => {
	const index = buildAttachmentIndex(records);
	assert.equal(index.byPath.size, 2);
	assert.equal(index.byPath.get("img/cover.png")?.id, "img1");
	assert.equal(index.byPath.get("img/poster.jpg")?.id, "img2");
	assert.equal(index.byPath.get("img/poster.jpg")?.title, "Постер");
	assert.equal(index.duplicates.length, 0);
});

test("buildAttachmentIndex: дубли attachment — нарушение C-IMG-05", () => {
	const index = buildAttachmentIndex([
		{ id: "a", type: "image", title: "A", props: { attachment: "x.png" } },
		{ id: "b", type: "image", title: "B", props: { attachment: "./x.png" } },
	]);
	assert.equal(index.byPath.size, 1);
	assert.equal(index.duplicates.length, 1);
	assert.deepEqual(index.duplicates[0], { path: "x.png", ids: ["a", "b"] });
});

test("wrapperForPath: находит по нормализованному пути", () => {
	const index = buildAttachmentIndex(records);
	assert.equal(wrapperForPath(index, "img/cover.png")?.id, "img1");
	assert.equal(wrapperForPath(index, "./img/Cover.PNG"), undefined); // регистр значим
	assert.equal(wrapperForPath(index, "нет.png"), undefined);
	assert.equal(wrapperForPath(index, ""), undefined);
});

test("unwrappedImagePaths: только изображения без обёртки", () => {
	const index = buildAttachmentIndex(records);
	const files = ["img/cover.png", "img/new.gif", "doc.pdf", "img/poster.jpg"];
	assert.deepEqual(unwrappedImagePaths(files, index), ["img/new.gif"]);
});

test("buildImageWrapperPlan: attachment обязателен и нормализован", () => {
	const plan = buildImageWrapperPlan({
		title: "Обложка",
		attachment: "./img\\Cover.PNG",
		definedBy: "def-1",
		id: "w1",
		now: new Date("2026-11-14T10:00:00.000Z"),
	});
	assert.equal(plan.filename, "image_w1.md");
	assert.equal(plan.frontmatter.type, "image");
	assert.equal(plan.frontmatter.attachment, "img/Cover.PNG");
	assert.equal(plan.frontmatter.defined_by, "def-1");
	assert.deepEqual(plan.frontmatter.aliases, ["Обложка"]);
});

test("buildImageWrapperPlan: roles добавляются только непустые", () => {
	const withRoles = buildImageWrapperPlan({
		title: "A",
		attachment: "a.png",
		id: "i",
		roles: ["cover"],
	});
	assert.deepEqual(withRoles.frontmatter.roles, ["cover"]);

	const withoutRoles = buildImageWrapperPlan({
		title: "A",
		attachment: "a.png",
		id: "i",
		roles: [],
	});
	assert.ok(!("roles" in withoutRoles.frontmatter));
});

test("decideAttachment: свободный файл разрешён", () => {
	const index = buildAttachmentIndex(records);
	const decision = decideAttachment(index, "img/new.png");
	assert.equal(decision.allowed, true);
	assert.equal(decision.reason, "ok");
	assert.equal(decision.existing, undefined);
});

test("decideAttachment: занятый файл запрещён и отдаёт существующую обёртку", () => {
	const index = buildAttachmentIndex(records);
	const decision = decideAttachment(index, "./img/cover.png");
	assert.equal(decision.allowed, false);
	assert.equal(decision.reason, "owned-by-other");
	assert.equal(decision.existing?.id, "img1");
	assert.equal(decision.existing?.title, "Обложка");
});

test("decideAttachment: своей обёртке свой путь разрешён", () => {
	const index = buildAttachmentIndex(records);
	const decision = decideAttachment(index, "img/cover.png", "img1");
	assert.equal(decision.allowed, true);
	assert.equal(decision.existing?.id, "img1");
});

test("decideAttachment: пустой путь запрещён", () => {
	const index = buildAttachmentIndex(records);
	assert.equal(decideAttachment(index, "").reason, "empty");
	assert.equal(decideAttachment(index, "   ").allowed, false);
});
