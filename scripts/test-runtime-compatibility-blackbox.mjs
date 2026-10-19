// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

assert(process.env.TAURI_PILOT_SOCKET, "Select the isolated native window explicitly");
assert(
  process.env.OPENAGENT_HOME,
  "Select the same isolated application home as the native window",
);
assert.notEqual(resolve(process.env.OPENAGENT_HOME), resolve(join(homedir(), ".openagent")));
const expected = process.env.BLACKBOX_EXPECTED_RUNTIME_VERSION;
assert(expected && /^\d+\.\d+\.\d+$/.test(expected), "Set the expected Runtime release version");
const artifacts = mkdtempSync(join(tmpdir(), "openagent-runtime-compatibility-"));
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 40000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
pilot(["ping"]);
const deadline = Date.now() + 60_000;
while (pilot(["eval", "Boolean(document.querySelector('.sidebar-content'))"]) !== "true") {
  assert(Date.now() < deadline, "Native application surface did not become ready");
  await setTimeout(250);
}
pilot(["snapshot", "-i"]);
pilot(["eval", `window.__runtimeCompatibilityExpected = ${JSON.stringify(expected)}`]);
pilot([
  "run",
  fileURLToPath(new URL("../tests/blackbox/runtime-compatibility.toml", import.meta.url)),
]);
pilot(["snapshot", "-i"]);
pilot(["logs", "--level", "error"]);
process.stdout.write(`Runtime compatibility native verification passed. Artifacts: ${artifacts}\n`);
