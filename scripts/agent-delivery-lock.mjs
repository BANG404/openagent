import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export const DIRECT_LOCK_TTL_MS = 15 * 60 * 1_000;

/** @param {string} repo */
function commonDirectory(repo) {
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: repo,
    encoding: "utf8",
  }).trim();
  return isAbsolute(common) ? resolve(common) : resolve(repo, common);
}

/** @param {string} repo */
export function directLockPath(repo) {
  return resolve(commonDirectory(repo), "openagent-owt", "direct.lock");
}

/** @param {unknown} error */
function errorCode(error) {
  return error instanceof Error && "code" in error
    ? /** @type {NodeJS.ErrnoException} */ (error).code
    : undefined;
}

/** @param {number} pid */
function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

/**
 * @param {string} lockPath
 * @param {number} [now]
 */
export function inspectDirectLock(lockPath, now = Date.now()) {
  if (!existsSync(lockPath)) return { active: false, stale: false };
  let owner;
  try {
    owner = JSON.parse(readFileSync(resolve(lockPath, "owner.json"), "utf8"));
  } catch {
    owner = {};
  }
  const acquiredMs = Date.parse(owner.acquiredAt ?? "");
  const ageMs = Number.isFinite(acquiredMs)
    ? Math.max(0, now - acquiredMs)
    : Number.POSITIVE_INFINITY;
  const live = processIsAlive(owner.pid);
  return {
    active: true,
    stale: ageMs > DIRECT_LOCK_TTL_MS && !live,
    live,
    ageMs,
    ttlMs: DIRECT_LOCK_TTL_MS,
    owner,
  };
}

/** @param {string} lockPath @param {{ taskId: string }} owner */
export function acquireDirectLock(lockPath, owner) {
  mkdirSync(dirname(lockPath), { recursive: true });
  const current = inspectDirectLock(lockPath);
  if (current.active && !current.stale) {
    throw new Error(`Direct delivery lock is held by ${current.owner?.taskId ?? "another task"}.`);
  }
  if (current.stale) {
    const stalePath = `${lockPath}.stale-${randomUUID()}`;
    try {
      renameSync(lockPath, stalePath);
      rmSync(stalePath, { recursive: true, force: true });
    } catch {
      // Another process reclaimed the stale lock first.
    }
  }
  try {
    mkdirSync(lockPath);
    writeFileSync(
      resolve(lockPath, "owner.json"),
      `${JSON.stringify({ ...owner, pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
      "utf8",
    );
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      throw new Error("Direct delivery lock was acquired concurrently; retry the task.", {
        cause: error,
      });
    }
    throw error;
  }
}

/** @param {string} lockPath */
export function releaseDirectLock(lockPath) {
  if (!existsSync(lockPath)) return;
  const owner = inspectDirectLock(lockPath).owner;
  if (owner?.pid !== process.pid) {
    throw new Error("Refusing to release a direct delivery lock owned by another process.");
  }
  rmSync(lockPath, { recursive: true, force: true });
}

/**
 * @template T
 * @param {string} lockPath
 * @param {{ taskId: string }} owner
 * @param {() => T} callback
 */
export function withDirectLock(lockPath, owner, callback) {
  acquireDirectLock(lockPath, owner);
  try {
    return callback();
  } finally {
    releaseDirectLock(lockPath);
  }
}

/** @param {string[]} args */
function parseRun(args) {
  const separator = args.indexOf("--");
  if (separator === -1) throw new Error("run requires -- before the command to execute.");
  const options = args.slice(0, separator);
  const command = args.slice(separator + 1);
  const taskIndex = options.indexOf("--task");
  if (taskIndex === -1 || !options[taskIndex + 1]) {
    throw new Error("run requires --task <task-id>.");
  }
  if (command.length === 0) throw new Error("run requires a command after --.");
  return { taskId: options[taskIndex + 1], command };
}

/** @param {string} repo @param {string[]} command @param {{ taskId: string }} owner */
export function runWithDirectLock(repo, command, owner) {
  const lockPath = directLockPath(repo);
  acquireDirectLock(lockPath, owner);
  return new Promise((resolveResult, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: repo,
      env: process.env,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
    });
    child.once("error", (error) => {
      releaseDirectLock(lockPath);
      reject(error);
    });
    child.once("close", (code, signal) => {
      releaseDirectLock(lockPath);
      resolveResult({ code, signal });
    });
  });
}

function usage() {
  return `Usage:
  bun scripts/agent-delivery-lock.mjs status --repo <path>
  bun scripts/agent-delivery-lock.mjs run --repo <path> --task <task-id> -- <command> [args]
`;
}

async function main() {
  const [command = "status", ...args] = process.argv.slice(2);
  const repoIndex = args.indexOf("--repo");
  const repo = repoIndex === -1 ? "." : args[repoIndex + 1];
  if (!repo) throw new Error("--repo requires a path.");
  const lockPath = directLockPath(repo);
  if (command === "status") {
    console.log(JSON.stringify({ lockPath, ...inspectDirectLock(lockPath) }, null, 2));
    return;
  }
  if (command === "run") {
    const parsed = parseRun(args);
    const result = await runWithDirectLock(repo, parsed.command, { taskId: parsed.taskId });
    if (result.code !== 0) process.exitCode = result.code ?? 1;
    return;
  }
  throw new Error(`Unknown command: ${command}\n${usage()}`);
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
