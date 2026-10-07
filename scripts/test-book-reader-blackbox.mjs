// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

assert(process.env.TAURI_PILOT_SOCKET, "select the isolated native window explicitly");
const artifacts = mkdtempSync(join(tmpdir(), "openagent-book-reader-"));
const scenario = fileURLToPath(new URL("../tests/blackbox/book-reader.toml", import.meta.url));
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
      const quote = new URL(base.origin);
      quote.searchParams.set("quote-context-preview", "");
      quote.searchParams.set("quote-context-preview-theme", theme);
      quote.searchParams.set("quote-context-preview-locale", locale);
      pilot(["navigate", quote.href]);
      const button =
        '.msg-action-btn[aria-label="Read in book mode"], .msg-action-btn[aria-label="以书籍模式阅读"]';
      pilot(["wait", button]);
      pilot(["snapshot", "-i"]);
      const before = pilot([
        "eval",
        "document.querySelector('.quote-context-preview-messages').textContent",
      ]);
      for (let attempt = 0; attempt < 2; attempt++) {
        pilot(["click", button]);
        pilot(["wait", ".agent-book-dialog .agent-book-page"]);
        pilot(["snapshot", "-i"]);
        pilot([
          "eval",
          "if(!document.querySelector('.agent-book-page .assistant-msg'))throw new Error('transcript content missing');true",
        ]);
        pilot(["click", ".book-close"]);
        pilot([
          "eval",
          "if(document.querySelector('.agent-book-dialog'))throw new Error('reader did not close');true",
        ]);
        assert.equal(
          pilot(["eval", "document.querySelector('.quote-context-preview-messages').textContent"]),
          before,
          "opening the reader changed the transcript",
        );
        pilot(["snapshot", "-i"]);
      }
      const preview = new URL(base.origin);
      preview.searchParams.set("book-mode-preview", "");
      preview.searchParams.set("book-mode-preview-theme", theme);
      preview.searchParams.set("book-mode-preview-locale", locale);
      pilot(["navigate", preview.href]);
      pilot(["wait", ".agent-book-dialog .agent-book-page"]);
      pilot(["snapshot", "-i"]);
      pilot(["run", scenario]);
      pilot(["screenshot", join(artifacts, `${theme}-${locale}.png`)]);
      pilot(["click", ".book-close"]);
    }
  }
  pilot(["logs", "--level", "error"]);
} finally {
  pilot(["navigate", original]);
}
process.stdout.write(`Book reader black-box verification passed. Artifacts: ${artifacts}\n`);
