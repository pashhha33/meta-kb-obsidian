// check-all.mjs — все ворота качества одной командой (G1→G4).
// Останавливается на первом провале. Запуск:  node tools/check-all.mjs
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const pluginDir = join(root, "plugin");

const gates = [
	{ name: "G1 check-state", cmd: "node", args: ["tools/check-state.mjs"], cwd: root },
	{ name: "G2 schema-check", cmd: "node", args: ["tools/schema-check.mjs"], cwd: root },
	{ name: "G3a build", cmd: "npm", args: ["run", "build"], cwd: pluginDir },
	{ name: "G3b test", cmd: "npm", args: ["test"], cwd: pluginDir },
	{ name: "G3c check:bundle", cmd: "npm", args: ["run", "check:bundle"], cwd: pluginDir },
	{ name: "G4 accept", cmd: "node", args: ["tools/accept.mjs"], cwd: root },
];

for (const gate of gates) {
	console.log(`\n===== ${gate.name} =====`);
	try {
		execFileSync(gate.cmd, gate.args, {
			cwd: gate.cwd,
			stdio: "inherit",
			shell: process.platform === "win32",
		});
	} catch {
		console.error(`\nGATE FAILED: ${gate.name}`);
		process.exit(1);
	}
}

console.log("\nAll gates OK");
