// Проверка того, что плагин реально запишет на диск: план bootstrap →
// serializeNote → файл → чтение обратно. Покрывает путь, который в Obsidian
// выполняет vault.create(), вне Obsidian.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planBootstrap } from "../src/core/bootstrap";
import { serializeNote } from "../src/core/yaml";

/** Минимальный разбор frontmatter: скаляры и блочные списки. */
function parseFrontmatter(text: string): Record<string, unknown> {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) {
		return {};
	}
	const out: Record<string, unknown> = {};
	let current: string | null = null;
	const strip = (raw: string): string => {
		const value = raw.trim();
		if (value.startsWith('"') && value.endsWith('"')) {
			return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
		}
		return value;
	};
	for (const line of match[1].split(/\r?\n/)) {
		const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (pair) {
			current = pair[1];
			const value = strip(pair[2]);
			out[current] = value === "" ? [] : value;
			continue;
		}
		const item = line.match(/^\s+-\s+(.*)$/);
		if (item && current) {
			const list = Array.isArray(out[current])
				? (out[current] as unknown[])
				: [];
			list.push(strip(item[1]));
			out[current] = list;
		}
	}
	return out;
}

test("bootstrap: 39 файлов, frontmatter читается обратно без потерь", () => {
	const dir = mkdtempSync(join(tmpdir(), "meta-kb-bootstrap-"));
	try {
		let counter = 0;
		const plans = planBootstrap({
			now: new Date("2026-11-14T10:00:00.000Z"),
			idFactory: () =>
				`01a17d3b-4a30-7000-8000-${String(++counter).padStart(12, "0")}`,
		});
		for (const plan of plans) {
			writeFileSync(join(dir, plan.filename), serializeNote(plan.frontmatter), "utf8");
		}

		const files = readdirSync(dir);
		assert.equal(files.length, 39);
		assert.equal(new Set(files).size, 39); // имена уникальны

		for (const name of files) {
			assert.ok(name.startsWith("type_"), `имя файла: ${name}`);
			assert.ok(name.endsWith(".md"), `имя файла: ${name}`);

			const fm = parseFrontmatter(readFileSync(join(dir, name), "utf8"));
			assert.equal(typeof fm.id, "string", `${name}: нет id`);
			assert.equal(fm.type, "type", `${name}: type`);
			assert.equal(fm.status, "accepted", `${name}: status`);
			assert.equal(fm.layer, "system", `${name}: layer`);
			assert.equal(typeof fm.type_value, "string", `${name}: type_value`);
			assert.equal(fm.title, fm.type_value, `${name}: title = type_value`);
			assert.ok(Array.isArray(fm.aliases), `${name}: aliases не список`);
			const aliases = fm.aliases as string[];
			assert.equal(aliases.length, 2, `${name}: aliases`);
			assert.equal(aliases[0], fm.title, `${name}: aliases[0] = title (INV-08)`);
			assert.equal(typeof fm.defined_by, "string", `${name}: defined_by`);
			assert.equal(fm.created_at, "2026-11-14T10:00:00.000Z", `${name}: created_at`);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("serializeNote: кириллица и двоеточие в названии переживают round-trip", () => {
	const dir = mkdtempSync(join(tmpdir(), "meta-kb-yaml-"));
	try {
		const title = 'Мастер и Маргарита: "роман"';
		const path = join(dir, "x.md");
		writeFileSync(path, serializeNote({ title, aliases: [title] }), "utf8");
		const fm = parseFrontmatter(readFileSync(path, "utf8"));
		assert.equal(fm.title, title);
		assert.deepEqual(fm.aliases, [title]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
