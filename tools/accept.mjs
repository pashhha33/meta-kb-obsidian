// accept.mjs — ворота G4: приёмка на fixtures/vault **тем же валидатором**, что
// видит пользователь плагина.
//
// Модель: файл с маркером `<!-- expect: rule_key[, rule_key] -->` обязан дать
// находку по каждому указанному правилу; файлы без маркера — не давать ошибок
// (предупреждения допустимы).
//
// Почему валидатор берётся из собранного бандла: собственные проверки в этом
// скрипте были второй реализацией правил и неизбежно расходились бы с
// `plugin/src/core/validation.ts`. Здесь только ожидания, а правила — в плагине.
//
// Запуск:  node tools/accept.mjs   (сначала: cd plugin && npm run build)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const bundlePath = join(root, "plugin", "main.js");
if (!existsSync(bundlePath)) {
	console.error(
		"accept FAILED — plugin/main.js не найден. Соберите: cd plugin && npm run build",
	);
	process.exit(1);
}

const vaultDir = join(root, "fixtures", "vault");
if (!existsSync(vaultDir)) {
	console.error(`accept FAILED — нет ${vaultDir}`);
	process.exit(1);
}

// --- валидатор из бандла -------------------------------------------------------
// Заглушка `obsidian` нужна потому, что main.js импортирует API Obsidian.
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

class StubBase {}
const obsidianStub = { __esModule: true };
for (const name of STUB_EXPORTS) {
	obsidianStub[name] = class Stub extends StubBase {};
}
obsidianStub.debounce = (fn) => fn;
obsidianStub.normalizePath = (path) => String(path);
obsidianStub.setIcon = () => {};
obsidianStub.requestUrl = async () => ({});

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
	if (request === "obsidian") {
		return obsidianStub;
	}
	return originalLoad.apply(this, arguments);
};

let bundle;
try {
	bundle = createRequire(import.meta.url)(bundlePath);
} catch (err) {
	console.error("accept FAILED — бандл не загружается:\n");
	console.error(err && err.stack ? err.stack : String(err));
	process.exit(1);
} finally {
	Module._load = originalLoad;
}

const validateVault =
	bundle && typeof bundle.validateVault === "function"
		? bundle.validateVault
		: bundle?.default?.validateVault;
if (typeof validateVault !== "function") {
	console.error(
		"accept FAILED — main.js не экспортирует validateVault. " +
			"Проверьте `export { validateVault } from \"./core/validation\"` в src/main.ts",
	);
	process.exit(1);
}

// --- разбор фикстур ------------------------------------------------------------
/** Минимальный парсер YAML-frontmatter (скаляры + списки `- item`). */
function parseFrontmatter(text) {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) {
		return {};
	}
	const out = {};
	let current = null;
	const strip = (value) => {
		const trimmed = value.trim();
		return trimmed.startsWith('"') && trimmed.endsWith('"')
			? trimmed.slice(1, -1)
			: trimmed;
	};
	for (const line of match[1].split(/\r?\n/)) {
		const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (pair) {
			current = pair[1];
			const value = strip(pair[2]);
			out[current] = value === "" ? [] : value;
		} else {
			const item = line.match(/^\s*-\s+(.*)$/);
			if (item && current) {
				if (!Array.isArray(out[current])) {
					out[current] = [];
				}
				out[current].push(strip(item[1]));
			}
		}
	}
	return out;
}

const EXPECT_RE = /<!--\s*expect:\s*([^>]+?)\s*-->/;
const asString = (value) => (typeof value === "string" ? value : "");
const asList = (value) =>
	Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];

const files = readdirSync(vaultDir)
	.filter((name) => name.endsWith(".md"))
	.sort();

const records = [];
const expectations = new Map(); // stem → rule keys
for (const name of files) {
	const text = readFileSync(join(vaultDir, name), "utf8");
	const stem = name.replace(/\.md$/, "");
	const frontmatter = parseFrontmatter(text);
	const marker = text.match(EXPECT_RE);
	if (marker) {
		expectations.set(
			stem,
			marker[1]
				.split(",")
				.map((rule) => rule.trim())
				.filter((rule) => rule !== ""),
		);
	}
	records.push({
		path: stem,
		id: asString(frontmatter.id),
		type: asString(frontmatter.type),
		title: asString(frontmatter.title),
		aliases: asList(frontmatter.aliases),
		status: asString(frontmatter.status) || undefined,
		layer: asString(frontmatter.layer) || undefined,
		props: frontmatter,
		body: "",
	});
}

const result = validateVault(records, { imagePaths: [] });

// --- assertion-режим -----------------------------------------------------------
const byPath = new Map();
for (const finding of result.findings) {
	const list = byPath.get(finding.path) ?? [];
	list.push(finding);
	byPath.set(finding.path, list);
}

let failed = false;
for (const record of records) {
	const findings = byPath.get(record.path) ?? [];
	const expected = expectations.get(record.path);
	const errors = findings.filter((item) => item.severity === "error");

	if (expected) {
		for (const rule of expected) {
			if (!findings.some((item) => item.rule_key === rule)) {
				console.error(
					`ASSERT ${record.path}: ожидалась находка «${rule}», а её нет ` +
						`(получено: ${findings.map((item) => item.rule_key).join(", ") || "ничего"})`,
				);
				failed = true;
			}
		}
	} else if (errors.length > 0) {
		console.error(
			`ASSERT ${record.path}: не должен давать ошибок — ` +
				errors.map((item) => `${item.rule_key}: ${item.message}`).join("; "),
		);
		failed = true;
	}
}

console.log(
	`accept: ${records.length} заметок · с ожиданиями=${expectations.size} · ` +
		`errors=${result.errors} · warnings=${result.warnings}`,
);
for (const finding of result.findings) {
	const line = `  ${finding.severity === "error" ? "error" : "warn "} ` +
		`${finding.path}: ${finding.rule_key}${finding.field ? ` (${finding.field})` : ""} — ${finding.message}`;
	if (finding.severity === "error") {
		console.error(line);
	} else {
		console.log(line);
	}
}

if (failed) {
	console.error("accept FAILED — фикстуры ведут себя не так, как задумано");
	process.exit(1);
}
console.log("accept OK — фикстуры соответствуют ожиданиям (валидатор плагина)");