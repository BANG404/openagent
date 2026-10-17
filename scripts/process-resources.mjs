// @ts-check
import { performanceDistribution } from "./conversation-performance-options.mjs";

/** @typedef {{pid: number, name: string, identity: string, cpu_ms: number, working_set_bytes: number, private_bytes: number, read_bytes: number, write_bytes: number, handles: number, threads: number}} ProcessSample */
/** @typedef {{elapsed_ms: number, processes: ProcessSample[]}} ResourceSample */

/** @param {string[]} args */
export function resourceOptions(args) {
  const allowed = new Set([
    "--pid",
    "--duration-seconds",
    "--interval-ms",
    "--warmup-seconds",
    "--label",
    "--output",
    "--max-cpu-p95",
    "--max-private-mb",
    "--max-private-growth-mb",
    "--max-handle-growth",
  ]);
  const values = new Map();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    const value = args[++index];
    if (!allowed.has(flag) || values.has(flag) || !value || value.startsWith("--"))
      throw new Error(`Invalid/duplicate argument: ${flag}`);
    values.set(flag, value);
  }
  /** @param {string} key @param {number} fallback @param {number} min @param {number} max */
  const integer = (key, fallback, min, max) => {
    const value = Number(values.get(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(`${key} must be an integer from ${min} to ${max}`);
    return value;
  };
  const duration = integer("--duration-seconds", 30, 2, 3600);
  const interval = integer("--interval-ms", 1000, 250, 10000);
  if (interval > duration * 500) throw new Error("Duration must cover at least two intervals");
  return {
    pid: integer("--pid", 0, 1, 2147483647),
    duration,
    interval,
    warmup: integer("--warmup-seconds", 2, 0, 300),
    label: values.get("--label") ?? "idle",
    output: values.get("--output"),
    maxCpuP95: integer("--max-cpu-p95", 0, 0, 100000),
    maxPrivateMb: integer("--max-private-mb", 0, 0, 1048576),
    maxPrivateGrowthMb: integer("--max-private-growth-mb", 0, 0, 1048576),
    maxHandleGrowth: integer("--max-handle-growth", 0, 0, 10000000),
  };
}

/** @param {ResourceSample[]} samples @param {number} warmupMs */
export function summarizeResources(samples, warmupMs = 0) {
  if (samples.length < 2) throw new Error("At least two resource samples are required");
  for (const [index, sample] of samples.entries()) {
    if (
      !Number.isFinite(sample.elapsed_ms) ||
      sample.elapsed_ms < 0 ||
      !sample.processes.length ||
      (index > 0 && sample.elapsed_ms <= samples[index - 1].elapsed_ms)
    )
      throw new Error("Invalid resource sample or non-increasing clock");
    const identities = new Set();
    for (const entry of sample.processes) {
      if (!entry.identity || identities.has(entry.identity))
        throw new Error("Duplicate/missing process identity");
      identities.add(entry.identity);
      for (const key of [
        "cpu_ms",
        "working_set_bytes",
        "private_bytes",
        "read_bytes",
        "write_bytes",
        "handles",
        "threads",
      ]) {
        const value = entry[/** @type {keyof ProcessSample} */ (key)];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
          throw new Error(`Unavailable/invalid process counter: ${key}`);
      }
    }
  }
  const baseline = samples[0].elapsed_ms + warmupMs;
  const measured = samples.filter((sample) => sample.elapsed_ms >= baseline);
  if (measured.length < 2) throw new Error("Insufficient samples after warmup");
  /** @param {ResourceSample} sample @param {keyof ProcessSample} key */
  const sum = (sample, key) =>
    sample.processes.reduce((total, entry) => total + Number(entry[key]), 0);
  const intervals = measured.slice(1).map((sample, index) => {
    const previous = measured[index];
    const prior = new Map(previous.processes.map((entry) => [entry.identity, entry]));
    /** @param {'cpu_ms'|'read_bytes'|'write_bytes'} key */
    const delta = (key) =>
      sample.processes.reduce((total, entry) => {
        const old = prior.get(entry.identity);
        return total + (old ? Math.max(0, entry[key] - old[key]) : 0);
      }, 0);
    const elapsed = sample.elapsed_ms - previous.elapsed_ms;
    return {
      elapsed_ms: sample.elapsed_ms,
      cpu_percent_one_core: (delta("cpu_ms") / elapsed) * 100,
      read_bytes_per_second: (delta("read_bytes") / elapsed) * 1000,
      write_bytes_per_second: (delta("write_bytes") / elapsed) * 1000,
      joined_processes: sample.processes.filter((entry) => !prior.has(entry.identity)).length,
      exited_processes: previous.processes.filter(
        (entry) => !sample.processes.some((next) => next.identity === entry.identity),
      ).length,
    };
  });
  /** @param {keyof ProcessSample} key */
  const totals = (key) => measured.map((sample) => sum(sample, key));
  const privateBytes = totals("private_bytes");
  const handles = totals("handles");
  return {
    sample_count: measured.length,
    duration_ms: measured[measured.length - 1].elapsed_ms - measured[0].elapsed_ms,
    cpu_percent_one_core: performanceDistribution(
      intervals.map((sample) => sample.cpu_percent_one_core),
    ),
    working_set_bytes: performanceDistribution(totals("working_set_bytes")),
    private_bytes: performanceDistribution(privateBytes),
    private_growth_bytes: privateBytes[privateBytes.length - 1] - privateBytes[0],
    handle_growth: handles[handles.length - 1] - handles[0],
    handles: performanceDistribution(handles),
    threads: performanceDistribution(totals("threads")),
    process_count: performanceDistribution(measured.map((sample) => sample.processes.length)),
    read_bytes_per_second: performanceDistribution(
      intervals.map((sample) => sample.read_bytes_per_second),
    ),
    write_bytes_per_second: performanceDistribution(
      intervals.map((sample) => sample.write_bytes_per_second),
    ),
    intervals,
  };
}

/** @param {ReturnType<typeof summarizeResources>} summary @param {ReturnType<typeof resourceOptions>} options */
export function resourceBudgetFailures(summary, options) {
  return [
    [options.maxCpuP95, summary.cpu_percent_one_core.p95, "CPU p95 (one core %)"],
    [options.maxPrivateMb * 1048576, summary.private_bytes.max, "peak private bytes"],
    [options.maxPrivateGrowthMb * 1048576, summary.private_growth_bytes, "private byte growth"],
    [options.maxHandleGrowth, summary.handle_growth, "handle growth"],
  ]
    .filter(([budget, actual]) => Number(budget) > 0 && Number(actual) > Number(budget))
    .map(([budget, actual, name]) => `${name}: ${actual} exceeds ${budget}`);
}
