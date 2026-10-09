// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

assert(process.env.TAURI_PILOT_SOCKET, "select the isolated native window explicitly");
const artifacts = mkdtempSync(join(tmpdir(), "openagent-runtime-status-"));
const scenario = fileURLToPath(new URL("../tests/blackbox/runtime-status.toml", import.meta.url));
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", args, {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
const original = pilot(["url"]);
const base = new URL(process.env.BLACKBOX_BASE_URL || original);
assert(["localhost", "127.0.0.1"].includes(base.hostname), "a local debug frontend is required");
try {
  for (const theme of ["light", "dark"]) {
    for (const locale of ["en", "zh"]) {
      const preview = new URL(base.origin);
      preview.searchParams.set("streaming-transcript-preview", "");
      preview.searchParams.set("streaming-transcript-preview-runtime-status", "");
      preview.searchParams.set("streaming-transcript-preview-theme", theme);
      preview.searchParams.set("streaming-transcript-preview-locale", locale);
      pilot(["navigate", preview.href]);
      pilot(["wait", "[data-runtime-phase=initial]"]);
      pilot(["snapshot", "-i"]);
      pilot(["run", scenario]);
      pilot(["click", "[data-runtime-phase=response]"]);
      pilot(["snapshot", "-i"]);
      pilot(["screenshot", join(artifacts, `${theme}-${locale}.png`)]);
    }
  }
  pilot(["logs", "--level", "error"]);
} finally {
  pilot(["navigate", original]);
}
process.stdout.write(`Runtime status black-box verification passed. Artifacts: ${artifacts}\n`);
