// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

const artifacts = mkdtempSync(join(tmpdir(), "openagent-scroll-to-bottom-"));
const scenario = fileURLToPath(new URL("../tests/blackbox/scroll-to-bottom.toml", import.meta.url));

/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync(process.env.TAURI_PILOT_BIN || "tauri-pilot", args, {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}

assert(process.env.TAURI_PILOT_SOCKET, "Select the isolated debug instance explicitly");
pilot(["ping"]);
pilot(["snapshot", "-i"]);
const originalUrl = pilot(["url"]);
const base = new URL(process.env.BLACKBOX_BASE_URL || originalUrl);
assert(["localhost", "127.0.0.1"].includes(base.hostname), "A local source frontend is required");
assert.equal(
  base.origin,
  new URL(originalUrl).origin,
  "Use the Vite origin admitted by this debug host",
);
try {
  for (const theme of ["light", "dark"]) {
    for (const locale of ["en", "zh"]) {
      const preview = new URL(base.origin);
      preview.searchParams.set("follow-up-suggestions-preview", "");
      preview.searchParams.set("follow-up-suggestions-preview-theme", theme);
      preview.searchParams.set("follow-up-suggestions-preview-locale", locale);
      pilot(["navigate", preview.href]);
      pilot(["wait", ".follow-up-suggestions-preview-stage"]);
      pilot(["snapshot", "-i"]);
      pilot(["run", scenario]);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}.png`));
      pilot([
        "eval",
        "window.__scrollToBottomCleanup().then(() => {delete window.__scrollToBottomCleanup; return true;})",
      ]);
    }
  }
  pilot(["logs", "--level", "error"]);
} finally {
  pilot(["navigate", originalUrl]);
}
process.stdout.write(`Scroll to bottom black-box passed. Artifacts: ${artifacts}\n`);
