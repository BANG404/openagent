import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkoutConfig = ["-c", "core.autocrlf=false", "-c", "core.eol=lf"];

/** @param {string} root @param {NodeJS.ProcessEnv} env @param {string[]} args */
function git(root, env, args, input = Buffer.alloc(0)) {
  return execFileSync("git", [...checkoutConfig, ...args], {
    cwd: root,
    env,
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Repair only checkout conversion of an unchanged, unstaged regular file.
 * Compare bytes against the index rather than trusting Git's cached stat data.
 * @param {string} root
 * @param {NodeJS.ProcessEnv} env
 */
function repairCheckout(root, env) {
  const staged = new Set(
    git(root, env, ["diff", "--cached", "--name-only", "-z", "HEAD"]).toString("utf8").split("\0"),
  );
  const entries = git(root, env, ["ls-files", "--stage", "--eol", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const changed = new Set(
    git(root, env, ["diff-files", "--name-only", "-z"]).toString("utf8").split("\0"),
  );
  const canonicalRoot = realpathSync(root) + path.sep;
  const refreshed = [];
  let repaired = 0;
  for (const entry of entries) {
    const firstTab = entry.indexOf("\t");
    const secondTab = entry.indexOf("\t", firstTab + 1);
    const [mode, object, stage] = entry.slice(0, firstTab).split(" ");
    const eol = entry.slice(firstTab + 1, secondTab);
    const filename = entry.slice(secondTab + 1);
    if (
      !["100644", "100755"].includes(mode) ||
      stage !== "0" ||
      staged.has(filename) ||
      !eol.startsWith("i/lf ") ||
      (!/w\/(crlf|mixed)\s/.test(eol) && !changed.has(filename)) ||
      /w\/(none|-text)\s/.test(eol) ||
      eol.includes("attr/-text")
    ) {
      continue;
    }
    const target = path.join(root, filename);
    if (
      !lstatSync(target, { throwIfNoEntry: false })?.isFile() ||
      !realpathSync(target).startsWith(canonicalRoot)
    ) {
      continue;
    }
    const actual = readFileSync(target);
    const original = git(root, env, ["cat-file", "blob", object]);
    if (actual.equals(original)) {
      refreshed.push(`${mode} ${object} 0\t${filename}\0`);
      continue;
    }
    const normalized = Buffer.from(actual.toString("latin1").replaceAll("\r\n", "\n"), "latin1");
    if (!normalized.equals(original)) continue;
    // Honor repository-owned filters and explicit eol=crlf attributes.
    const checkout = git(root, env, ["cat-file", "--filters", `:${filename}`]);
    if (!checkout.equals(original)) continue;
    if (!readFileSync(target).equals(actual)) {
      throw new Error(`File changed during checkout repair: ${target}`);
    }
    writeFileSync(target, original);
    refreshed.push(`${mode} ${object} 0\t${filename}\0`);
    repaired += 1;
  }
  // Git can retain the old converted file size and report false modifications.
  // Clear only stat entries whose unchanged blob bytes we verified above.
  if (refreshed.length > 0) {
    git(root, env, ["update-index", "-z", "--index-info"], Buffer.from(refreshed.join("")));
  }
  return repaired;
}

/** @param {{ root?: string; env?: NodeJS.ProcessEnv }} [options] */
export function prepareSubmodules({ root = projectRoot, env = process.env } = {}) {
  // Command configuration propagates into recursive clones before their first checkout.
  git(root, env, ["submodule", "update", "--init", "--recursive"]);
  const directories = git(root, env, [
    "submodule",
    "foreach",
    "--quiet",
    "--recursive",
    "git rev-parse --show-toplevel",
  ])
    .toString("utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  let repaired = 0;
  for (const directory of directories) {
    git(directory, env, ["config", "--local", "core.autocrlf", "false"]);
    git(directory, env, ["config", "--local", "core.eol", "lf"]);
    repaired += repairCheckout(directory, env);
  }
  return { submodules: directories.length, repaired };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = prepareSubmodules();
  console.log(
    `Prepared ${result.submodules} submodules; repaired ${result.repaired} converted files.`,
  );
}
