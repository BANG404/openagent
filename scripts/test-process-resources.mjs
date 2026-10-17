// @ts-check
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir, cpus } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resourceOptions,
  summarizeResources,
  resourceBudgetFailures,
} from "./process-resources.mjs";

const options = resourceOptions(process.argv.slice(2));
if (process.platform !== "win32")
  throw new Error("Native resource sampling currently requires Windows");
const output = options.output
  ? resolve(options.output)
  : mkdtempSync(join(tmpdir(), "openagent-resources-"));
mkdirSync(output, { recursive: true });
console.log(`Resource samples: ${output}`);
const sampler = fileURLToPath(new URL("./sample-process-resources.ps1", import.meta.url));
const child = spawn(
  "powershell.exe",
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    sampler,
    "-RootProcessId",
    String(options.pid),
    "-DurationMs",
    String((options.duration + options.warmup) * 1000),
    "-IntervalMs",
    String(options.interval),
  ],
  { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let stdout = "";
let stderr = "";
child.stdout.on("data", (data) => {
  stdout += String(data);
});
child.stderr.on("data", (data) => {
  stderr += String(data);
});
const timeout = setTimeout(() => child.kill(), (options.duration + options.warmup + 60) * 1000);
let code;
let collectorError = "";
try {
  code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
} catch (error) {
  collectorError = String(error);
} finally {
  clearTimeout(timeout);
  writeFileSync(join(output, "samples.jsonl"), stdout);
  writeFileSync(join(output, "sampler.log"), stderr);
}
let summary = null;
/** @type {string[]} */
let failures = [];
try {
  if (collectorError) throw new Error(collectorError);
  if (code !== 0) throw new Error(`Sampler exited ${code}: ${stderr}`);
  summary = summarizeResources(
    stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line)),
    options.warmup * 1000,
  );
  failures = resourceBudgetFailures(summary, options);
} catch (error) {
  failures.push(String(error));
}
const root = fileURLToPath(new URL("..", import.meta.url));
const report = {
  schema_version: 1,
  status: failures.length ? "failed" : "passed",
  label: options.label,
  captured_at: new Date().toISOString(),
  collector_source: {
    revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    dirty: Boolean(
      execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(),
    ),
  },
  platform: process.platform,
  logical_cpus: cpus().length,
  options,
  summary,
  failures,
};
writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
if (summary)
  console.log(
    `CPU p95=${summary.cpu_percent_one_core.p95.toFixed(2)}% of one core; private peak=${(summary.private_bytes.max / 1048576).toFixed(1)} MiB; private growth=${(summary.private_growth_bytes / 1048576).toFixed(1)} MiB; handles growth=${summary.handle_growth}`,
  );
if (failures.length) throw new Error(failures.join("\n"));
