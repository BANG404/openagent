import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { mkdir, open, readFile, readdir, unlink, writeFile } from "node:fs/promises";
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

/** Cargo's relative dep-info can consider another worktree's newer local crate
 * fresh. Preserve shared dependencies, but invalidate SDK packages when the
 * source checkout changes, under the same build and staging lock.
 * @template T
 * @param {{ repositoryRoot: string; environment: NodeJS.ProcessEnv;
 * cleanWorkspace?: () => Promise<void> }} options
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
export async function withSourceCargoWorkspaceLock(
  { repositoryRoot, environment, cleanWorkspace },
  operation,
) {
  const targetDirectory = environment.CARGO_TARGET_DIR;
  if (!targetDirectory) throw new Error("Source Cargo target directory is required");
  const sourceRoot = path.resolve(repositoryRoot);
  const identity = process.platform === "win32" ? sourceRoot.toLowerCase() : sourceRoot;
  return withSourceCargoLock(targetDirectory, async () => {
    const marker = path.join(targetDirectory, ".openagent-source-worktree");
    const previous = await readFile(marker, "utf8").catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    if (previous !== identity || (await foreignWorkspaceArtifacts(targetDirectory, sourceRoot))) {
      if (cleanWorkspace) await cleanWorkspace();
      else {
        const args = ["clean", "--manifest-path", path.join(sourceRoot, "sdk", "Cargo.toml")];
        for (const name of ["protocol", "runtime", "app", "server", "benchmark"])
          args.push("--package", `openagent-${name}`);
        const result = spawnSync(environment.CARGO ?? "cargo", args, {
          cwd: sourceRoot,
          env: environment,
          stdio: "inherit",
          windowsHide: true,
        });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error("Could not invalidate SDK worktree artifacts");
      }
      await writeFile(marker, identity);
    }
    return operation();
  });
}

/** Detect builds from older launchers that share the lock but do not update
 * the source marker. Cargo records CARGO_MANIFEST_DIR in local dep-info.
 * @param {string} targetDirectory
 * @param {string} sourceRoot
 */
async function foreignWorkspaceArtifacts(targetDirectory, sourceRoot) {
  const roots = [targetDirectory];
  for (const entry of await readdir(targetDirectory, { withFileTypes: true }))
    if (entry.isDirectory() && entry.name !== "debug" && entry.name !== "release")
      roots.push(path.join(targetDirectory, entry.name));
  for (const root of roots) {
    for (const profile of ["debug", "release"]) {
      const directory = path.join(root, profile, "deps");
      const files = await readdir(directory).catch((error) => {
        if (error.code !== "ENOENT") throw error;
        return [];
      });
      for (const file of files) {
        if (!/^openagent_(protocol|runtime|app|server|benchmark)-.*\.d$/.test(file)) continue;
        const info = await readFile(path.join(directory, file), "utf8");
        const manifest = /^# env-dep:CARGO_MANIFEST_DIR=(.+)$/m.exec(info)?.[1];
        if (!manifest) continue;
        const actual = path.resolve(
          manifest.trim().replaceAll("\\\\", "\\").replaceAll("\\ ", " "),
        );
        const normalized = process.platform === "win32" ? actual.toLowerCase() : actual;
        const crate = file.match(/^openagent_(\w+)-/)?.[1];
        const expected = path.join(sourceRoot, "sdk", "rust", `openagent-${crate}`);
        if (normalized !== (process.platform === "win32" ? expected.toLowerCase() : expected))
          return true;
      }
    }
  }
  return false;
}
