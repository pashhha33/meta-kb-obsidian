import { test } from "node:test";
import assert from "node:assert/strict";
import {
	clampThumbnailSize,
	normalizeThumbnailAspect,
	thumbnailAspectRatio,
	THUMBNAIL_SIZE_DEFAULT,
	THUMBNAIL_SIZE_MAX,
	THUMBNAIL_SIZE_MIN,
} from "../src/core/thumbnails";

test("clampThumbnailSize: мусор → значение по умолчанию", () => {
	assert.equal(clampThumbnailSize(undefined), THUMBNAIL_SIZE_DEFAULT);
	assert.equal(clampThumbnailSize("abc"), THUMBNAIL_SIZE_DEFAULT);
	assert.equal(clampThumbnailSize(null), THUMBNAIL_SIZE_DEFAULT);
});

test("clampThumbnailSize: диапазон и округление", () => {
	assert.equal(clampThumbnailSize(10), THUMBNAIL_SIZE_MIN);
	assert.equal(clampThumbnailSize(9999), THUMBNAIL_SIZE_MAX);
	assert.equal(clampThumbnailSize(120.6), 121);
	assert.equal(clampThumbnailSize("96"), 96);
});

test("normalizeThumbnailAspect: известные значения и откат к квадрату", () => {
	assert.equal(normalizeThumbnailAspect("native"), "native");
	assert.equal(normalizeThumbnailAspect("16:9"), "16:9");
	assert.equal(normalizeThumbnailAspect("4:3"), "4:3");
	assert.equal(normalizeThumbnailAspect("square"), "square");
	assert.equal(normalizeThumbnailAspect("какая-то ерунда"), "square");
	assert.equal(normalizeThumbnailAspect(undefined), "square");
});

test("thumbnailAspectRatio: CSS-значения и native", () => {
	assert.equal(thumbnailAspectRatio("square"), "1 / 1");
	assert.equal(thumbnailAspectRatio("4:3"), "4 / 3");
	assert.equal(thumbnailAspectRatio("16:9"), "16 / 9");
	assert.equal(thumbnailAspectRatio("native"), null);
	assert.equal(thumbnailAspectRatio("junk"), "1 / 1");
});
