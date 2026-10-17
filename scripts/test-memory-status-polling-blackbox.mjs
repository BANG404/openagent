// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

assert(process.env.TAURI_PILOT_SOCKET, "Select an isolated native window explicitly");
resolveBlackboxHome(process.env);
const output = mkdtempSync(join(tmpdir(), "openagent-memory-status-polling-"));
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: output,
    env: process.env,
    windowsHide: true,
    encoding: "utf8",
    timeout: 60000,
  });
  writeFileSync(join(output, `${args[0]}.log`), `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout;
}
console.log(`Memory status polling native artifacts: ${output}`);
const url = new URL(pilot(["url"]).trim());
assert(["localhost", "127.0.0.1"].includes(url.hostname), "Local source frontend required");
pilot(["snapshot", "-i"]);
try {
  pilot([
    "run",
    fileURLToPath(new URL("../tests/blackbox/memory-status-polling.toml", import.meta.url)),
  ]);
} finally {
  pilot([
    "eval",
    "(async () => { await window.__memoryStatusPollingFixture?.cleanup(); return true; })()",
  ]);
}
console.log("Native memory status polling passed");
