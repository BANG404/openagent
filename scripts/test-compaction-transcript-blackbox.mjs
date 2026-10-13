// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

assert(process.env.TAURI_PILOT_SOCKET, "select the isolated native window explicitly");
const artifacts = mkdtempSync(join(tmpdir(), "openagent-compaction-transcript-"));
const scenario = fileURLToPath(
  new URL("../tests/blackbox/compaction-transcript.toml", import.meta.url),
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
const base = new URL(process.env.BLACKBOX_BASE_URL || original);
assert(["localhost", "127.0.0.1"].includes(base.hostname), "a local debug frontend is required");
try {
  for (const theme of ["light", "dark"]) {
    for (const locale of ["en", "zh"]) {
      pilot(["eval", "sessionStorage.removeItem('openagent-compaction-transcript-preview');true"]);
      const preview = new URL(base.origin);
      preview.search = new URLSearchParams({
        "streaming-transcript-preview": "",
        "streaming-transcript-preview-compaction": "",
        "streaming-transcript-preview-theme": theme,
        "streaming-transcript-preview-locale": locale,
      }).toString();
      pilot(["navigate", preview.href]);
      pilot(["wait", "[data-compaction-action=compact]"]);
      pilot(["snapshot", "-i"]);
      pilot(["run", scenario]);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}.png`));
      pilot(["eval", "setTimeout(() => location.reload(), 100);true"]);
      await new Promise((resolve) => setTimeout(resolve, 500));
      pilot(["wait", "[data-compaction-action=finish][disabled]"]);
      pilot(["snapshot", "-i"]);
      pilot([
        "eval",
        `(() => {
        const group = document.querySelector('.process-records[data-grouped=true]');
        if (!group) throw new Error('restored trajectory missing');
        group.querySelector('button').click();
        return true;
      })()`,
      ]);
      pilot(["assert", "contains", ".compaction-transcript-preview", "Before compaction trace"]);
      pilot([
        "assert",
        "contains",
        ".compaction-transcript-preview",
        "After compaction continuation",
      ]);
      pilot([
        "eval",
        `(() => {
        if (document.querySelectorAll('.tool-call-card').length !== 1) throw new Error('restored tool count changed');
        if (document.body.innerText.includes('PRIVATE_PROVIDER_REPLAY')) throw new Error('restored provider replay leaked');
        return true;
      })()`,
      ]);
    }
  }
  pilot(["logs", "--level", "error"]);
} finally {
  pilot(["eval", "sessionStorage.removeItem('openagent-compaction-transcript-preview');true"]);
  pilot(["navigate", original]);
}
process.stdout.write(
  `Compaction transcript black-box verification passed. Artifacts: ${artifacts}\n`,
);
