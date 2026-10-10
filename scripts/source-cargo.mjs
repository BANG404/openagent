import { execFileSync } from "node:child_process";
import path from "node:path";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

/** Private development builds share dependency output across this repository's
 * worktrees. Cargo still validates source, toolchain, flags and lockfile inputs.
 * @param {{ repositoryRoot: string; profile?: string; platform?: string;
 * environment?: NodeJS.ProcessEnv; commonGitDirectory?: string }} options
 */
export function sourceCargoEnvironment({
  repositoryRoot,
  profile = "dev",
  platform = process.platform,
  environment = process.env,
  commonGitDirectory,
}) {
  if (!["dev", "release"].includes(profile))
    throw new Error(`Unsupported Cargo profile: ${profile}`);
  let targetDirectory = environment.CARGO_TARGET_DIR?.trim();
  if (!targetDirectory && profile === "dev") {
    const common =
      commonGitDirectory ??
      execFileSync("git", ["rev-parse", "--git-common-dir"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }).trim();
    targetDirectory = path.join(common, "openagent-source-target", platform);
  }
  return {
    ...environment,
    CARGO_TARGET_DIR: path.resolve(repositoryRoot, targetDirectory || path.join("sdk", "target")),
    ...(platform === "win32" ? { CARGO_INCREMENTAL: "0" } : {}),
  };
}

/** The directory Cargo writes one profile to. An explicit target adds Cargo's
 * triple subdirectory; without one, output stays directly under the target
 * directory beside every other artifact built for the host.
 * @param {string} targetDirectory
 * @param {string} profileDirectory
 * @param {string | undefined} cargoTarget
 */
export function cargoProfileDirectory(targetDirectory, profileDirectory, cargoTarget) {
  return path.join(targetDirectory, ...(cargoTarget ? [cargoTarget] : []), profileDirectory);
}

/** Hold the shared-output lock through Cargo AND staging the resulting bytes.
 * An interrupted owner leaves a visible lock; never remove another process's
 * lock automatically. A caller may remove it only after confirming it is dead.
 * @template T
 * @param {string} targetDirectory
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
export async function withSourceCargoLock(targetDirectory, operation) {
  await mkdir(targetDirectory, { recursive: true });
  const lockPath = path.join(targetDirectory, ".openagent-source.lock");
  let handle;
  let waiting = false;
  const started = Date.now();
  while (!handle) {
    try {
      handle = await open(lockPath, "wx");
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== "EEXIST") throw error;
      const owner = Number(await readFile(lockPath, "utf8").catch(() => ""));
      if (Number.isInteger(owner) && owner > 0) {
        try {
          process.kill(owner, 0);
        } catch (cause) {
          if (/** @type {NodeJS.ErrnoException} */ (cause).code === "ESRCH") {
            throw new Error(
              `Interrupted source build (PID ${owner}). Confirm it has stopped, then remove ${lockPath}.`,
              { cause },
            );
          }
          throw cause;
        }
      }
      if (!waiting) console.log(`Waiting for source build lock: ${lockPath}`);
      waiting = true;
      if (Date.now() - started > 120_000)
        throw new Error(
          `Source build lock is still busy: ${lockPath}. Wait for its owner before retrying.`,
          { cause: error },
        );
      await setTimeout(250);
    }
  }
  try {
    await handle.writeFile(String(process.pid));
    return await operation();
  } finally {
    await handle.close();
    await unlink(lockPath);
  }
}
