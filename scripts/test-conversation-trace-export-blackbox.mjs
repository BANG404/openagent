// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

assert(process.env.TAURI_PILOT_SOCKET, "select the isolated native window explicitly");
assert(
  process.env.OPENAGENT_HOME && resolve(process.env.OPENAGENT_HOME).includes("trace-export"),
  "use a trace-export fixture home",
);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-trace-export-"));
const scenario = fileURLToPath(
  new URL("../tests/blackbox/conversation-trace-export.toml", import.meta.url),
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
const original = pilot(["url"]);
const base = new URL(process.env.BLACKBOX_BASE_URL || original);
assert(["localhost", "127.0.0.1"].includes(base.hostname), "a local debug frontend is required");
try {
  for (const theme of ["light", "dark"]) {
    for (const locale of ["en", "zh"]) {
      const preview = new URL(base.origin);
      preview.searchParams.set("streaming-transcript-preview", "");
      preview.searchParams.set("streaming-transcript-preview-trace-export", "");
      preview.searchParams.set("streaming-transcript-preview-theme", theme);
      preview.searchParams.set("streaming-transcript-preview-locale", locale);
      pilot(["navigate", preview.href]);
      pilot(["wait", ".trace-export-preview[data-ready=true]"]);
      pilot(["snapshot", "-i"]);
      const expected = locale === "en" ? "Export complete conversation trace" : "导出完整对话轨迹";
      assert(pilot(["text", ".debug-export"]).includes(expected));
      try {
        pilot(["run", scenario]);
        pilot(["snapshot", "-i"]);
        const path = pilot(["text", "[data-export-path]"]);
        const snapshot = JSON.parse(readFileSync(path, "utf8"));
        assert.equal(snapshot.format, "openagent.conversation-trace");
        assert.equal(snapshot.format_version, 2);
        assert.equal(snapshot.conversation.title, "Trace export fixture");
        for (const key of [
          "branches",
          "checkpoints",
          "attachment_blobs",
          "task_traces",
          "follow_up_suggestions",
        ])
          assert(Array.isArray(snapshot[key]));
        unlinkSync(path);
        pilot(["screenshot", join(artifacts, `${theme}-${locale}.png`)]);
      } finally {
        pilot(["click", "[data-cleanup-export]"]);
        pilot(["wait", ".trace-export-preview[data-ready=false]"]);
      }
    }
  }
  pilot(["logs", "--level", "error"]);
} finally {
  pilot(["navigate", original]);
}
process.stdout.write(`Conversation trace export black-box passed. Artifacts: ${artifacts}\n`);
