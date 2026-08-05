import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { classifyChangedModules } from "./ci-changes.mjs";
import { documentationSyncErrors } from "./check-docs-sync.mjs";

const AUTOMATION_TESTS = [
  "tests/ciChanges.test.js",
  "tests/ciResults.test.js",
  "tests/docsSync.test.js",
  "tests/oprReconcile.test.js",
  "tests/preflight.test.js",
  "tests/privateSdkDiagnostic.test.js",
  "tests/releaseCi.test.js",
  "tests/releaseVersion.test.js",
];

/**
 * @param {string[]} args
 * @returns {string[]}
 */
function gitLines(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * @param {string} baseRef
 */
export function collectPreflightChanges(baseRef) {
  const baseSha = execFileSync("git", ["merge-base", baseRef, "HEAD"], {
    encoding: "utf8",
  }).trim();
  const files = new Set([
    ...gitLines(["diff", "--name-only", "--diff-filter=ACDMRT", baseSha, "HEAD"]),
    ...gitLines(["diff", "--name-only", "--diff-filter=ACDMRT", "HEAD"]),
    ...gitLines(["ls-files", "--others", "--exclude-standard"]),
  ]);

  return { baseSha, files: [...files] };
}

/**
 * @param {ReturnType<typeof classifyChangedModules>} modules
 */
export function buildPreflightCommands(modules) {
  /** @type {{ id: string; label: string; command: string; args: string[] }[]} */
  const commands = [];
  const ids = new Set();
  /**
   * @param {string} id
   * @param {string} label
   * @param {string} command
   * @param {string[]} args
   */
  const add = (id, label, command, args) => {
    if (ids.has(id)) return;
    ids.add(id);
    commands.push({ id, label, command, args });
  };

  if (modules.automation) {
    add("actions", "GitHub Actions syntax", "bun", ["run", "lint:actions"]);
    add("lint", "JavaScript and frontend lint", "bun", ["run", "lint:frontend"]);
    add("format", "Repository formatting", "bun", ["run", "format:check"]);
    if (!modules.frontend) {
      add("automation-tests", "Automation policy tests", "bun", ["test", ...AUTOMATION_TESTS]);
    }
  }

  if (modules.frontend) {
    add("svelte-check", "Svelte and TypeScript", "bun", ["run", "check"]);
    add("lint", "JavaScript and frontend lint", "bun", ["run", "lint:frontend"]);
    add("format", "Repository formatting", "bun", ["run", "format:check"]);
    add("frontend-tests", "Frontend and automation tests", "bun", ["run", "test"]);
  }

  if (modules.nativeQuality) {
    add("rust-format", "Rust formatting", "bun", ["run", "format:rust:check"]);
  }
  if (modules.nativeQuality || modules.nativePlatform) {
    add("rust-check", "Host-platform Rust compile check", "cargo", [
      "check",
      "--manifest-path",
      "src-tauri/Cargo.toml",
    ]);
  }
  if (modules.embedding) {
    add("embedding", "Bundled embedding resources", "bun", ["run", "check:embedding-model"]);
  }
  if (modules.harness) {
    add("harness-openapi", "Harness OpenAPI contract", "bun", ["run", "check:harness-openapi"]);
  }

  return commands;
}

function parseArguments() {
  const args = process.argv.slice(2);
  let baseRef = process.env.PREFLIGHT_BASE?.trim() || "origin/master";
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--base" && args[index + 1]) {
      baseRef = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }

  return { baseRef, dryRun };
}

function main() {
  const { baseRef, dryRun } = parseArguments();
  const { baseSha, files } = collectPreflightChanges(baseRef);
  const modules = classifyChangedModules(files);
  const selected = Object.entries(modules)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
  const commands = buildPreflightCommands(modules);

  console.log(`Preflight base: ${baseRef} (${baseSha.slice(0, 12)})`);
  console.log(`Changed files: ${files.length}`);
  console.log(`Selected modules: ${selected.length > 0 ? selected.join(", ") : "none"}`);

  const docsErrors = documentationSyncErrors(files);
  if (docsErrors.length > 0) {
    for (const error of docsErrors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  const checks = [
    {
      id: "diff-check",
      label: "Git whitespace errors",
      command: "git",
      args: ["diff", "--check", baseSha, "--"],
    },
    ...commands,
  ];

  for (const check of checks) {
    const rendered = [check.command, ...check.args].join(" ");
    console.log(`${dryRun ? "Would run" : "Running"}: ${check.label} (${rendered})`);
    if (dryRun) continue;

    const result = spawnSync(check.command, check.args, { stdio: "inherit", shell: false });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      return;
    }
  }

  console.log(dryRun ? "Preflight plan is ready." : "Local preflight passed.");
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
