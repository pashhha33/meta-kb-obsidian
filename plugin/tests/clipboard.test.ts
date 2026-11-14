import { test } from "node:test";
import assert from "node:assert/strict";
import {
	buildPastedImagePath,
	clipboardImageExtension,
	guessAttachmentFolder,
	pastedImageStamp,
	resolveAttachmentFolder,
} from "../src/core/clipboard";

const at = new Date(2026, 10, 14, 18, 45, 7); // локальное 14.11.2026 18:45:07

test("pastedImageStamp: локальное время с ведущими нулями", () => {
	assert.equal(pastedImageStamp(at), "20261114184507");
	// Однозначные месяц/день/часы дополняются нулями.
	assert.equal(
		pastedImageStamp(new Date(2026, 0, 5, 9, 3, 1)),
		"20260105090301",
	);
});

test("clipboardImageExtension: MIME → расширение", () => {
	assert.equal(clipboardImageExtension("image/png"), "png");
	assert.equal(clipboardImageExtension("image/jpeg"), "jpg");
	assert.equal(clipboardImageExtension("image/jpg"), "jpg");
	assert.equal(clipboardImageExtension("image/gif"), "gif");
	assert.equal(clipboardImageExtension("image/webp"), "webp");
	// Регистр и пробелы не важны.
	assert.equal(clipboardImageExtension("  IMAGE/PNG  "), "png");
	// Не изображение / мусор.
	assert.equal(clipboardImageExtension("text/plain"), null);
	assert.equal(clipboardImageExtension("image/tiff"), null);
	assert.equal(clipboardImageExtension(""), null);
});

test("buildPastedImagePath: папка вложений или корень", () => {
	const none = () => false;
	assert.equal(
		buildPastedImagePath({
			folder: "attachment",
			now: at,
			extension: "png",
			exists: none,
		}),
		"attachment/Pasted image 20261114184507.png",
	);
	// '' — корень хранилища, без ведущего слэша.
	assert.equal(
		buildPastedImagePath({
			folder: "",
			now: at,
			extension: "png",
			exists: none,
		}),
		"Pasted image 20261114184507.png",
	);
	// Расширение нормализуется, пустое → png.
	assert.equal(
		buildPastedImagePath({
			folder: "./img/",
			now: at,
			extension: ".JPG",
			exists: none,
		}),
		"img/Pasted image 20261114184507.JPG",
	);
	assert.equal(
		buildPastedImagePath({
			folder: "",
			now: at,
			extension: "  ",
			exists: none,
		}),
		"Pasted image 20261114184507.png",
	);
});

test("buildPastedImagePath: не перезаписывает существующий файл", () => {
	const taken = new Set([
		"attachment/Pasted image 20261114184507.png",
		"attachment/Pasted image 20261114184507 1.png",
	]);
	const path = buildPastedImagePath({
		folder: "attachment",
		now: at,
		extension: "png",
		exists: (candidate) => taken.has(candidate),
	});
	assert.equal(path, "attachment/Pasted image 20261114184507 2.png");
});

test("resolveAttachmentFolder: значения настройки Obsidian", () => {
	// '' — корень хранилища.
	assert.equal(resolveAttachmentFolder("", "Книги"), "");
	// './' — папка текущей заметки.
	assert.equal(resolveAttachmentFolder("./", "Книги/Главы"), "Книги/Главы");
	assert.equal(resolveAttachmentFolder("./", ""), "");
	// Обычный путь нормализуется.
	assert.equal(resolveAttachmentFolder("attachment", "x"), "attachment");
	assert.equal(resolveAttachmentFolder("/attachment/", "x"), "attachment");
	assert.equal(resolveAttachmentFolder("img\\photos", "x"), "img/photos");
	// Не строка — как пустая настройка (корень).
	assert.equal(resolveAttachmentFolder(undefined, "Книги"), "");
	assert.equal(resolveAttachmentFolder(null, "Книги"), "");
});

test("guessAttachmentFolder: самая населённая папка с изображениями", () => {
	assert.equal(
		guessAttachmentFolder([
			"attachment/a.png",
			"attachment/b.png",
			"img/c.png",
			"root.png",
		]),
		"attachment",
	);
	// Файлы в корне папку не подсказывают.
	assert.equal(guessAttachmentFolder(["a.png", "b.png"]), "");
	assert.equal(guessAttachmentFolder([]), "");
	// Нормализация путей учитывается.
	assert.equal(
		guessAttachmentFolder([".\\attachment\\a.png", "attachment/b.png"]),
		"attachment",
	);
});