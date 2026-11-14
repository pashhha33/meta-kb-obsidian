// check-version.mjs — ворота G2b: версия плагина одна и валидна.
//
// Версия застревала на 0.1.0, потому что её правили «когда вспомнят»: манифест
// расходился с package.json, а установка в хранилище приносила старый номер.
// Эти ворота делают рассинхрон невозможным.
//
// Запуск:  node tools/check-version.mjs
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const pluginDir = join(root, "plugin");

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function readJson(path) {
	if (!existsSync(path)) {
		return null;
	}
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (err) {
		console.error(`check:version FAILED — ${path}: некорректный JSON (${err.message})`);
		process.exit(1);
	}
}

const errors = [];

const manifest = readJson(join(pluginDir, "manifest.json"));
const pkg = readJson(join(pluginDir, "package.json"));

if (!manifest) {
	errors.push("plugin/manifest.json отсутствует или не читается");
}
if (!pkg) {
	errors.push("plugin/package.json отсутствует или не читается");
}

if (manifest) {
	for (const key of ["id", "name", "version", "minAppVersion"]) {
		if (!manifest[key]) {
			errors.push(`manifest.json: не заполнено поле «${key}»`);
		}
	}
	if (manifest.id && manifest.id !== "meta-kb") {
		errors.push(`manifest.json: id «${manifest.id}», ожидается «meta-kb»`);
	}
	if (manifest.version && !SEMVER.test(manifest.version)) {
		errors.push(
			`manifest.json: версия «${manifest.version}» не в формате MAJOR.MINOR.PATCH`,
		);
	}
}

if (pkg) {
	if (!SEMVER.test(String(pkg.version ?? ""))) {
		errors.push(
			`package.json: версия «${pkg.version}» не в формате MAJOR.MINOR.PATCH`,
		);
	}
	if (manifest && pkg.version !== manifest.version) {
		errors.push(
			`версии расходятся: manifest.json ${manifest.version} ≠ package.json ${pkg.version}`,
		);
	}
}

// package-lock дублирует корневую версию: половина бампа — тоже дрейф.
const lock = readJson(join(pluginDir, "package-lock.json"));
if (lock && manifest) {
	const lockVersion = lock.packages?.[""]?.version ?? lock.version;
	if (lockVersion && lockVersion !== manifest.version) {
		errors.push(
			`package-lock.json: версия ${lockVersion} ≠ manifest.json ${manifest.version}`,
		);
	}
}

if (errors.length > 0) {
	console.error("check:version FAILED:");
	for (const error of errors) {
		console.error(`  - ${error}`);
	}
	process.exit(1);
}

console.log(
	`check:version OK — ${manifest.id} ${manifest.version} (minAppVersion ${manifest.minAppVersion})`,
);