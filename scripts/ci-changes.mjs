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
  const routerFiles = new Set([
    ".github/workflows/ci.yml",
    ".github/workflows/report-pr-head-ci.yml",
    "scripts/ci-changes.mjs",
    "scripts/ci-reuse.mjs",
    "scripts/preflight.mjs",
    "scripts/verify-ci-results.mjs",
  ]);
  const all = forceAll || normalized.some((file) => routerFiles.has(file));
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
      nativeQuality: false,
      nativePlatform: false,
      embedding: false,
      harness: false,
    };
  }

  const sharedDependencyFiles = ["package.json", "bun.lock"];
  const nativeWorkflow = ".github/workflows/check-native.yml";
  const sdkChanged = normalized.includes("sdk");
  const sharedDependenciesChanged = normalized.some((file) => sharedDependencyFiles.includes(file));
  const nativeWorkflowChanged = normalized.includes(nativeWorkflow);
  const nativeSourceChanged = normalized.some(
    (file) => file.startsWith("src-tauri/") && !file.startsWith("src-tauri/resources/models/"),
  );
  const nativeManifestChanged = normalized.some((file) =>
    ["src-tauri/Cargo.toml", "src-tauri/Cargo.lock", "src-tauri/build.rs"].includes(file),
  );
  const automationTests = new Set([
    "tests/ciChanges.test.js",
    "tests/ciReuse.test.js",
    "tests/ciResults.test.js",
    "tests/docsSync.test.js",
    "tests/oprReconcile.test.js",
    "tests/preflight.test.js",
    "tests/privateSdkDiagnostic.test.js",
    "tests/releaseCi.test.js",
    "tests/releaseVersion.test.js",
  ]);

  const automation =
    all ||
    normalized.some((file) =>
      matchesPath(file, [
        ".agents/skills/deliver-via-pr/",
        ".github/",
        "scripts/",
        "docs/release.md",
        "package.json",
        "bun.lock",
      ]),
    ) ||
    normalized.some((file) => automationTests.has(file));

  const frontend =
    all ||
    normalized.some((file) =>
      matchesPath(file, [
        ".github/workflows/check-frontend.yml",
        "src/",
        "static/",
        "package.json",
        "bun.lock",
        "svelte.config.js",
        "tsconfig.json",
        "vite.config.js",
        "sdk",
      ]),
    ) ||
    normalized.some((file) => file.startsWith("tests/") && !automationTests.has(file));

  const nativeQuality =
    all ||
    nativeWorkflowChanged ||
    nativeSourceChanged ||
    sharedDependenciesChanged ||
    sdkChanged ||
    normalized.includes("scripts/verify-private-sdk-boundary.mjs");

  const nativePlatform =
    all || nativeWorkflowChanged || nativeSourceChanged || sharedDependenciesChanged || sdkChanged;

  const embedding =
    all ||
    nativeWorkflowChanged ||
    sharedDependenciesChanged ||
    sdkChanged ||
    nativeManifestChanged ||
    normalized.includes("scripts/fetch-embedding-model.mjs") ||
    normalized.some((file) => file.startsWith("src-tauri/resources/models/"));

  const harness =
    all ||
    nativeWorkflowChanged ||
    sharedDependenciesChanged ||
    sdkChanged ||
    normalized.includes("scripts/test-harness-integration.mjs");

  return { automation, frontend, nativeQuality, nativePlatform, embedding, harness };
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
