// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const artifacts = mkdtempSync(join(tmpdir(), "openagent-composer-editor-"));
const scenario = fileURLToPath(new URL("../tests/blackbox/composer-editor.toml", import.meta.url));

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
      preview.searchParams.set("command-palette-preview", "");
      preview.searchParams.set("command-palette-preview-theme", theme);
      preview.searchParams.set("command-palette-preview-locale", locale);
      pilot(["navigate", preview.href]);
      pilot(["wait", ".command-palette-preview-stage [contenteditable=true]"]);
      pilot(["snapshot", "-i"]);
      pilot(["run", scenario]);
      pilot(["screenshot", join(artifacts, `${theme}-${locale}.png`)]);
    }
  }
  pilot(["logs", "--level", "error"]);
} finally {
  pilot(["navigate", originalUrl]);
}
process.stdout.write(`Composer editor black-box verification passed. Artifacts: ${artifacts}\n`);
