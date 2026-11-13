// esbuild.test.config.mjs — сборка тестов в один ESM-бандл для node --test.
// Без внешних тест-раннеров: используем встроенный node:test (Node 18+).
import esbuild from "esbuild";

await esbuild.build({
	entryPoints: ["tests/run.ts"],
	bundle: true,
	platform: "node",
	format: "esm",
	outfile: "tests/.tmp/bundle.mjs",
	external: ["node:test", "node:assert", "node:assert/strict"],
	target: "node18",
	sourcemap: "inline",
	logLevel: "info",
});
