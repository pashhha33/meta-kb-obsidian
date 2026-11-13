// schema-build.mjs — извлекает ключи из прозы metamodel/*.md и печатает их
// как «кандидат» для отладки сверки. Не пишет файлы контракта (вариант C:
// канонический машинный файл правится вручную; этот скрипт только показывает,
// что именно проза считает известными ключами).
// Запуск:  node tools/schema-build.mjs
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const LEADING_TICK = /^\|\s*`([^`]+)`\s*\|/;
const read = (file, re) => {
  const p = join(root, "metamodel", file);
  if (!existsSync(p)) return { file, missing: true, keys: [] };
  const out = new Set();
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const mm = line.match(re);
    if (mm) out.add(mm[1]);
  }
  return { file, missing: false, keys: [...out].sort() };
};

const report = {
  types: read("types.md", LEADING_TICK),
  properties: read("properties.md", LEADING_TICK),
  relations: read("relations.md", LEADING_TICK),
  validation: read("validation.md", LEADING_TICK),
  "field-expansion": read("field-expansion.md", /^###\s+(FE-\d+)/),
};

console.log(JSON.stringify(report, null, 2));
