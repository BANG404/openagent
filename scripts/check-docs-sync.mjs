import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadSkillManifest, resolveSkillOwner } from "./agent-skill-routing.mjs";

const ZERO_SHA = /^0+$/;

const AGENT_DOCUMENTATION = [
  /^AGENTS\.md$/,
  /^sdk\/(?:AGENTS\.md|typescript\/README\.md)$/,
  /^README(?:\.[^/]+)?\.md$/,
  /^CHANGELOG\.md$/,
  /^\.agents\/skills\/[^/]+\/.+\.md$/,
  /^static\/skills\/[^/]+\/.+\.md$/,
];

const LOGIC_FILES = [
  /^crates\/.+\.(?:rs|toml)$/,
  /^sdk\/typescript\/src\/.+\.ts$/,
  /^src\/.+\.(?:js|mjs|cjs|ts|svelte|css)$/,
  /^src-tauri\/src\/.+\.rs$/,
  /^src-tauri\/build\.rs$/,
  /^src-tauri\/capabilities\/.+\.json$/,
  /^src-tauri\/(?:Cargo|tauri\.conf)\.(?:toml|json)$/,
  /^scripts\/.+\.(?:js|mjs|cjs|ts|ps1)$/,
  /^\.github\/workflows\/.+\.ya?ml$/,
  /^package\.json$/,
  /^tsconfig\.json$/,
  /^(?:eslint|svelte|vite)\.config\.(?:js|mjs|ts)$/,
];

/**
 * @param {string[]} files
 * @returns {string[]}
 */
function normalize(files) {
  return [...new Set(files.map((file) => file.trim().replaceAll("\\", "/")).filter(Boolean))];
}

/**
 * @param {string} file
 * @param {RegExp[]} patterns
 * @returns {boolean}
 */
function matchesAny(file, patterns) {
  return patterns.some((pattern) => pattern.test(file));
}

/**
 * @param {string[]} files
 * @returns {string[]}
 */
export function documentationSyncErrors(files) {
  const changed = normalize(files);
  const logic = changed.filter((file) => matchesAny(file, LOGIC_FILES));
  if (logic.length === 0) {
    return [];
  }

  // Prepare Release already publishes the version-only contract in CHANGELOG.
  // Keep that route without letting unrelated product/automation code bypass its owner.
  const releaseMetadata = new Set([
    "package.json",
    "src-tauri/tauri.conf.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
  ]);
  if (
    changed.includes(".github/release.json") &&
    changed.includes("CHANGELOG.md") &&
    logic.every((file) => releaseMetadata.has(file))
  ) {
    return [];
  }

  const documentation = changed.filter((file) => matchesAny(file, AGENT_DOCUMENTATION));
  const manifest = loadSkillManifest();
  const required = new Set();
  for (const file of logic) {
    if (file.startsWith("sdk/")) required.add("sdk");
    else required.add(resolveSkillOwner(file, manifest) ?? "repository");
  }
  const errors = [];
  for (const owner of required) {
    const covered = documentation.some((file) => {
      if (owner === "sdk") return /^sdk\/(?:AGENTS\.md|typescript\/README\.md)$/.test(file);
      if (owner === "repository") return /^(?:AGENTS|README(?:\.[^/]+)?|CHANGELOG)\.md$/.test(file);
      return file.startsWith(`.agents/skills/${owner}/`);
    });
    if (!covered) {
      const target =
        owner === "sdk"
          ? "sdk/AGENTS.md or sdk/typescript/README.md"
          : owner === "repository"
            ? "AGENTS.md, README, or CHANGELOG.md"
            : `.agents/skills/${owner}/`;
      errors.push(
        `Logic owned by ${owner} changed without its documentation. Update ${target} with the affected invariant.`,
      );
    }
  }

  return errors;
}

/**
 * @param {string[]} args
 * @returns {string[]}
 */
function gitLines(args) {
  return execFileSync("git", args, { encoding: "utf8" }).split(/\r?\n/).filter(Boolean); // NOSONAR: git is the fixed repository tool.
}

function changedFiles() {
  const base = process.env.DOCS_BASE_SHA?.trim() ?? "";
  const head = process.env.DOCS_HEAD_SHA?.trim() || "HEAD";

  if (base && !ZERO_SHA.test(base)) {
    return gitLines(["diff", "--name-only", "--diff-filter=ACDMRT", base, head]);
  }

  if (process.env.CI) {
    console.log("Documentation sync check skipped: CI did not provide a usable base SHA.");
    return [];
  }

  return [
    ...gitLines(["diff", "--name-only", "--diff-filter=ACDMRT", "HEAD"]),
    ...gitLines(["ls-files", "--others", "--exclude-standard"]),
  ];
}

function main() {
  const errors = documentationSyncErrors(changedFiles());
  if (errors.length === 0) {
    console.log("Agent-facing documentation is synchronized with changed logic.");
    return;
  }

  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) {
  main();
}
