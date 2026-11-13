// check-state.mjs — ворота G1: PHASE.md согласован с iterations/ и не пуст.
// Запуск:  node tools/check-state.mjs
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const phasePath = join(root, "PHASE.md");
if (!existsSync(phasePath)) {
	console.error("check:state FAILED — PHASE.md отсутствует");
	process.exit(1);
}

const kv = {};
for (const line of readFileSync(phasePath, "utf8").split(/\r?\n/)) {
	const m = line.match(/^\*\*(.+?):\*\*\s*(.+)$/);
	if (m) kv[m[1].trim()] = m[2].trim();
}

const errors = [];
const phase = kv["Фаза"];
const iteration = kv["Итерация"];
const status = kv["Статус"];
const next = kv["Следующее действие"];

if (!phase) errors.push("PHASE.md: не найдено поле «Фаза»");
if (!iteration) errors.push("PHASE.md: не найдено поле «Итерация»");
if (!status) errors.push("PHASE.md: не найдено поле «Статус»");
if (!next || next === "—" || next === "(нет)") errors.push("PHASE.md: «Следующее действие» пусто");

if (iteration && !existsSync(join(root, "iterations", `${iteration}.md`))) {
	errors.push(`iterations/${iteration}.md отсутствует`);
}

if (errors.length) {
	console.error("check:state FAILED:");
	for (const e of errors) console.error("  - " + e);
	process.exit(1);
}
console.log(`check:state OK — ${phase} · ${iteration} · ${status}`);
