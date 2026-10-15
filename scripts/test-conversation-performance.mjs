// @ts-check
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { performanceOptions } from "./conversation-performance-options.mjs";

const options = performanceOptions(process.argv.slice(2));
const root = fileURLToPath(new URL("..", import.meta.url));
const output = options.output ?? mkdtempSync(join(tmpdir(), "openagent-performance-"));
mkdirSync(output, { recursive: true });
const runtimeOutput = join(output, "runtime");
assert(!process.env.OPENAGENT_PERF_OUTPUT, "Use --output; do not inherit another run's fixture");
console.log(`Conversation performance artifacts: ${output}`);
const child = spawn(
  process.execPath,
  [
    "scripts/verify-runtime.mjs",
    "--package",
    "openagent-runtime",
    "--test",
    "embedded_backend",
    "--case",
    "performance::conversation_performance_matrix",
    "--ignored",
  ],
  {
    cwd: root,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      OPENAGENT_PERF_OUTPUT: runtimeOutput,
      OPENAGENT_PERF_TURNS: String(options.turns),
      OPENAGENT_PERF_PAYLOAD_BYTES: String(options.payload),
      OPENAGENT_PERF_COMPACT_EVERY: String(options.compactEvery),
    },
  },
);
let log = "";
for (const stream of [child.stdout, child.stderr])
  stream.on("data", (chunk) => {
    log += String(chunk);
    process.stdout.write(chunk);
  });
const code = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", resolve);
});
writeFileSync(join(output, "verification.log"), log);
assert.equal(code, 0, `Runtime workload failed; see ${output}`);
const report = JSON.parse(readFileSync(join(runtimeOutput, "runtime.json"), "utf8"));
assert.equal(report.status, "passed");
report.profile = options.profile;
report.source = {
  host: sourceIdentity(root),
  runtime: sourceIdentity(join(root, "runtime")),
  platform: process.platform,
  bun: process.versions.bun,
};
writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
/** @param {string} cwd */
function sourceIdentity(cwd) {
  // Source identity only; this report never reads application configuration.
  return {
    revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim(),
    dirty: Boolean(
      execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).trim(),
    ),
  };
}
for (const scenario of report.scenarios) {
  console.log(
    `${scenario.scenario}: ${scenario.messages} messages, ${scenario.compaction_boundaries} compactions; turn p95=${scenario.turn_ms.p95.toFixed(1)}ms; view p95=${scenario.selected_view_ms.p95.toFixed(1)}ms; restore p95=${scenario.cache_clear_restore_ms.p95.toFixed(1)}ms`,
  );
  if (options.maxTurnP95)
    assert(
      scenario.turn_ms.p95 <= options.maxTurnP95,
      `${scenario.scenario} turn p95 exceeds ${options.maxTurnP95}ms`,
    );
}
console.log(`Report: ${join(output, "report.json")}`);
