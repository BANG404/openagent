import { execFileSync } from "node:child_process";
import { readdirSync, readlinkSync } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { defaultTauriDevTargetRoot, resolveTauriDevTargetDirectory } from "./tauri-dev-target.mjs";

const markerName = ".openagent-dev-cache.json";
const idleMilliseconds = 7 * 24 * 60 * 60 * 1000;

/** @param {string} value */
function identity(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** @param {unknown} pid */
function running(pid) {
  if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error).code !== "ESRCH";
  }
}

/** Fail closed if process discovery is unavailable. Never print command lines.
 * @returns {string[]} */
export function activeExecutablePaths() {
  if (process.platform === "win32") {
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference = 'Stop'; @(Get-CimInstance Win32_Process | ForEach-Object { $_.ExecutablePath } | Where-Object { $_ }) | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    const values = /** @type {unknown} */ (JSON.parse(output || "[]"));
    if (!Array.isArray(values) || values.some((value) => typeof value !== "string"))
      throw new Error("Cannot establish active executable paths; cache cleanup was skipped.");
    return values;
  }
  if (process.platform === "linux") {
    return readdirSync("/proc")
      .filter((name) => /^\d+$/.test(name))
      .flatMap((pid) => {
        try {
          return [readlinkSync(`/proc/${pid}/exe`)];
        } catch (error) {
          if (
            ["ENOENT", "ESRCH", "EACCES"].includes(
              /** @type {NodeJS.ErrnoException} */ (error).code ?? "",
            )
          )
            return [];
          throw error;
        }
      });
  }
  return execFileSync("ps", ["-ax", "-o", "comm="], { encoding: "utf8" })
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => path.isAbsolute(value));
}

/** @param {string} directory @param {string[]} activePaths */
function active(directory, activePaths) {
  const prefix = identity(directory) + path.sep;
  return activePaths.some((file) => identity(file).startsWith(prefix));
}

/** @param {string} file @returns {Promise<Record<string, unknown> | null>} */
async function json(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`Invalid development cache metadata: ${file}`);
    return value;
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") return null;
    throw error;
  }
}

/** Reject root/candidate junctions and verify the exact direct child before deleting.
 * @param {string} root @param {string} candidate */
async function safeChild(root, candidate) {
  const rootStat = await lstat(root);
  const candidateStat = await lstat(candidate);
  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    !candidateStat.isDirectory() ||
    candidateStat.isSymbolicLink()
  )
    return false;
  return identity(path.dirname(await realpath(candidate))) === identity(await realpath(root));
}

/** Serialize collectors; a crashed collector leaves a visible PID-bearing lock.
 * @template T
 * @param {string} root @param {() => Promise<T>} operation @param {boolean} [wait] */
async function collect(root, operation, wait = false) {
  const stat = await lstat(root).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) return null;
  const lock = path.join(root, ".openagent-cache-cleanup.lock");
  let handle;
  const deadline = Date.now() + 60_000;
  do {
    handle = await open(lock, "wx").catch((error) => {
      if (error.code === "EEXIST") return null;
      throw error;
    });
    if (handle || !wait) break;
    if (Date.now() >= deadline)
      throw new Error(`Development cache maintenance is busy; inspect ${lock} and its owner PID.`);
    await setTimeout(100);
  } while (!handle);
  if (!handle) return null;
  try {
    await handle.writeFile(String(process.pid));
    return await operation();
  } finally {
    await handle.close();
    await unlink(lock);
  }
}

/** Staging and collection use the same per-target lock.
 * @template T
 * @param {string} repositoryRoot @param {string} targetTriple @param {() => Promise<T>} operation */
export async function withDevelopmentRuntimeCache(repositoryRoot, targetTriple, operation) {
  if (!/^[a-zA-Z0-9_-]+$/.test(targetTriple)) throw new Error("Invalid Runtime target triple.");
  const root = path.join(repositoryRoot, ".cache", "development-runtime", targetTriple);
  await mkdir(root, { recursive: true });
  const result = await collect(root, operation, true);
  if (result === null) throw new Error("Runtime cache root must be a regular directory.");
  return result;
}

/** @param {string} repositoryRoot */
function repositoryWorktrees(repositoryRoot) {
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  return {
    common: identity(path.resolve(repositoryRoot, git(["rev-parse", "--git-common-dir"]))),
    worktrees: git(["worktree", "list", "--porcelain", "-z"])
      .split("\0")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice(9)),
  };
}

/** Register only launcher-owned output. Explicit Cargo target overrides are unmanaged.
 * @param {string} directory @param {string} repositoryRoot */
export async function registerDevelopmentTarget(directory, repositoryRoot) {
  const { common } = repositoryWorktrees(repositoryRoot);
  await mkdir(directory, { recursive: true });
  if (!(await safeChild(path.dirname(directory), directory)))
    throw new Error("Development target must be a regular cache directory.");
  await writeFile(
    path.join(directory, markerName),
    JSON.stringify({
      version: 1,
      repository: path.resolve(repositoryRoot),
      common,
      lastUsed: Date.now(),
      pid: process.pid,
    }) + "\n",
  );
}

/** Reclaim removed worktrees and old fixture caches. Legacy adoption is explicit.
 * @param {{repositoryRoot: string; root?: string; apply?: boolean; includeLegacy?: boolean;
 * activePaths?: string[]; now?: number}} options */
export async function cleanDevelopmentTargets({
  repositoryRoot,
  root = defaultTauriDevTargetRoot(),
  apply = false,
  includeLegacy = false,
  activePaths = activeExecutablePaths(),
  now = Date.now(),
}) {
  const { common, worktrees } = repositoryWorktrees(repositoryRoot);
  const registered = new Set(worktrees.map(identity));
  const protectedTargets = new Set(
    worktrees
      .flatMap((worktree) => [
        resolveTauriDevTargetDirectory(worktree, {
          environment: { ...process.env, OPENAGENT_HOME: undefined },
        }),
        resolveTauriDevTargetDirectory(worktree, {
          environment: {
            ...process.env,
            OPENAGENT_HOME: path.join(os.homedir(), ".openagent-dev"),
          },
        }),
        resolveTauriDevTargetDirectory(worktree),
      ])
      .map(identity),
  );
  const defaultRoot = identity(
    defaultTauriDevTargetRoot({
      environment: {
        ...process.env,
        OPENAGENT_DEV_TARGET_ROOT: undefined,
      },
    }),
  );
  const baseName = path.basename(worktrees[0] || repositoryRoot);
  /** @type {{path: string; reason: string; removed: boolean}[]} */
  const results = [];
  await collect(root, async () => {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const directory = path.join(root, entry.name);
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        protectedTargets.has(identity(directory)) ||
        active(directory, activePaths) ||
        !(await safeChild(root, directory))
      )
        continue;
      const marker = await json(path.join(directory, markerName));
      let reason;
      if (marker) {
        if (
          marker.version !== 1 ||
          marker.common !== common ||
          typeof marker.repository !== "string" ||
          typeof marker.lastUsed !== "number" ||
          !Number.isFinite(marker.lastUsed) ||
          running(marker.pid)
        )
          continue;
        if (registered.has(identity(marker.repository)) && now - marker.lastUsed < idleMilliseconds)
          continue;
        reason = registered.has(identity(marker.repository)) ? "idle fixture" : "removed worktree";
      } else {
        if (
          !includeLegacy ||
          identity(root) !== defaultRoot ||
          !(entry.name.startsWith(baseName + "-") && /-[a-f0-9]{16}$/.test(entry.name))
        )
          continue;
        const sourceSibling = path.join(
          path.dirname(worktrees[0] || repositoryRoot),
          entry.name.slice(0, -17),
        );
        if (
          await lstat(sourceSibling).then(
            (stat) => stat.isDirectory(),
            () => false,
          )
        )
          continue;
        const cargoTag = await readFile(path.join(directory, "CACHEDIR.TAG"), "utf8").catch(
          () => "",
        );
        if (!cargoTag.startsWith("Signature: 8a477f597d28d172789f06886806bc55")) continue;
        reason = "legacy task target";
      }
      // Recheck paths and processes at the destructive boundary.
      if (
        apply &&
        (await safeChild(root, directory)) &&
        !active(directory, activeExecutablePaths())
      ) {
        await rm(directory, { recursive: true });
        results.push({ path: directory, reason, removed: true });
      } else results.push({ path: directory, reason, removed: false });
    }
  });
  return results;
}

/** Keep current selection, active images and the newest three versions.
 * @param {{repositoryRoot: string; targetTriple: string; destination: string;
 * apply?: boolean; activePaths?: string[]}} options */
export async function cleanDevelopmentRuntimeImages({
  repositoryRoot,
  targetTriple,
  destination,
  apply = false,
  activePaths = activeExecutablePaths(),
}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(targetTriple)) throw new Error("Invalid Runtime target triple.");
  const root = path.join(repositoryRoot, ".cache", "development-runtime", targetTriple);
  /** @type {{path: string; reason: string; removed: boolean}[]} */
  const results = [];
  await collect(root, async () => {
    const selection = await json(`${destination}.selection.json`);
    if (
      !selection ||
      selection.schema_version !== 1 ||
      typeof selection.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(selection.sha256)
    )
      throw new Error("Cannot establish selected Runtime; cache cleanup was skipped.");
    const entries = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !/^[a-f0-9]{64}$/.test(entry.name))
        continue;
      const directory = path.join(root, entry.name);
      if (!(await safeChild(root, directory))) continue;
      const stat = await lstat(directory);
      entries.push({ directory, digest: entry.name, time: stat.mtimeMs });
    }
    entries.sort((a, b) => b.time - a.time || a.digest.localeCompare(b.digest));
    const retained = new Set(entries.slice(0, 3).map((entry) => entry.digest));
    retained.add(selection.sha256);
    for (const entry of entries) {
      if (retained.has(entry.digest) || active(entry.directory, activePaths)) continue;
      if (apply) {
        const current = await json(`${destination}.selection.json`);
        if (
          !current ||
          current.sha256 === entry.digest ||
          active(entry.directory, activeExecutablePaths()) ||
          !(await safeChild(root, entry.directory))
        )
          continue;
        await rm(entry.directory, { recursive: true });
      }
      results.push({ path: entry.directory, reason: "old Runtime image", removed: apply });
    }
  });
  return results;
}
