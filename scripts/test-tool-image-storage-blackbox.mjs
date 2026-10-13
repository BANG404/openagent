// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureBlackboxScreenshot } from "./blackbox-screenshot.mjs";

assert(process.env.TAURI_PILOT_SOCKET, "select the isolated native window explicitly");
assert(process.env.OPENAGENT_HOME?.includes("trace-export-storage"), "use a storage fixture home");
const artifacts = mkdtempSync(join(tmpdir(), "openagent-image-storage-blackbox-"));
const scenario = fileURLToPath(
  new URL("../tests/blackbox/tool-image-storage.toml", import.meta.url),
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
/** @param {string} script */
function evaluate(script) {
  return pilot(["eval", script]);
}
/** @param {string} condition */
async function waitFor(condition) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (evaluate(condition) === "true") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Native image assertion timed out: ${condition}`);
}
const original = pilot(["url"]);
const base = new URL(process.env.BLACKBOX_BASE_URL || original);
assert(["localhost", "127.0.0.1"].includes(base.hostname));
const rectangle =
  "JSON.stringify((()=>{const r=document.querySelector('.tool-image').getBoundingClientRect();return [r.width,r.height]})())";
try {
  for (const theme of ["light", "dark"]) {
    for (const locale of ["en", "zh"]) {
      const preview = new URL(base.origin);
      preview.searchParams.set("streaming-transcript-preview", "");
      preview.searchParams.set("streaming-transcript-preview-image-storage", "");
      preview.searchParams.set("streaming-transcript-preview-theme", theme);
      preview.searchParams.set("streaming-transcript-preview-locale", locale);
      pilot(["navigate", preview.href]);
      pilot(["wait", ".image-storage-preview[data-ready=true]"]);
      pilot(["snapshot", "-i"]);
      assert.equal(evaluate("document.querySelector('.image-storage-preview').dataset.reads"), "0");
      const blob = pilot(["text", "[data-image-blob]"]);
      assert.match(blob, /^sha256:[a-f0-9]{64}$/);
      evaluate("document.querySelector('[data-image-fixture]').scrollIntoView(); true");
      await waitFor("document.querySelector('.image-storage-preview').dataset.reads==='1'");
      assert.equal(
        evaluate("document.querySelector('.tool-image').getAttribute('aria-busy')"),
        "true",
      );
      const loadingRectangle = evaluate(rectangle);
      await waitFor("!!document.querySelector('.tool-image img')?.naturalWidth");
      assert.equal(evaluate(rectangle), loadingRectangle);
      pilot(["snapshot", "-i"]);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}-loaded.png`));
      pilot(["run", scenario]);
      assert.equal(pilot(["text", "[data-image-blob]"]), blob);
      assert.equal(evaluate(rectangle), loadingRectangle);
      pilot(["snapshot", "-i"]);
      const expected =
        locale === "en" ? "No preview is available for this attachment" : "此附件暂无可用预览";
      assert(pilot(["text", ".tool-image [role=status]"]).includes(expected));
      pilot(["snapshot", "-i"]);
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}-unavailable.png`));
      pilot(["snapshot", "-i"]);
      pilot(["click", "[data-missing-image]"]);
      pilot(["snapshot", "-i"]);
      pilot(["click", "[data-duplicate-image]"]);
      evaluate("document.querySelector('[data-image-fixture]').scrollIntoView(); true");
      await waitFor(
        "document.querySelectorAll('.tool-image img').length===2 && [...document.querySelectorAll('.tool-image img')].every(image=>image.naturalWidth>0)",
      );
      captureBlackboxScreenshot(pilot, join(artifacts, `${theme}-${locale}-repeated.png`));
    }
  }
  pilot(["logs", "--level", "error"]);
} finally {
  pilot(["navigate", original]);
}
process.stdout.write(`Native tool image storage passed. Artifacts: ${artifacts}\n`);
