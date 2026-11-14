// Регрессия на реальный баг: кастомные элементы плагина, сделанные через
// <button>, наследуют глобальные стили Obsidian:
//   button { height: var(--input-height); white-space: nowrap }
//   button:not(.clickable-icon) { background-color: …; box-shadow: … }
// Из-за фиксированной высоты ~30px миниатюра галереи обрезалась узкой полосой,
// а `flex: none` на галерее этого не лечил — высота приходила не от flex.
//
// Тест читает plugin/styles.css и plugin/src и требует, чтобы каждая кастомная
// кнопка переопределяла высоту и фон, причём селектором специфичнее (0,1,1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Бандл тестов лежит в plugin/tests/.tmp/bundle.mjs.
const PLUGIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC_DIR = join(PLUGIN_DIR, "src");
// Комментарии вырезаем: они содержат слова вроде `flex:none` и ломают разбор.
const css = readFileSync(join(PLUGIN_DIR, "styles.css"), "utf8").replace(
	/\/\*[\s\S]*?\*\//g,
	"",
);

const escapeRe = (text: string): string =>
	text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Rule {
	selector: string;
	declarations: string;
}

/** Все правила styles.css в порядке появления. */
const RULES: Rule[] = (() => {
	const out: Rule[] = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(css)) !== null) {
		out.push({
			selector: match[1].replace(/\s+/g, " ").trim(),
			declarations: match[2].replace(/\s+/g, " ").trim(),
		});
	}
	return out;
})();

/** Объявления правила по точному селектору ('' — правила нет). */
function block(selector: string): string {
	const found = RULES.find((rule) => rule.selector === selector);
	return found ? found.declarations : "";
}

/** Значение свойства в блоке объявлений ('' — свойства нет). */
function value(declarations: string, prop: string): string {
	const match = new RegExp(
		`(?:^|;)\\s*${escapeRe(prop)}\\s*:\\s*([^;]*)`,
	).exec(declarations);
	return match ? match[1].trim() : "";
}

/** Правила, которые применяются к самому классу в спокойном состоянии. */
function stateRules(cls: string): Rule[] {
	const incls = new RegExp(`\\.${escapeRe(cls)}(\\.[\\w-]+)*$`);
	return RULES.filter(
		(rule) => incls.test(rule.selector) && !rule.selector.includes(":"),
	);
}

/** Все классы, которые плагин вешает на <button>. */
function buttonClasses(): string[] {
	const classes = new Set<string>();
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			const path = join(dir, entry);
			if (statSync(path).isDirectory()) {
				walk(path);
				continue;
			}
			if (!path.endsWith(".ts")) {
				continue;
			}
			const text = readFileSync(path, "utf8");
			const re = /createEl\(\s*"button"\s*,\s*\{[^}]*?cls:\s*"([^"$]+)"/g;
			let match: RegExpExecArray | null;
			while ((match = re.exec(text)) !== null) {
				// Свои классы: классы Obsidian (mod-cta и т.п.) не наша забота.
				if (match[1].startsWith("meta-kb-")) {
					classes.add(match[1]);
				}
			}
		}
	};
	walk(SRC_DIR);
	return [...classes].sort();
}

test("styles.css: галерея не сжимается flex-колонкой модалки", () => {
	const gallery = block(".meta-kb-gallery");
	assert.ok(gallery, "нет правила .meta-kb-gallery");
	assert.equal(value(gallery, "flex"), "none", "галерее нужен flex: none");
	assert.equal(
		value(gallery, "grid-auto-rows"),
		"min-content",
		"строки галереи не должны растягиваться",
	);
});

test("styles.css: миниатюра переопределяет умолчания кнопки Obsidian", () => {
	// Селектор со специфичностью (0,2,0) — выше `button:not(.clickable-icon)`
	// (0,1,1), иначе фон и тень кнопки возвращаются.
	const thumb = block(".meta-kb-gallery .meta-kb-thumb");
	assert.ok(thumb, "нет правила .meta-kb-gallery .meta-kb-thumb");
	assert.equal(
		value(thumb, "height"),
		"auto",
		"button { height: var(--input-height) } обрежет миниатюру полосой",
	);
	assert.equal(
		value(thumb, "white-space"),
		"normal",
		"button { white-space: nowrap } не даст перенести имя файла",
	);
	assert.ok(
		value(thumb, "background-color") !== "",
		"background: шорткат недостаточен — нужен background-color",
	);
	assert.equal(
		value(thumb, "box-shadow"),
		"none",
		"button:not(.clickable-icon) навязывает box-shadow",
	);
	assert.equal(
		value(thumb, "overflow"),
		"hidden",
		"нужно для скругления углов миниатюры",
	);
});

test("styles.css: картинка миниатюры квадратная по умолчанию", () => {
	const img = block(".meta-kb-gallery .meta-kb-thumb img");
	assert.ok(img, "нет правила для img миниатюры");
	assert.ok(
		value(img, "aspect-ratio") !== "",
		"нужен aspect-ratio из настроек плагина",
	);
	assert.equal(value(img, "object-fit"), "cover", "нужен object-fit: cover");
});

test("styles.css: каждая кастомная кнопка переопределяет height и background-color", () => {
	const classes = buttonClasses();
	// Если список опустеет, тест перестанет что-либо проверять.
	assert.ok(classes.length >= 3, `найдено классов-кнопок: ${classes.length}`);
	for (const cls of classes) {
		const rules = stateRules(cls);
		assert.ok(rules.length > 0, `нет правил для кнопки .${cls}`);
		const declarations = rules
			.map((rule) => rule.declarations)
			.join("; ");
		assert.ok(
			value(declarations, "height") !== "",
			`.${cls}: без height кнопка получит высоту var(--input-height)`,
		);
		assert.ok(
			value(declarations, "background-color") !== "",
			`.${cls}: нужен background-color — шорткат background проигрывает button:not(.clickable-icon)`,
		);
		// Класс должен встречаться в селекторе вместе с контейнером —
		// специфичность выше, чем у button:not(.clickable-icon) (0,1,1).
		const bumped = rules.some((rule) => {
			const selector = rule.selector.trim();
			return (
				selector.endsWith(`.${cls}`) &&
				selector !== `.${cls}` &&
				selector !== `button.${cls}`
			);
		});
		assert.ok(
			bumped,
			`.${cls}: селектор должен быть специфичнее одиночного класса`,
		);
	}
});