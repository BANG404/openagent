// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

assert(process.env.TAURI_PILOT_SOCKET, "select the isolated replay window explicitly");
assert(
  process.env.OPENAGENT_HOME?.includes("fault-replay"),
  "use an isolated fault-replay fixture",
);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-fault-replay-"));
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
const original = pilot(["url"]);
const base = new URL(original);
assert(["localhost", "127.0.0.1"].includes(base.hostname));
try {
  for (const theme of ["light", "dark"]) {
    for (const locale of ["en", "zh"]) {
      const preview = new URL(base.origin);
      preview.searchParams.set("streaming-transcript-preview", "");
      preview.searchParams.set("streaming-transcript-preview-replay", "");
      preview.searchParams.set("streaming-transcript-preview-theme", theme);
      preview.searchParams.set("streaming-transcript-preview-locale", locale);
      pilot(["navigate", preview.href]);
      pilot(["wait", "[data-replay-case=hydration-race]"]);
      pilot(["snapshot", "-i"]);
      pilot([
        "run",
        fileURLToPath(new URL("../tests/blackbox/fault-replay.toml", import.meta.url)),
      ]);
    }
  }
  pilot(["logs", "--level", "error"]);
} finally {
  pilot(["navigate", original]);
}
process.stdout.write("Fault replay native scenarios passed in light/dark and en/zh.\n");
