import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @param {string} repositoryRoot */
export function runtimeServerReloadStampPath(repositoryRoot = root) {
  return path.join(repositoryRoot, "src-tauri", "runtime-server-watch", "revision.json");
}

/** @param {string} repositoryRoot */
export function runtimeServerPendingStampPath(repositoryRoot = root) {
  return path.join(repositoryRoot, "runtime-server-pending", "revision.json");
}

/**
 * @param {string | undefined} repositoryRoot
 * @param {{ revision: number, updatedAt?: string }} value
 */
export async function writeRuntimeServerReloadStamp(
  repositoryRoot = root,
  { revision, updatedAt = new Date().toISOString() },
) {
  const stamp = runtimeServerReloadStampPath(repositoryRoot);
  await mkdir(path.dirname(stamp), { recursive: true });
  await writeFile(stamp, `${JSON.stringify({ revision, updatedAt })}\n`);
  return stamp;
}

/**
 * @param {string | undefined} repositoryRoot
 * @param {{ revision: number, updatedAt?: string }} value
 */
export async function writeRuntimeServerPendingStamp(
  repositoryRoot = root,
  { revision, updatedAt = new Date().toISOString() },
) {
  const stamp = runtimeServerPendingStampPath(repositoryRoot);
  await mkdir(path.dirname(stamp), { recursive: true });
  await writeFile(stamp, `${JSON.stringify({ revision, updatedAt })}\n`);
  return stamp;
}
