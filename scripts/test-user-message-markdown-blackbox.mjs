// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

const artifacts = mkdtempSync(join(tmpdir(), "openagent-user-message-markdown-"));
const scenario = fileURLToPath(
  new URL("../tests/blackbox/user-message-markdown.toml", import.meta.url),
);
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
pilot(["ping"]);
pilot(["snapshot", "-i"]);
const originalUrl = pilot(["url"]);
const base = new URL(process.env.BLACKBOX_BASE_URL || originalUrl);
assert(["localhost", "127.0.0.1"].includes(base.hostname), "a local debug frontend is required");
try {
  for (const theme of ["light", "dark"]) {
    for (const locale of ["en", "zh"]) {
      const preview = new URL(base.origin);
      preview.search = new URLSearchParams({
        "user-message-markdown-preview": "",
        "user-message-markdown-preview-theme": theme,
        "user-message-markdown-preview-locale": locale,
      }).toString();
      pilot(["snapshot", "-i"]);
      pilot(["navigate", preview.href]);
      pilot(["wait", ".user-markdown-preview [contenteditable=true]"]);
      pilot(["snapshot", "-i"]);
      // A background WebView updates activeElement without dispatching focus
      // events. Bring the native window forward before testing focus transfers.
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}-before.png`));
      pilot(["run", scenario]);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}.png`));
      pilot(["eval", "setTimeout(() => location.reload(), 100); true"]);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      pilot(["wait", ".user-markdown-preview [contenteditable=true]"]);
      pilot(["snapshot", "-i"]);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}-reload.png`));
      pilot(["run", scenario]);
    }
  }
  pilot(["logs", "--level", "error"]);
} finally {
  pilot(["navigate", originalUrl]);
}
process.stdout.write(
  `User message Markdown black-box verification passed. Artifacts: ${artifacts}\n`,
);
