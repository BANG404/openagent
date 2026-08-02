import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ZERO_SHA = /^0+$/;

/**
 * @param {string} file
 * @param {string[]} entries
 */
function matchesPath(file, entries) {
  return entries.some((entry) => (entry.endsWith("/") ? file.startsWith(entry) : file === entry));
}

/**
 * @param {string[]} files
 * @param {boolean} [forceAll]
 */
export function classifyChangedModules(files, forceAll = false) {
  const normalized = files.map((file) => file.replaceAll("\\", "/"));
  const all = forceAll || normalized.includes(".github/workflows/ci.yml");
  const releaseFiles = new Set([
    ".github/release.json",
    "package.json",
    "src-tauri/tauri.conf.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "CHANGELOG.md",
  ]);
  const releaseOnly =
    normalized.includes(".github/release.json") &&
    normalized.length > 0 &&
    normalized.every((file) => releaseFiles.has(file));

  if (!all && releaseOnly) {
    return {
      automation: true,
      frontend: false,
      native: false,
    };
  }

  const automation =
    all ||
    normalized.some((file) =>
      matchesPath(file, [".github/", "scripts/", "docs/release.md", "package.json", "bun.lock"]),
    );

  const frontend =
    all ||
    normalized.some((file) =>
      matchesPath(file, [
        ".github/workflows/check-frontend.yml",
        "src/",
        "static/",
        "tests/",
        "package.json",
        "bun.lock",
        "svelte.config.js",
        "tsconfig.json",
        "vite.config.js",
        "sdk",
      ]),
    );

  const native =
    all ||
    normalized.some((file) =>
      matchesPath(file, [
        ".github/workflows/check-native.yml",
        "src-tauri/",
        "package.json",
        "bun.lock",
        "sdk",
      ]),
    );

  return { automation, frontend, native };
}

/**
 * @param {string} baseSha
 * @param {string} headSha
 * @returns {string[]}
 */
function changedFiles(baseSha, headSha) {
  return execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMRT", baseSha, headSha], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
}

function main() {
  let baseSha = process.env.CI_BASE_SHA?.trim() ?? "";
  const headSha = process.env.CI_HEAD_SHA?.trim() || "HEAD";
  let forceAll = process.env.CI_FORCE_ALL === "true" || !baseSha;

  // A newly created release archive branch reports an all-zero `before` SHA.
  // Its head already has history, so compare the exact parent instead of
  // treating the immutable Beta snapshot as an entirely new repository.
  if (!forceAll && ZERO_SHA.test(baseSha)) {
    try {
      baseSha = execFileSync("git", ["rev-parse", `${headSha}^`], { encoding: "utf8" }).trim();
    } catch {
      forceAll = true;
    }
  }

  /** @type {string[]} */
  let files = [];
  let classifyAll = forceAll;
  if (!classifyAll) {
    try {
      files = changedFiles(baseSha, headSha);
    } catch (error) {
      console.error(`Unable to compare ${baseSha}..${headSha}; running every CI module.`);
      console.error(error instanceof Error ? error.message : String(error));
      classifyAll = true;
    }
  }

  const modules = classifyChangedModules(files, classifyAll);
  for (const [name, selected] of Object.entries(modules)) {
    console.log(`${name}=${selected}`);
  }
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) {
  main();
}
