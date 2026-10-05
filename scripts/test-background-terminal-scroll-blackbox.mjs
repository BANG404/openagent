// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const isolatedHome = resolveBlackboxHome(process.env, {
  instanceName: "background-terminal-scroll",
});
assert.notEqual(
  resolve(isolatedHome),
  resolve(join(homedir(), ".openagent")),
  "refusing to verify against installed release data",
);
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR ||
  mkdtempSync(join(tmpdir(), "openagent-background-terminal-scroll-"));
mkdirSync(artifacts, { recursive: true });

/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync(process.env.TAURI_PILOT_BIN || "tauri-pilot", args, {
    cwd: artifacts,
    env: {
      ...process.env,
      OPENAGENT_HOME: isolatedHome,
      TAURI_PILOT_WINDOW: "main",
    },
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}

pilot(["ping"]);
pilot(["snapshot", "-i"]);
pilot([
  "eval",
  `(() => { const url = new URL(location.href); url.searchParams.set("background-terminals-preview", ""); location.href = url.href; return true; })()`,
]);
const deadline = Date.now() + 30000;
let mounted = false;
while (Date.now() < deadline) {
  if (
    pilot([
      "eval",
      `Boolean(document.querySelector('#background-terminal-panel .terminal-output-scroll .ui-scroll-area-viewport'))`,
    ]) === "true"
  ) {
    mounted = true;
    break;
  }
  await new Promise((done) => setTimeout(done, 200));
}
assert(mounted, "the background terminal preview did not mount");
pilot(["run", join(repo, "tests/blackbox/background-terminal-scroll.toml")]);
pilot(["logs", "--level", "error"]);
process.stdout.write(`Background terminal scroll verification passed. Artifacts: ${artifacts}\n`);
