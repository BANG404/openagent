// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const isolatedHome = resolveBlackboxHome(process.env, { instanceName: "file-diff" });
const artifacts = mkdtempSync(join(tmpdir(), "openagent-file-projection-"));

/** @param {string} command @param {string[]} args */
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: artifacts,
    env: { ...process.env, OPENAGENT_HOME: isolatedHome, TAURI_PILOT_WINDOW: "main" },
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
/** @param {string[]} args */
const pilot = (args) => run(process.env.TAURI_PILOT_BIN || "tauri-pilot", args);
/** @param {string} action */
const fixture = (action) =>
  run("python", [
    join(repo, "sdk/scripts/file-projection-blackbox-fixture.py"),
    "--home",
    isolatedHome,
    "--action",
    action,
  ]);
/** @param {string} expression */
async function waitFor(expression) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (
      pilot([
        "eval",
        `document.documentElement.dataset.fileProjectionReload !== "pending" && (${expression})`,
      ]) === "true"
    )
      return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Timed out: ${expression}`);
}

pilot(["ping"]);
const url = new URL(pilot(["url"]));
assert(!url.search, "Run against the ordinary desktop conversation surface");
fixture("seed");
pilot(["snapshot", "-i"]);
pilot([
  "eval",
  "document.documentElement.dataset.fileProjectionReload = 'pending'; setTimeout(() => location.reload(), 100); true",
]);
await waitFor(
  "[...document.querySelectorAll('.conv-item')].some(item => item.textContent.includes('File projection regression'))",
);
pilot(["snapshot", "-i"]);
pilot([
  "eval",
  "[...document.querySelectorAll('.conv-item')].find(item => item.textContent.includes('File projection regression')).click(); true",
]);
await waitFor(
  "document.querySelectorAll('.file-row').length === 1 && document.querySelectorAll('.file-panel .diff-row.full-file').length === 4",
);
pilot(["snapshot", "-i"]);
pilot(["run", join(repo, "tests/blackbox/file-projection.toml")]);
pilot(["screenshot", join(artifacts, "complete-recorded-file.png")]);
pilot([
  "eval",
  "document.documentElement.dataset.fileProjectionReload = 'pending'; setTimeout(() => location.reload(), 100); true",
]);
await waitFor("document.querySelectorAll('.file-panel .diff-row.full-file').length === 4");
pilot(["snapshot", "-i"]);
fixture("drift");
pilot(["snapshot", "-i"]);
pilot(["click", ".file-panel .revert-button"]);
await waitFor(
  "document.querySelector('.file-panel [role=alert]')?.textContent.includes('outside this branch') === true",
);
fixture("restore");
pilot(["snapshot", "-i"]);
pilot(["click", ".file-panel .revert-button"]);
await waitFor("document.querySelectorAll('.file-row').length === 0");
fixture("verify");
pilot(["logs", "--level", "error"]);
process.stdout.write(`Persistent file projection verification passed. Artifacts: ${artifacts}\n`);
