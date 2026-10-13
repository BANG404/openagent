// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

assert(process.env.TAURI_PILOT_SOCKET, "select the isolated native window explicitly");
const artifacts = mkdtempSync(join(tmpdir(), "openagent-turn-footer-"));
const scenario = fileURLToPath(new URL("../tests/blackbox/turn-footer.toml", import.meta.url));
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
pilot(["ping"]);
pilot(["snapshot", "-i"]);
const original = pilot(["url"]);
const base = new URL(process.env.BLACKBOX_BASE_URL || original);
assert.equal(
  base.origin,
  new URL(original).origin,
  "use the frontend origin admitted by this host",
);
try {
  for (const theme of ["light", "dark"]) {
    for (const locale of ["en", "zh"]) {
      const preview = new URL(base.origin);
      preview.searchParams.set("cache-usage-preview", "");
      preview.searchParams.set("cache-usage-preview-theme", theme);
      preview.searchParams.set("cache-usage-preview-locale", locale);
      pilot(["navigate", preview.href]);
      pilot(["wait", "[data-footer-reload]"]);
      pilot(["snapshot", "-i"]);
      pilot(["run", scenario]);
      pilot(["snapshot", "-i"]);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}.png`));
    }
  }
  pilot(["logs", "--level", "error"]);
} finally {
  pilot(["navigate", original]);
}
process.stdout.write(`Turn footer black-box passed. Artifacts: ${artifacts}\n`);
