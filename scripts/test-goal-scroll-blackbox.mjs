// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

assert(process.env.TAURI_PILOT_SOCKET, "Select the isolated debug instance explicitly");
const artifacts = mkdtempSync(join(tmpdir(), "openagent-goal-scroll-"));
const scenario = fileURLToPath(new URL("../tests/blackbox/goal-scroll.toml", import.meta.url));

/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync(process.env.TAURI_PILOT_BIN || "tauri-pilot", args, {
    cwd: artifacts,
    env: { ...process.env, TAURI_PILOT_WINDOW: "main" },
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}

pilot(["ping"]);
pilot(["snapshot", "-i"]);
const originalUrl = pilot(["url"]);
try {
  for (const theme of ["light", "dark"]) {
    for (const locale of ["en", "zh"]) {
      for (const content of ["long", "short", "empty"]) {
        const url = new URL(originalUrl);
        url.search = new URLSearchParams({
          "checkpoint-flow-preview": "",
          "checkpoint-flow-preview-theme": theme,
          "checkpoint-flow-preview-locale": locale,
          ...(content === "short" ? {} : { [`checkpoint-flow-preview-${content}`]: "" }),
        }).toString();
        pilot(["navigate", url.href]);
        pilot(["wait", ".checkpoint-flow-toggle"]);
        pilot(["snapshot", "-i"]);
        pilot(["click", ".checkpoint-flow-toggle"]);
        pilot(["wait", ".flow-body-scroll .ui-scroll-area-viewport"]);
        pilot(["snapshot", "-i"]);
        pilot(["run", scenario]);
        captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}-${content}.png`));
        if (content === "long") {
          pilot(["navigate", url.href]);
          pilot(["wait", ".checkpoint-flow-toggle"]);
          pilot(["snapshot", "-i"]);
          pilot(["click", ".checkpoint-flow-toggle"]);
          pilot(["wait", ".flow-body-scroll .ui-scroll-area-viewport"]);
          pilot(["snapshot", "-i"]);
          pilot(["run", scenario]);
        }
      }
    }
  }
  const logs = pilot(["logs", "--level", "error"]);
  assert(!/TypeError|effect_update_depth_exceeded|Unhandled/i.test(logs), logs);
} finally {
  pilot(["navigate", originalUrl]);
}
process.stdout.write(`Goal scrolling black-box passed. Artifacts: ${artifacts}\n`);
