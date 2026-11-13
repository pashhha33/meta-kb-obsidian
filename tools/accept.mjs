// accept.mjs — ворота G4 (headless): приёмка на fixtures/vault по контракту.
//
// Модель: файлы с префиксом `broken_` обязаны дать хотя бы одну находку
// (error или warning); остальные файлы обязаны пройти без ошибок. Скрипт
// зелёный, только когда фикстуры ведут себя как задумано (assertion-режим).
//
// Проверки: обязательные ключи (id/type/title), известность типа, значения
// enum, разрешение канонических ссылок [[...]] внутри fixture-хранилища.
//
// Запуск:  node tools/accept.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const schemaPath = join(root, "schema", "metamodel.json");
if (!existsSync(schemaPath)) {
	console.error(`accept: missing ${schemaPath}`);
	process.exit(1);
}
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

const knownTypes = new Set([
	...schema.metatypes.map((t) => t.type_value),
	...schema.types.map((t) => t.type_value),
]);

const enumByKey = new Map();
for (const p of [...schema.universalProperties, ...schema.properties]) {
	if (p.enum_values) enumByKey.set(p.property_key, new Set(p.enum_values));
}

const vaultDir = join(root, "fixtures", "vault");
if (!existsSync(vaultDir)) {
	console.error(`accept: missing ${vaultDir}`);
	process.exit(1);
}
const files = readdirSync(vaultDir).filter((f) => f.endsWith(".md"));
const stems = new Set(files.map((f) => f.replace(/\.md$/, "")));

/** Минимальный парсер YAML-frontmatter (скаляры + списки `- item`). */
function parseFrontmatter(text) {
	const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!m) return {};
	const out = {};
	let current = null;
	const strip = (s) => {
		const t = s.trim();
		return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
	};
	for (const line of m[1].split(/\r?\n/)) {
		const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (kv) {
			current = kv[1];
			const val = strip(kv[2]);
			out[current] = val === "" ? [] : val;
		} else {
			const item = line.match(/^\s*-\s+(.*)$/);
			if (item && current) {
				if (!Array.isArray(out[current])) out[current] = [];
				out[current].push(strip(item[1]));
			}
		}
	}
	return out;
}

const LINK_RE = /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/;
const findings = new Map(); // file -> { errors: [], warnings: [] }

for (const f of files) {
	const text = readFileSync(join(vaultDir, f), "utf8");
	const fm = parseFrontmatter(text);
	const rec = { errors: [], warnings: [] };
	findings.set(f, rec);

	if (!fm.id) rec.errors.push("нет id");
	if (!fm.type) rec.errors.push("нет type");
	if (!fm.title) rec.errors.push("нет title");
	if (fm.type && !knownTypes.has(fm.type)) rec.errors.push(`неизвестный тип "${fm.type}"`);

	for (const [k, v] of Object.entries(fm)) {
		const ev = enumByKey.get(k);
		if (ev) {
			for (const x of Array.isArray(v) ? v : [v]) {
				if (!ev.has(x)) rec.errors.push(`enum ${k} содержит "${x}"`);
			}
		}
		for (const x of Array.isArray(v) ? v : [v]) {
			if (typeof x !== "string") continue;
			const lm = x.match(LINK_RE);
			if (lm && !stems.has(lm[1])) rec.warnings.push(`битая ссылка [[${lm[1]}]] в ${k}`);
		}
	}
}

// --- assertion-режим -----------------------------------------------------------
let failed = false;
let expectedBroken = 0;
for (const f of files) {
	const rec = findings.get(f);
	const isBroken = f.startsWith("broken_");
	if (isBroken) {
		expectedBroken++;
		if (rec.errors.length === 0 && rec.warnings.length === 0) {
			console.error(`ASSERT ${f}: ожидалась находка, но файл чист`);
			failed = true;
		}
	} else if (rec.errors.length > 0) {
		console.error(`ASSERT ${f}: не должен давать ошибок — ${rec.errors.join("; ")}`);
		failed = true;
	}
}

const totalErrors = [...findings.values()].reduce((n, r) => n + r.errors.length, 0);
const totalWarnings = [...findings.values()].reduce((n, r) => n + r.warnings.length, 0);

console.log(
	`accept: ${files.length} заметок · broken=${expectedBroken} · errors=${totalErrors} · warnings=${totalWarnings}`,
);
for (const [f, r] of findings) {
	for (const e of r.errors) console.error(`  error  ${f}: ${e}`);
	for (const w of r.warnings) console.log(`  warn   ${f}: ${w}`);
}

if (failed) {
	console.error("accept FAILED — фикстуры ведут себя не так, как задумано");
	process.exit(1);
}
console.log("accept OK — фикстуры соответствуют ожиданиям");
