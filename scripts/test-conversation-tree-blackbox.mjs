// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

assert(process.env.TAURI_PILOT_SOCKET, "Select the task-owned isolated debug window explicitly");
const artifacts = mkdtempSync(join(tmpdir(), "openagent-conversation-tree-"));
const scenario = fileURLToPath(
  new URL("../tests/blackbox/conversation-tree.toml", import.meta.url),
);
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
const base = new URL(original);
assert(["localhost", "127.0.0.1"].includes(base.hostname), "A local source frontend is required");
try {
  for (const theme of ["light", "dark"]) {
    for (const locale of ["en", "zh"]) {
      const preview = new URL(base.origin);
      preview.search = new URLSearchParams({
        "desktop-shell-preview": "",
        "desktop-shell-preview-theme": theme,
        "desktop-shell-preview-locale": locale,
      }).toString();
      pilot(["navigate", preview.href]);
      pilot(["wait", ".desktop-shell-preview"]);
      pilot(["snapshot", "-i"]);
      pilot(["run", scenario]);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}.png`));
      pilot(["eval", "window.__conversationTreeCleanup().then(() => true)"]);
    }
  }
  pilot(["logs", "--level", "error"]);
} finally {
  pilot(["navigate", original]);
}
process.stdout.write(`Conversation tree black-box passed. Artifacts: ${artifacts}\n`);
