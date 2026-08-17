#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MAX_CONCURRENCY = 4;

function usage() {
  return `Usage:
  bun run-codex-exec-batch.mjs --repo <path> --task "OWT <task>" [--task "OWT <task>"]

Options:
  --repo <path>             Git repository whose local default branch receives the OWT work.
  --task <prompt>           Codex prompt. Repeat for every independent task; each must start with OWT.
  --max-concurrency <n>     Maximum simultaneous codex exec processes (default: ${DEFAULT_MAX_CONCURRENCY}).
  --codex-bin <path>        Codex executable override.
  --dry-run                 Print the resolved launch plan without starting Codex.
  --help                    Show this help.
`;
}

/** @param {string[]} argv */
export function parseArguments(argv) {
  /** @type {{ repo: string; tasks: string[]; maxConcurrency: number; codexBin: string | undefined; dryRun: boolean; help: boolean }} */
  const options = {
    repo: ".",
    tasks: [],
    maxConcurrency: DEFAULT_MAX_CONCURRENCY,
    codexBin: undefined,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (["--repo", "--task", "--max-concurrency", "--codex-bin"].includes(argument)) {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--repo") options.repo = value;
      if (argument === "--task") options.tasks.push(value);
      if (argument === "--codex-bin") options.codexBin = value;
      if (argument === "--max-concurrency") {
        const parsed = Number(value);
        if (!Number.isSafeInteger(parsed) || parsed < 1) {
          throw new Error("--max-concurrency must be a positive integer.");
        }
        options.maxConcurrency = parsed;
      }
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!options.help && options.tasks.length < 2) {
    throw new Error("Provide at least two --task prompts for a parallel batch.");
  }
  for (const prompt of options.tasks) {
    if (!/^OWT(?:\s+|:\s*)\S/u.test(prompt)) {
      throw new Error(
        `Every task must start with an OWT delivery prefix: ${JSON.stringify(prompt)}`,
      );
    }
  }
  return options;
}

/** @param {string} repo */
function repositoryRoot(repo) {
  const candidate = realpathSync(resolve(repo));
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: candidate,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** @param {string | undefined} requested */
function resolveCodexBinary(requested) {
  if (requested) return requested;
  if (process.platform !== "win32") return "codex";
  const matches = execFileSync("where.exe", ["codex"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return matches.find((entry) => entry.toLowerCase().endsWith(".exe")) ?? matches[0] ?? "codex";
}

/**
 * @param {{ repo: string; tasks: string[]; maxConcurrency: number; codexBin?: string }} options
 */
export function buildExecPlan(options) {
  const repo = repositoryRoot(options.repo);
  const writableParent = dirname(repo);
  const codexBin = resolveCodexBinary(options.codexBin);
  return {
    repo,
    writableParent,
    codexBin,
    maxConcurrency: Math.min(options.maxConcurrency, options.tasks.length),
    tasks: options.tasks.map((prompt, index) => ({
      id: `task-${index + 1}`,
      prompt,
      args: [
        "exec",
        "--sandbox",
        "workspace-write",
        "--approve-for-me",
        "--cd",
        repo,
        "--add-dir",
        writableParent,
        prompt,
      ],
    })),
  };
}

/**
 * Prefix complete output lines while retaining a partial final line.
 * @param {NodeJS.ReadableStream} stream
 * @param {NodeJS.WritableStream} destination
 * @param {string} prefix
 */
function pipePrefixed(stream, destination, prefix) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/u);
    pending = lines.pop() ?? "";
    for (const line of lines) destination.write(`${prefix}${line}\n`);
  });
  stream.on("end", () => {
    if (pending) destination.write(`${prefix}${pending}\n`);
  });
}

/** @param {ReturnType<typeof buildExecPlan>} plan */
export async function runBatch(plan) {
  const results = new Array(plan.tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < plan.tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      const task = plan.tasks[index];
      process.stderr.write(`[${task.id}] starting ${task.prompt}\n`);
      results[index] = await new Promise((resolveResult) => {
        const child = spawn(plan.codexBin, task.args, {
          cwd: plan.repo,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
        pipePrefixed(child.stdout, process.stdout, `[${task.id}] `);
        pipePrefixed(child.stderr, process.stderr, `[${task.id}] `);
        child.once("error", (error) => resolveResult({ id: task.id, code: null, error }));
        child.once("close", (code, signal) => resolveResult({ id: task.id, code, signal }));
      });
    }
  }

  await Promise.all(Array.from({ length: plan.maxConcurrency }, () => worker()));
  return results;
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage());
      return;
    }
    const plan = buildExecPlan(options);
    if (options.dryRun) {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      return;
    }
    const results = await runBatch(plan);
    const failures = results.filter(({ code, error }) => error || code !== 0);
    process.stderr.write(`${JSON.stringify({ results }, null, 2)}\n`);
    if (failures.length > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) await main();
