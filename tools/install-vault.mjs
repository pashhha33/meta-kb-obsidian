// install-vault.mjs — доставляет собранный плагин в vault и фиксирует ревизию.
// Запуск:  node tools/install-vault.mjs --vault "D:/путь/к/vault"
// Копирует plugin/{manifest.json,main.js,styles.css} в <vault>/.obsidian/plugins/meta-kb/
// и пишет installed.json рядом с плагином: { version, gitRev, at }.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const args = process.argv.slice(2);
const vaultIdx = args.indexOf("--vault");
if (vaultIdx === -1 || !args[vaultIdx + 1]) {
  console.error("usage: node tools/install-vault.mjs --vault <path-to-vault>");
  process.exit(2);
}
const vault = args[vaultIdx + 1];

const pluginDir = join(root, "plugin");
const dest = join(vault, ".obsidian", "plugins", "meta-kb");
mkdirSync(dest, { recursive: true });

let gitRev = "unknown";
try { gitRev = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch {}

const manifest = JSON.parse(readFileSync(join(pluginDir, "manifest.json"), "utf8"));
const files = ["manifest.json", "main.js", "styles.css"];
for (const f of files) {
  const src = join(pluginDir, f);
  copyFileSync(src, join(dest, f));
}

const installed = {
  version: manifest.version,
  gitRev,
  at: new Date().toISOString(),
};
writeFileSync(join(dest, "installed.json"), JSON.stringify(installed, null, 2) + "\n");

console.log(`installed meta-kb ${installed.version} (${gitRev}) → ${dest}`);
console.log(JSON.stringify(installed, null, 2));
