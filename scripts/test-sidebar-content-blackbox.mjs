// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";

const files = process.argv.includes("--files");
const moduleName = files ? "file-diff" : "background-terminal-scroll";
const prefix = files ? "checkpoint-flow-preview" : "background-terminals-preview";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const isolatedHome = resolveBlackboxHome(process.env, {
  instanceName: moduleName,
});
assert.notEqual(
  resolve(isolatedHome),
  resolve(join(homedir(), ".openagent")),
  "refusing to verify against installed release data",
);
const artifacts =
  process.env.BLACKBOX_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), `openagent-${moduleName}-`));
mkdirSync(artifacts, { recursive: true });

/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync(process.env.TAURI_PILOT_BIN || "tauri-pilot", args, {
    cwd: artifacts,
    env: {
      ...process.env,
      OPENAGENT_HOME: isolatedHome,
      TAURI_PILOT_WINDOW: "main",
    },
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}

pilot(["ping"]);
const originalUrl = pilot(["url"]);
try {
  for (const locale of ["en", "zh"]) {
    for (const theme of ["light", "dark"]) {
      const url = new URL(originalUrl);
      url.search = new URLSearchParams({
        [prefix]: "",
        [`${prefix}-theme`]: theme,
        [`${prefix}-locale`]: locale,
        ...(files
          ? { "checkpoint-flow-preview-files-only": "", "checkpoint-flow-preview-code": "" }
          : {}),
      }).toString();
      pilot(["snapshot", "-i"]);
      pilot(["navigate", url.href]);
      const deadline = Date.now() + 30000;
      const selector = files
        ? "#checkpoint-flow-panel .file-tab"
        : "#background-terminal-panel .terminal-output-scroll .ui-scroll-area-viewport";
      let mounted = false;
      while (Date.now() < deadline) {
        if (
          pilot(["eval", `Boolean(document.querySelector(${JSON.stringify(selector)}))`]) === "true"
        ) {
          mounted = true;
          break;
        }
        await new Promise((done) => setTimeout(done, 200));
      }
      assert(mounted, `${moduleName} preview did not mount`);
      pilot(["snapshot", "-i"]);
      pilot(["run", join(repo, `tests/blackbox/${moduleName}.toml`)]);
      pilot(["screenshot", join(artifacts, `${theme}-${locale}.png`)]);
      if (process.platform === "win32" && process.env.BLACKBOX_NATIVE_WINDOW_HANDLE) {
        const capture = spawnSync(
          "python",
          [
            join(repo, "scripts/capture-windows-window.py"),
            "--hwnd",
            process.env.BLACKBOX_NATIVE_WINDOW_HANDLE,
            "--output",
            join(artifacts, `${theme}-${locale}-native.png`),
          ],
          { encoding: "utf8", windowsHide: true },
        );
        assert.equal(capture.status, 0, capture.stderr || String(capture.error));
      }
      if (files) {
        pilot(["eval", "setTimeout(() => location.reload(), 100); true"]);
        await new Promise((done) => setTimeout(done, 1000));
        pilot(["snapshot", "-i"]);
        pilot(["run", join(repo, "tests/blackbox/file-diff.toml")]);
      }
    }
  }
} finally {
  pilot(["navigate", originalUrl]);
}
pilot(["logs", "--level", "error"]);
process.stdout.write(`${moduleName} verification passed. Artifacts: ${artifacts}\n`);
