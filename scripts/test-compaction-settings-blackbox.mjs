// @ts-check
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const isolatedHome = resolveBlackboxHome(process.env);
if (resolve(isolatedHome) === resolve(join(homedir(), ".openagent"))) {
  throw new Error("Refusing to verify compaction settings against installed release data");
}
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR ||
  mkdtempSync(join(tmpdir(), "openagent-compaction-settings-"));
mkdirSync(artifacts, { recursive: true });

/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync(process.env.TAURI_PILOT_BIN || "tauri-pilot", args, {
    cwd: artifacts,
    env: { ...process.env, OPENAGENT_HOME: isolatedHome, TAURI_PILOT_WINDOW: "main" },
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`tauri-pilot ${args[0]} failed`);
}

pilot(["ping"]);
pilot(["snapshot", "-i"]);
pilot(["run", join(root, "tests/blackbox/compaction-settings.toml")]);
pilot(["logs", "--level", "error"]);
process.stdout.write(
  `Compaction settings black-box verification passed. Artifacts: ${artifacts}\n`,
);
