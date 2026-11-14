// check-bundle.mjs — ворота G3b: собранный main.js действительно загружается.
//
// Зачем: `tsc` и esbuild не ловят циклические импорты, при которых класс
// наследует `undefined` — модуль компилируется, но падает при загрузке в
// Obsidian ("Class extends value undefined is not a constructor or null").
// Здесь main.js подгружается в Node с заглушкой модуля `obsidian`.
//
// Запуск:  node tools/check-bundle.mjs   (сначала: cd plugin && npm run build)
//          node tools/check-bundle.mjs --file <путь к другому бандлу>
import { createRequire } from "node:module";
import Module from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const fileIdx = process.argv.indexOf("--file");
const mainPath =
	fileIdx !== -1 && process.argv[fileIdx + 1]
		? resolve(process.argv[fileIdx + 1])
		: join(root, "plugin", "main.js");

if (!existsSync(mainPath)) {
	console.error(
		"check:bundle FAILED — plugin/main.js не найден. Соберите: cd plugin && npm run build",
	);
	process.exit(1);
}

/** Имена, которые плагин может взять из `obsidian` на этапе загрузки модуля. */
const STUB_EXPORTS = [
	"Plugin",
	"ItemView",
	"PluginSettingTab",
	"Modal",
	"Setting",
	"Notice",
	"TFile",
	"TFolder",
	"WorkspaceLeaf",
	"Events",
	"Component",
	"App",
	"Vault",
	"MetadataCache",
	"FileSystemAdapter",
	"MarkdownView",
	"MarkdownRenderer",
	"Menu",
	"SuggestModal",
	"FuzzySuggestModal",
	"Platform",
];

class StubBase {
	constructor() {
		/* Пустая заглушка: важна только возможность наследования. */
	}
}

const obsidianStub = { __esModule: true };
for (const name of STUB_EXPORTS) {
	obsidianStub[name] = class Stub extends StubBase {};
}
obsidianStub.debounce = (fn) => fn;
obsidianStub.normalizePath = (p) => String(p);
obsidianStub.setIcon = () => {};
obsidianStub.requestUrl = async () => ({});

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
	if (request === "obsidian") {
		return obsidianStub;
	}
	return originalLoad.apply(this, arguments);
};

const requireFromHere = createRequire(import.meta.url);
let loaded;
try {
	loaded = requireFromHere(mainPath);
} catch (err) {
	console.error("check:bundle FAILED — main.js не загружается:\n");
	console.error(err && err.stack ? err.stack : String(err));
	process.exit(1);
} finally {
	Module._load = originalLoad;
}

const pluginClass =
	typeof loaded === "function"
		? loaded
		: loaded && typeof loaded.default === "function"
			? loaded.default
			: null;

if (!pluginClass) {
	console.error(
		"check:bundle FAILED — main.js не экспортирует класс плагина (ни module.exports, ни default)",
	);
	process.exit(1);
}

if (typeof pluginClass.prototype.onload !== "function") {
	console.error(
		"check:bundle FAILED — у экспортированного класса нет метода onload()",
	);
	process.exit(1);
}

console.log(
	`check:bundle OK — main.js загружается, экспортирует класс плагина с onload() (${pluginClass.name || "anonymous"})`,
);
