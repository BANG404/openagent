import { resolve } from "node:path";

export const performanceProfiles = {
  smoke: { turns: 8, payload: 256, compactEvery: 2, cycles: 2 },
  standard: { turns: 200, payload: 1024, compactEvery: 10, cycles: 5 },
  stress: { turns: 1000, payload: 4096, compactEvery: 20, cycles: 10 },
};

/** @param {string[]} args */
export function performanceOptions(args) {
  const allowed = new Set([
    "--profile",
    "--turns",
    "--payload",
    "--compact-every",
    "--cycles",
    "--output",
    "--base-url",
    "--max-turn-p95-ms",
    "--max-frame-p95-ms",
  ]);
  /** @type {Map<string, string>} */
  const values = new Map();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!allowed.has(flag) || values.has(flag))
      throw new Error(`Unknown/duplicate argument: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    values.set(flag, value);
  }
  const profile = values.get("--profile") ?? "standard";
  if (!Object.hasOwn(performanceProfiles, profile))
    throw new Error(`Unknown performance profile: ${profile}`);
  const defaults = performanceProfiles[/** @type {keyof typeof performanceProfiles} */ (profile)];
  /** @param {string} flag @param {number} fallback @param {number} min @param {number} max */
  const integer = (flag, fallback, min, max) => {
    const value = Number(values.get(flag) ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`${flag} must be an integer from ${min} to ${max}`);
    return value;
  };
  const turns = integer("--turns", defaults.turns, 4, 10_000);
  const baseUrl = new URL(values.get("--base-url") ?? "http://127.0.0.1:5189");
  if (
    !["http:", "https:"].includes(baseUrl.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(baseUrl.hostname)
  )
    throw new Error("Performance previews require a local source frontend");
  return {
    profile,
    turns,
    payload: integer("--payload", defaults.payload, 128, 65_536),
    compactEvery: integer("--compact-every", defaults.compactEvery, 2, turns),
    cycles: integer("--cycles", defaults.cycles, 1, 100),
    output: values.has("--output") ? resolve(values.get("--output") ?? "") : null,
    baseUrl: baseUrl.origin,
    maxTurnP95: integer("--max-turn-p95-ms", 0, 0, 3_600_000),
    maxFrameP95: integer("--max-frame-p95-ms", 0, 0, 3_600_000),
  };
}

/** @param {number[]} samples */
export function performanceDistribution(samples) {
  if (!samples.length || samples.some((sample) => !Number.isFinite(sample) || sample < 0))
    throw new Error("Performance samples must be finite, nonnegative and nonempty");
  const sorted = [...samples].sort((a, b) => a - b);
  /** @param {number} p */
  const percentile = (p) => sorted[Math.ceil(sorted.length * p) - 1];
  return {
    count: sorted.length,
    min: sorted[0],
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted.at(-1),
  };
}

/** @param {ReturnType<typeof performanceOptions>} options @param {string} theme @param {string} locale */
export function performancePreviewUrl(options, theme, locale) {
  const url = new URL(options.baseUrl);
  url.search = new URLSearchParams({
    "streaming-transcript-preview": "",
    "streaming-transcript-preview-performance": "",
    "streaming-transcript-preview-theme": theme,
    "streaming-transcript-preview-locale": locale,
    "performance-turns": String(options.turns),
    "performance-payload": String(options.payload),
    "performance-compact-every": String(options.compactEvery),
    "performance-cycles": String(options.cycles),
  }).toString();
  return url.href;
}
