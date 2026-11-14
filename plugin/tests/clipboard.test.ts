import { test } from "node:test";
import assert from "node:assert/strict";
import {
	buildImportedImagePath,
	buildPastedImagePath,
	clipboardImageExtension,
	guessAttachmentFolder,
	parseFileNameW,
	parsePathList,
	parseUriList,
	pastedImageStamp,
	pickImageFilePaths,
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

// --- файл, скопированный в проводнике (CF_HDROP) ------------------------------

/** Собрать буфер `FileNameW`: UTF-16LE, строки через NUL, в конце двойной NUL. */
function fileNameWBuffer(paths: string[]): Uint8Array {
	const text = paths.join("\u0000") + "\u0000\u0000";
	const bytes = new Uint8Array(text.length * 2);
	for (let index = 0; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		bytes[index * 2] = code & 0xff;
		bytes[index * 2 + 1] = code >> 8;
	}
	return bytes;
}

test("parseFileNameW: список путей из формата Windows", () => {
	assert.deepEqual(
		parseFileNameW(fileNameWBuffer(["C:\\img\\a.png", "C:\\img\\b.jpg"])),
		["C:\\img\\a.png", "C:\\img\\b.jpg"],
	);
	assert.deepEqual(parseFileNameW(new Uint8Array(0)), []);
	// Кириллица в пути (UTF-16LE, а не UTF-8).
	assert.deepEqual(
		parseFileNameW(fileNameWBuffer(["D:\\Фото\\кот.png"])),
		["D:\\Фото\\кот.png"],
	);
});

test("parseUriList: file://-ссылки и комментарии", () => {
	assert.deepEqual(
		parseUriList(
			"# комментарий\r\nfile:///C:/Users/a/My%20Photo.png\r\nfile:///home/x/b.jpg\r\n",
		),
		["C:/Users/a/My Photo.png", "/home/x/b.jpg"],
	);
	// Не-файловые URI и UNC отбрасываются.
	assert.deepEqual(parseUriList("https://example.com/a.png"), []);
	assert.deepEqual(parseUriList("file://server/share/a.png"), []);
	assert.deepEqual(parseUriList(""), []);
});

test("parsePathList: текст как список путей, кавычки снимаются", () => {
	assert.deepEqual(parsePathList('C:\\a.png\n"C:\\b c.png"\n\n'), [
		"C:\\a.png",
		"C:\\b c.png",
	]);
	assert.deepEqual(parsePathList(""), []);
});

test("pickImageFilePaths: только существующие изображения, без дублей", () => {
	const existing = new Set(["C:\\img\\a.png", "C:\\img\\b.jpg"]);
	const isFile = (path: string): boolean => existing.has(path);
	const picked = pickImageFilePaths(
		[
			"C:\\img\\a.png",
			"C:\\img\\A.PNG", // тот же файл в другом формате буфера
			"C:\\img\\b.jpg",
			"C:\\img\\нет.png", // файла нет
			"C:\\img\\doc.pdf", // не изображение
			"",
		],
		isFile,
	);
	assert.deepEqual(picked, ["C:\\img\\a.png", "C:\\img\\b.jpg"]);
});

test("buildImportedImagePath: исходное имя, уникализация при занятости", () => {
	const none = () => false;
	assert.equal(
		buildImportedImagePath({
			folder: "attachment",
			sourceName: "C:\\Users\\me\\Photo.JPG",
			exists: none,
		}),
		"attachment/Photo.JPG",
	);
	assert.equal(
		buildImportedImagePath({
			folder: "",
			sourceName: "/home/me/cover.png",
			exists: none,
		}),
		"cover.png",
	);
	// Занятое имя получает суффикс, расширение сохраняется.
	const taken = new Set(["attachment/cover.png", "attachment/cover 1.png"]);
	assert.equal(
		buildImportedImagePath({
			folder: "attachment",
			sourceName: "cover.png",
			exists: (path) => taken.has(path),
		}),
		"attachment/cover 2.png",
	);
	// Без расширения — png по умолчанию.
	assert.equal(
		buildImportedImagePath({
			folder: "img",
			sourceName: "screenshot",
			exists: none,
		}),
		"img/screenshot.png",
	);
});