// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBlackboxHome } from "./tauri-test-environment.mjs";
import { en } from "../src/lib/i18n.en.ts";
import { zh } from "../src/lib/i18n.zh.ts";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const isolatedHome = resolveBlackboxHome(process.env, { instanceName: "terminal-history" });
assert.notEqual(resolve(isolatedHome), resolve(join(homedir(), ".openagent")));
const artifacts = mkdtempSync(join(tmpdir(), "openagent-terminal-history-"));

/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync(process.env.TAURI_PILOT_BIN || "tauri-pilot", args, {
    cwd: artifacts,
    env: { ...process.env, OPENAGENT_HOME: isolatedHome, TAURI_PILOT_WINDOW: "main" },
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}

/** @param {string} expression */
async function waitFor(expression) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (pilot(["eval", expression]) === "true") return;
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`Timed out: ${expression}`);
}

pilot(["ping"]);
const originalUrl = pilot(["url"]);
try {
  for (const locale of ["en", "zh"]) {
    for (const theme of ["light", "dark"]) {
      const url = new URL(originalUrl);
      url.search = new URLSearchParams({
        "background-terminals-preview": "",
        "background-terminals-preview-history": "",
        "background-terminals-preview-theme": theme,
        "background-terminals-preview-locale": locale,
      }).toString();
      for (const phase of ["initial", "reload"]) {
        pilot(["snapshot", "-i"]);
        if (phase === "initial") pilot(["navigate", url.href]);
        else pilot(["eval", "setTimeout(() => location.reload(), 200); true"]);
        await waitFor(
          "typeof window.__terminalHistoryCopy === 'undefined' && Boolean(document.querySelector('#background-terminal-panel .terminal-output'))",
        );
        const copy = locale === "zh" ? zh : en;
        pilot([
          "eval",
          `window.__terminalHistoryCopy = ${JSON.stringify(copy.backgroundTerminalHistoryDescription)}; true`,
        ]);
        pilot(["run", join(repo, "tests/blackbox/terminal-history.toml")]);
        pilot(["screenshot", join(artifacts, `${theme}-${locale}-${phase}.png`)]);
      }
    }
  }
} finally {
  pilot(["navigate", originalUrl]);
}
pilot(["logs", "--level", "error"]);
process.stdout.write(`Terminal history verification passed. Artifacts: ${artifacts}\n`);
