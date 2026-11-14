// schema-check.mjs — ворота G2: валидация контракта + сверка с прозой в обе стороны.
// Без внешних зависимостей. Запуск из корня репозитория:  node tools/schema-check.mjs
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

let errors = [];
let warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// --- чтение контракта и служебных файлов -------------------------------------
// --file <путь> — проверка другого контракта (для отладки/фальсификации ворот).
const fileArg = process.argv.indexOf("--file");
const schemaPath =
	fileArg !== -1 && process.argv[fileArg + 1]
		? resolve(process.argv[fileArg + 1])
		: join(root, "schema", "metamodel.json");
const versionPath = join(root, "schema", "VERSION");
if (!existsSync(schemaPath)) { console.error(`missing ${schemaPath}`); process.exit(1); }

let m;
try { m = JSON.parse(readFileSync(schemaPath, "utf8")); }
catch (e) { console.error(`metamodel.json is not valid JSON: ${e.message}`); process.exit(1); }

// VERSION == schemaVersion
if (existsSync(versionPath)) {
  const v = readFileSync(versionPath, "utf8").trim();
  if (v !== m.schemaVersion) fail(`schema/VERSION (${v}) != schemaVersion (${m.schemaVersion})`);
} else fail("schema/VERSION missing");

// --- множества ключей --------------------------------------------------------
const set = (arr, label) => {
  const seen = new Set();
  for (const x of arr) {
    if (seen.has(x)) fail(`duplicate ${label}: ${x}`);
    seen.add(x);
  }
  return seen;
};

const valueTypes = set(m.valueTypes, "value_type");
const listValueTypes = set(m.listValueTypes, "list value_type");
for (const vt of listValueTypes) if (!valueTypes.has(vt)) fail(`listValueTypes mentions non-listed ${vt}`);

const layers = new Set(m.layers);
const statuses = new Set(m.statuses);
const metatypes = set(m.metatypes.map(t => t.type_value), "metatype type_value");
const metaIds = set(m.metatypes.map(t => t.id), "metatype id");
const types = set(m.types.map(t => t.type_value), "type_value");
const universal = new Map(); for (const p of m.universalProperties) universal.set(p.property_key, p);
const props = new Map(); for (const p of m.properties) props.set(p.property_key, p);
const rels = new Map(); for (const r of m.relations) rels.set(r.relation_key, r);
const feIds = set(m.fieldExpansion.map(f => f.id), "field-expansion id");
const rules = new Map(); for (const r of m.validationRules) rules.set(r.rule_key, r);

// метатипы не пересекаются с ядром types
for (const t of metatypes) if (types.has(t)) fail(`metatype type_value collides with core type: ${t}`);

// --- слои/статусы у метатипов ------------------------------------------------
for (const mt of m.metatypes) {
  if (!layers.has(mt.layer)) fail(`metatype ${mt.type_value}: unknown layer ${mt.layer}`);
  if (mt.id.length < 8) fail(`metatype ${mt.type_value}: suspicious id ${mt.id}`);
  // types.md §1: «У всех: type: type, layer: system, status: accepted».
  // `layer` — слой, которому принадлежит сам объект-определение (всегда system);
  // `defines_layer` — слой объектов, которые этот метатип определяет.
  if (mt.layer !== "system") {
    fail(`metatype ${mt.type_value}: layer = ${mt.layer}, ожидается system (types.md §1)`);
  }
  if (!layers.has(mt.defines_layer)) {
    fail(`metatype ${mt.type_value}: defines_layer = ${mt.defines_layer} не из списка слоёв`);
  }
}
if (m.metatypes.length !== 10) warn(`metatypes count = ${m.metatypes.length} (expected 10)`);

// --- типы --------------------------------------------------------------------
const typeMap = new Map(m.types.map(t => [t.type_value, t]));
for (const t of m.types) {
  if (t.extends !== null && !types.has(t.extends)) fail(`type ${t.type_value}: unknown parent ${t.extends}`);
}
// extends acyclic
const visiting = new Set(), done = new Set();
const visit = (tv) => {
  if (done.has(tv)) return;
  if (visiting.has(tv)) { fail(`extends cycle at ${tv}`); return; }
  visiting.add(tv);
  const t = typeMap.get(tv);
  if (t && t.extends) visit(t.extends);
  visiting.delete(tv); done.add(tv);
};
for (const tv of types) visit(tv);

// --- свойства ----------------------------------------------------------------
const allPropKeys = new Set([...universal.keys(), ...props.keys()]);
for (const [k, p] of props) {
  if (!valueTypes.has(p.value_type)) fail(`property ${k}: unknown value_type ${p.value_type}`);
  if ((p.value_type === "enum" || p.value_type === "list<enum>") && !Array.isArray(p.enum_values)) fail(`property ${k}: enum needs enum_values`);
  if (p.enum_values) {
    if ((p.value_type !== "enum" && p.value_type !== "list<enum>")) warn(`property ${k}: enum_values set but value_type is ${p.value_type}`);
    const vs = set(p.enum_values, `${k}.enum_values`);
  }
  for (const ap of p.applies_to) {
    if (ap !== "*" && !types.has(ap) && !metatypes.has(ap)) fail(`property ${k}: applies_to unknown type ${ap}`);
  }
}
for (const [k, p] of universal) {
  if (!valueTypes.has(p.value_type)) fail(`universal property ${k}: unknown value_type ${p.value_type}`);
}

// --- отношения ----------------------------------------------------------------
const knownEndpoints = new Set([...types, ...metatypes, "*"]);
for (const [k, r] of rels) {
  if (!["0..1", "1..1", "0..*", "1..*"].includes(r.cardinality)) fail(`relation ${k}: bad cardinality ${r.cardinality}`);
  for (const s of r.source_type) if (!knownEndpoints.has(s)) fail(`relation ${k}: unknown source_type ${s}`);
  for (const t of r.target_type) if (!knownEndpoints.has(t)) fail(`relation ${k}: unknown target_type ${t}`);
}

// --- field expansion -----------------------------------------------------------
for (const f of m.fieldExpansion) {
  if (f.mode !== "union") fail(`${f.id}: mode must be union`);
  for (const at of f.applies_to_type) if (!types.has(at)) fail(`${f.id}: unknown applies_to_type ${at}`);
  if (!allPropKeys.has(f.trigger_property)) fail(`${f.id}: trigger_property ${f.trigger_property} not in properties`);
  const tp = props.get(f.trigger_property) || universal.get(f.trigger_property);
  if (tp && tp.value_type !== "enum" && tp.value_type !== "list<enum>") fail(`${f.id}: trigger ${f.trigger_property} is ${tp.value_type}, not enum`);
  const enumValues = tp && tp.enum_values ? new Set(tp.enum_values) : null;
  if (enumValues) for (const tv of f.trigger_values) if (!enumValues.has(tv)) fail(`${f.id}: trigger_value ${tv} not in ${f.trigger_property} enum`);
  for (const p of f.adds_properties) if (!allPropKeys.has(p)) fail(`${f.id}: adds_properties ${p} unknown`);
  for (const r of f.adds_relations) if (!rels.has(r)) fail(`${f.id}: adds_relations ${r} unknown`);
  if (f.adds_properties.length === 0 && f.adds_relations.length === 0) fail(`${f.id}: no adds_*`);
}

// --- validation rules -----------------------------------------------------------
for (const [k, r] of rules) {
  if (!["error", "warning"].includes(r.severity)) fail(`rule ${k}: bad severity ${r.severity}`);
}

// --- settings -------------------------------------------------------------------
const settingKeys = set(m.settings.map(s => s.key), "setting key");
for (const s of m.settings) {
  if (!["boolean", "number", "string", "enum"].includes(s.type)) fail(`setting ${s.key}: bad type ${s.type}`);
  if (s.type === "enum" && !Array.isArray(s.values)) fail(`setting ${s.key}: enum needs values`);
}

// --- enums cross-check -----------------------------------------------------------
const occEnum = new Set(m.enums.occupation.map(o => o.value));
const occProp = props.get("occupation");
if (occProp && occProp.enum_values) {
  const occSet = new Set(occProp.enum_values);
  for (const v of occEnum) if (!occSet.has(v)) fail(`enums.occupation value ${v} missing in property occupation`);
  for (const v of occSet) if (!occEnum.has(v)) fail(`property occupation value ${v} missing in enums.occupation`);
}
for (const role of m.enums.imageRoles) { /* roles enum cross-check below */ }
const rolesProp = props.get("roles");
if (rolesProp && rolesProp.enum_values) {
  const rset = new Set(rolesProp.enum_values), eset = new Set(m.enums.imageRoles);
  for (const v of rset) if (!eset.has(v)) fail(`roles value ${v} missing in enums.imageRoles`);
  for (const v of eset) if (!rset.has(v)) fail(`enums.imageRoles value ${v} missing in roles`);
}

// --- сверка с прозой (обе стороны) ----------------------------------------------
const proseKeys = (file, res) => {
  const p = join(root, "metamodel", file);
  if (!existsSync(p)) { warn(`prose file metamodel/${file} missing`); return null; }
  const out = new Set();
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    for (const re of res) {
      const mm = line.match(re);
      if (mm) { out.add(mm[1]); break; }
    }
  }
  return out;
};
const LEADING_TICK = /^\|\s*`([^`]+)`\s*\|/;
const NUMBER_TICK = /^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|/;

const proseTypeKeys = proseKeys("types.md", [LEADING_TICK, NUMBER_TICK]);
const prosePropKeys = proseKeys("properties.md", [LEADING_TICK]);
const proseRelKeys = proseKeys("relations.md", [LEADING_TICK]);
const proseRuleKeys = proseKeys("validation.md", [LEADING_TICK]);
const proseFeKeys = proseKeys("field-expansion.md", [/^###\s+(FE-\d+)/]);

// Таблица метатипов types.md §1: No | type_value | Русское имя | Определяет объекты слоя | id
const proseDefinesLayer = (() => {
  const p = join(root, "metamodel", "types.md");
  if (!existsSync(p)) return null;
  const map = new Map();
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const mm = line.match(
      /^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|[^|]*\|\s*(system|classification|content)\s*\|/,
    );
    if (mm) map.set(mm[1], mm[2]);
  }
  return map;
})();

if (proseDefinesLayer) {
  for (const mt of m.metatypes) {
    const expected = proseDefinesLayer.get(mt.type_value);
    if (!expected) {
      warn(`metatype ${mt.type_value}: не найден в таблице types.md §1`);
    } else if (expected !== mt.defines_layer) {
      fail(
        `metatype ${mt.type_value}: defines_layer = ${mt.defines_layer}, ` +
          `а types.md §1 говорит ${expected}`,
      );
    }
  }
}

// schema → prose (нельзя объявлять ключ, которого проза не объясняет)
if (proseTypeKeys) for (const tv of [...metatypes, ...types]) if (!proseTypeKeys.has(tv)) fail(`type_value ${tv} absent from metamodel/types.md`);
if (prosePropKeys) for (const k of allPropKeys) if (!prosePropKeys.has(k)) fail(`property_key ${k} absent from metamodel/properties.md`);
if (proseRelKeys) for (const k of rels.keys()) if (!proseRelKeys.has(k)) fail(`relation_key ${k} absent from metamodel/relations.md`);
if (proseRuleKeys) for (const k of rules.keys()) if (!proseRuleKeys.has(k)) fail(`rule_key ${k} absent from metamodel/validation.md`);
if (proseFeKeys) for (const id of feIds) if (!proseFeKeys.has(id)) fail(`FE ${id} absent from metamodel/field-expansion.md`);

// prose → schema (проза впереди схемы = предупреждение о дрейфе, не ошибка)
if (prosePropKeys) for (const k of prosePropKeys) {
  if (k === "property_key" || k === "value_type" || k === "required" || k === "applies_to" || k === "enum_values" || k === "label" || k === "Ключ" || k === "Ключ определения" || k === "Триггер" || k === "Значение") continue;
  if (!allPropKeys.has(k)) warn(`prose properties.md mentions ${k} not in schema`);
}
if (proseRelKeys) for (const k of proseRelKeys) {
  if (k === "relation_key" || k === "source_type" || k === "target_type" || k === "cardinality" || k === "inverse_key" || k === "Ключ") continue;
  if (!rels.has(k)) warn(`prose relations.md mentions ${k} not in schema`);
}

// --- итог ---------------------------------------------------------------------
const summary = `schemaVersion=${m.schemaVersion} · metatypes=${m.metatypes.length} · types=${m.types.length} · props=${m.properties.length + m.universalProperties.length} · relations=${m.relations.length} · FE=${m.fieldExpansion.length} · rules=${m.validationRules.length} · settings=${m.settings.length}`;

if (warnings.length) {
  console.log(`WARNINGS (${warnings.length}):`);
  for (const w of warnings) console.log("  - " + w);
}
if (errors.length) {
  console.error(`\nERRORS (${errors.length}):`);
  for (const e of errors) console.error("  - " + e);
  console.error(`\nschema:check FAILED — ${summary}`);
  process.exit(1);
}
console.log(`schema:check OK — ${summary}`);
