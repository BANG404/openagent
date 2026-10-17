import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resourceOptions,
  summarizeResources,
  resourceBudgetFailures,
} from "./process-resources.mjs";

function processSample(identity = "1:start", cpu = 0) {
  return {
    pid: 1,
    identity,
    name: "fixture",
    cpu_ms: cpu,
    working_set_bytes: 100,
    private_bytes: 80,
    read_bytes: cpu * 10,
    write_bytes: cpu * 2,
    handles: 4,
    threads: 2,
  };
}

test("resource deltas use elapsed time and process identity across PID reuse and child churn", () => {
  const summary = summarizeResources([
    { elapsed_ms: 100, processes: [processSample()] },
    {
      elapsed_ms: 1100,
      processes: [processSample("1:start", 500), { ...processSample("2:start", 4000), pid: 2 }],
    },
    {
      elapsed_ms: 3100,
      processes: [processSample("1:start", 1000), { ...processSample("2:reused", 8000), pid: 2 }],
    },
  ]);
  expect(summary.cpu_percent_one_core.p95).toBe(50);
  expect(summary.intervals[1].cpu_percent_one_core).toBe(25);
  expect(summary.intervals[1].joined_processes).toBe(1);
  expect(summary.intervals[1].exited_processes).toBe(1);
  expect(summary.private_bytes.max).toBe(160);
  expect(summary.private_growth_bytes).toBe(80);
  expect(summary.handle_growth).toBe(4);
  expect(summary.read_bytes_per_second.p95).toBe(5000);
});

test("warmup excludes startup and unsupported counters never become zero", () => {
  const samples = [0, 1000, 2000, 3000].map((elapsed_ms) => ({
    elapsed_ms,
    processes: [processSample("root", elapsed_ms === 0 ? 0 : 1000)],
  }));
  expect(summarizeResources(samples, 1000).cpu_percent_one_core.max).toBe(0);
  expect(() => summarizeResources(samples, 3000)).toThrow("Insufficient");
  expect(() =>
    summarizeResources([
      { elapsed_ms: 0, processes: [processSample()] },
      { elapsed_ms: 0, processes: [processSample()] },
    ]),
  ).toThrow();
  samples[1].processes[0].private_bytes = NaN;
  expect(() => summarizeResources(samples)).toThrow("counter");
});

test("budgets reject regressions and preserve exact boundary values", () => {
  const summary = summarizeResources(
    [0, 1000].map((elapsed_ms) => ({
      elapsed_ms,
      processes: [
        {
          ...processSample("root", elapsed_ms / 2),
          private_bytes: 1048576 + (elapsed_ms * 1048576) / 1000,
          handles: 4 + elapsed_ms / 1000,
        },
      ],
    })),
  );
  expect(
    resourceBudgetFailures(
      summary,
      resourceOptions([
        "--pid",
        "1",
        "--max-cpu-p95",
        "50",
        "--max-private-mb",
        "2",
        "--max-private-growth-mb",
        "1",
        "--max-handle-growth",
        "1",
      ]),
    ),
  ).toEqual([]);
  expect(
    resourceBudgetFailures(
      summary,
      resourceOptions(["--pid", "1", "--max-cpu-p95", "49", "--max-private-mb", "1"]),
    ),
  ).toHaveLength(2);
});

test("resource CLI rejects missing PID, duplicate flags and invalid sampling windows", () => {
  for (const args of [
    [],
    ["--pid", "0"],
    ["--pid", "1", "--pid", "2"],
    ["--pid", "1", "--duration-seconds", "2", "--interval-ms", "10000"],
    ["--pid", "1", "--max-private-mb", "NaN"],
  ])
    expect(() => resourceOptions(args)).toThrow();
});

test.skipIf(process.platform !== "win32")(
  "Windows sampler retains process-tree counters and reports a real budget failure",
  async () => {
    const output = mkdtempSync(join(tmpdir(), "openagent-resource-test-"));
    const worker = Bun.spawn(
      [
        process.execPath,
        "-e",
        "const child = Bun.spawn([process.execPath, '-e', 'setInterval(() => {}, 1000)']); process.on('exit', () => child.kill()); console.log('ready'); setInterval(() => {}, 1000);",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    try {
      const reader = worker.stdout.getReader();
      await reader.read();
      reader.releaseLock();
      const runner = fileURLToPath(new URL("./test-process-resources.mjs", import.meta.url));
      const probe = Bun.spawn(
        [
          process.execPath,
          runner,
          "--pid",
          String(worker.pid),
          "--duration-seconds",
          "2",
          "--warmup-seconds",
          "0",
          "--interval-ms",
          "250",
          "--max-private-mb",
          "1",
          "--output",
          output,
        ],
        { stdout: "pipe", stderr: "pipe", timeout: 20000 },
      );
      const [code, stdout, stderr] = await Promise.all([
        probe.exited,
        new Response(probe.stdout).text(),
        new Response(probe.stderr).text(),
      ]);
      expect(code, stdout + stderr).toBe(1);
      const report = JSON.parse(readFileSync(join(output, "report.json"), "utf8"));
      expect(report.status).toBe("failed");
      expect(report.summary.process_count.min).toBeGreaterThanOrEqual(2);
      expect(report.summary.private_bytes.max).toBeGreaterThan(1048576);
      expect(report.failures[0]).toContain("peak private bytes");
      const samples = readFileSync(join(output, "samples.jsonl"), "utf8")
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line));
      expect(samples.length).toBeGreaterThan(1);
      expect(
        samples.every((sample) =>
          sample.processes.some((entry: { pid: number }) => entry.pid === worker.pid),
        ),
      ).toBe(true);
    } finally {
      worker.kill();
      await worker.exited;
      rmSync(output, { recursive: true, force: true });
    }
  },
  25000,
);
