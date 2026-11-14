// install-vault.mjs — доставляет собранный плагин в vault и фиксирует ревизию.
// Запуск:  node tools/install-vault.mjs --vault "D:/путь/к/vault"
//
// Копирует plugin/{manifest.json,main.js,styles.css} в
// <vault>/.obsidian/plugins/<папка-плагина>/ и пишет installed.json:
// { version, gitRev, at }.
//
// Папка выбирается так: если в vault уже есть плагин с id из manifest.json —
// используется его папка (у старых установок имя папки может не совпадать с id),
// иначе берётся manifest.id.
import {
	readFileSync,
	writeFileSync,
	copyFileSync,
	mkdirSync,
	existsSync,
	readdirSync,
} from "node:fs";
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
const manifest = JSON.parse(readFileSync(join(pluginDir, "manifest.json"), "utf8"));
const pluginsRoot = join(vault, ".obsidian", "plugins");

// Ищем уже установленную папку этого плагина (по manifest.id внутри).
let folder = manifest.id;
if (existsSync(pluginsRoot)) {
	for (const name of readdirSync(pluginsRoot)) {
		const candidate = join(pluginsRoot, name, "manifest.json");
		if (!existsSync(candidate)) continue;
		try {
			const m = JSON.parse(readFileSync(candidate, "utf8"));
			if (m.id === manifest.id) {
				folder = name;
				break;
			}
		} catch {
			/* повреждённый manifest чужого плагина — пропускаем */
		}
	}
}

const dest = join(pluginsRoot, folder);
mkdirSync(dest, { recursive: true });

let gitRev = "unknown";
try {
	gitRev = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
		encoding: "utf8",
	}).trim();
} catch {
	/* git может быть недоступен — не критично */
}

for (const f of ["manifest.json", "main.js", "styles.css"]) {
	copyFileSync(join(pluginDir, f), join(dest, f));
}

const installed = {
	version: manifest.version,
	gitRev,
	at: new Date().toISOString(),
};
writeFileSync(join(dest, "installed.json"), JSON.stringify(installed, null, 2) + "\n");

console.log(`installed ${manifest.id} ${installed.version} (${gitRev}) → ${dest}`);
console.log(JSON.stringify(installed, null, 2));
