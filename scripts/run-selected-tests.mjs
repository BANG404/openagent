import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { collectPreflightChanges, selectPreflightBase } from "./preflight.mjs";
import { repositoryFiles, selectTests } from "./test-selection.mjs";

/** @param {{ root: string; plan: ReturnType<typeof selectTests>; scope: "frontend"|"automation" }} options */
export function executeSelectedTests({ root, plan, scope }) {
  if (!plan.tests.length)
    throw new Error("Test selection is empty; refusing a silent successful check");
  // Explicit relative paths prevent Bun's filename substring filtering from
  // silently executing unrelated suites. Spawn arguments never enter a shell.
  const testArgs =
    plan.full && scope === "frontend"
      ? ["run", "test"]
      : ["test", "--timeout", "30000", ...plan.tests.map((test) => `./${test}`)];
  const result = spawnSync(process.execPath, testArgs, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export function runSelectedTests() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const args = process.argv.slice(2);
  let scope = "frontend";
  let base = process.env.TEST_BASE_SHA ?? "";
  const head = process.env.TEST_HEAD_SHA || "HEAD";
  let full = process.env.TEST_FULL === "true";
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--scope" && args[i + 1]) scope = args[++i];
    else if (args[i] === "--base" && args[i + 1]) base = args[++i];
    else if (args[i] === "--all") full = true;
    else if (args[i] === "--dry-run") dryRun = true;
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  if (scope !== "frontend" && scope !== "automation")
    throw new Error(`Unknown test scope: ${scope}`);
  /** @type {string[]} */
  let changed = [];
  if (!full) {
    try {
      if (process.env.CI) {
        if (!base || /^0+$/.test(base)) throw new Error("CI did not supply a usable baseline");
        changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACDMRT", base, head], {
          cwd: root,
          encoding: "utf8",
        })
          .split(/\r?\n/)
          .filter(Boolean);
      } else {
        const branch = execFileSync("git", ["branch", "--show-current"], {
          cwd: root,
          encoding: "utf8",
        }).trim();
        base = selectPreflightBase({ explicitBase: base, currentBranch: branch });
        changed = collectPreflightChanges(base).files;
      }
    } catch (error) {
      console.log(
        `Falling back to complete tests: ${error instanceof Error ? error.message : error}`,
      );
      full = true;
    }
  }
  const plan = selectTests({ root, files: repositoryFiles(root), changed, scope, full });
  console.log(
    `Tests (${scope}): ${plan.tests.length}/${plan.total}; ${plan.full ? "complete" : "affected"}`,
  );
  console.log(`Selection: ${plan.reason}`);
  if (dryRun) {
    for (const test of plan.tests) console.log(`Would test: ${test}`);
    return;
  }
  process.exitCode = executeSelectedTests({ root, plan, scope });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runSelectedTests();
}
