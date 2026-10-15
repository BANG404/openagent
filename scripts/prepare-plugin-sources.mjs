import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, realpathSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readPluginDevIndex, resolvePluginDevPath } from "./plugin-dev-paths.mjs";

const defaultIndex = fileURLToPath(new URL("../plugins/dev-index.json", import.meta.url));

/** @param {string} cwd @param {string[]} args @param {NodeJS.ProcessEnv} env */
function git(cwd, args, env) {
  return execFileSync("git", ["-c", "core.autocrlf=false", "-c", "core.eol=lf", ...args], {
    cwd,
    env,
    encoding: "utf8",
    timeout: 120_000,
  }).trim();
}

/** Source locations are moving development subscriptions, never host gitlinks.
 * @param {{indexFile?: string, update?: boolean, env?: NodeJS.ProcessEnv}} [options]
 */
export function preparePluginSources({
  indexFile = defaultIndex,
  update = false,
  env = process.env,
} = {}) {
  const run = (/** @type {string} */ cwd, /** @type {string[]} */ args) => git(cwd, args, env);
  const index = readPluginDevIndex({ indexFile });
  const root = dirname(index.indexFile);
  return Object.entries(index.sources).map(([id, source]) => {
    const directory = index.directories[id];
    let ancestor = root;
    for (const segment of relative(root, directory).split(sep)) {
      ancestor = resolve(ancestor, segment);
      if (lstatSync(ancestor, { throwIfNoEntry: false })?.isSymbolicLink())
        throw new Error(`Plugin ${id} checkout must not traverse a link`);
    }
    if (!existsSync(directory) || readdirSync(directory).length === 0) {
      mkdirSync(root, { recursive: true });
      run(root, [
        "clone",
        "--config",
        "core.autocrlf=false",
        "--config",
        "core.eol=lf",
        "--branch",
        source.branch,
        "--single-branch",
        "--",
        source.repository,
        directory,
      ]);
    }
    if (realpathSync(run(directory, ["rev-parse", "--show-toplevel"])) !== realpathSync(directory))
      throw new Error(`Plugin ${id} must have its own Git repository`);
    const origin = run(directory, ["config", "--get", "remote.origin.url"]).replace(/\.git$/, "");
    if (origin !== source.repository.replace(/\.git$/, ""))
      throw new Error(`Plugin ${id} origin does not match its source subscription`);
    const branch = run(directory, ["branch", "--show-current"]);
    const dirty = run(directory, ["status", "--porcelain"]);
    let status = "preserved";
    // Preserve all edits, feature branches and local commits. A detached former
    // submodule may join main only when it is an ancestor of the remote branch.
    if (update && !dirty && (!branch || branch === source.branch)) {
      run(directory, ["fetch", "--tags", "origin", source.branch]);
      const remote = `refs/remotes/origin/${source.branch}`;
      const local = `refs/heads/${source.branch}`;
      const localBranch = run(directory, ["for-each-ref", "--format=%(objectname)", local]);
      if (
        run(directory, ["rev-list", "--count", `${remote}..HEAD`]) === "0" &&
        (!localBranch || run(directory, ["rev-list", "--count", `${remote}..${local}`]) === "0")
      ) {
        if (!branch) {
          if (localBranch) run(directory, ["switch", source.branch]);
          else run(directory, ["switch", "-c", source.branch, "--track", remote]);
        }
        run(directory, ["merge", "--ff-only", remote]);
        status = "current";
      }
    }
    const plugin = resolvePluginDevPath(index, id);
    return {
      ...plugin,
      branch: run(directory, ["branch", "--show-current"]),
      subscribedBranch: source.branch,
      revision: run(directory, ["rev-parse", "HEAD"]),
      status,
    };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--update"))
    throw new Error("Usage: prepare-plugin-sources.mjs [--update]");
  console.log(JSON.stringify(preparePluginSources({ update: args.includes("--update") }), null, 2));
}
