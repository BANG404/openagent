// @ts-check
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFrontendCapture } from "./fault-capture-files.ts";

assert(process.env.TAURI_PILOT_SOCKET, "select the isolated recording window");
assert(
  process.env.OPENAGENT_HOME?.includes("fault-replay"),
  "use a dedicated fault-replay fixture",
);
const artifacts = mkdtempSync(join(tmpdir(), "openagent-fault-recording-"));
const root = fileURLToPath(new URL("../", import.meta.url));
/** @param {string[]} args */
function pilot(args) {
  const result = spawnSync("tauri-pilot", [...args, "--window", "main"], {
    cwd: artifacts,
    env: process.env,
    encoding: "utf8",
    timeout: 60000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout.trim();
}
const original = pilot(["url"]);
const base = new URL(original);
assert(["localhost", "127.0.0.1"].includes(base.hostname));
const fixture = JSON.parse(
  readFileSync(join(root, "src/lib/replay/fixtures/hydration-race.json"), "utf8"),
);
const assertions = join(artifacts, "assertions.json");
writeFileSync(assertions, JSON.stringify(fixture.assertions));
try {
  for (const theme of ["light", "dark"])
    for (const locale of ["en", "zh"]) {
      const url = new URL(base.origin);
      for (const [key, value] of Object.entries({
        "streaming-transcript-preview": "",
        "streaming-transcript-preview-replay": "",
        "streaming-transcript-preview-theme": theme,
        "streaming-transcript-preview-locale": locale,
      }))
        url.searchParams.set(key, value);
      pilot(["navigate", url.href]);
      pilot(["wait", "[data-record-case=hydration-race]"]);
      pilot(["snapshot", "-i"]);
      pilot(["run", join(root, "tests/blackbox/fault-recording.toml")]);
      const id = pilot([
        "eval",
        "document.querySelector('[data-capture-session]').dataset.captureSession",
      ]);
      assert.match(id, /^[0-9a-f-]{36}$/);
      const directory = join(process.env.OPENAGENT_HOME, "diagnostics/replay", id);
      const capture = await readFrontendCapture(directory);
      assert.equal(capture.manifest.completeness, "complete");
      const output = join(artifacts, `case-${theme}-${locale}.json`);
      const extracted = spawnSync(
        process.execPath,
        [
          join(root, "scripts/fault-extract.ts"),
          "--capture",
          directory,
          "--assertions",
          assertions,
          "--out",
          output,
          "--id",
          `native-${theme}-${locale}`,
          "--private-reviewed",
        ],
        { cwd: root, encoding: "utf8", timeout: 60000, windowsHide: true },
      );
      assert.equal(extracted.status, 0, extracted.stderr || extracted.stdout);
      assert.equal(JSON.parse(extracted.stdout).status, "extracted");
    }
} finally {
  pilot(["navigate", original]);
}
process.stdout.write(
  "Native capture -> integrity validation -> extraction -> replay passed in light/dark and en/zh.\n",
);
