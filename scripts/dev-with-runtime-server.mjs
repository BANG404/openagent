import { watch } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { prepareRuntimeServer } from "./prepare-runtime-server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rebuildDelayMs = 250;

export function runtimeServerDevWatchTargets(repositoryRoot = root) {
  return [
    { path: path.join(repositoryRoot, "sdk", "rust"), recursive: true },
    { path: path.join(repositoryRoot, "sdk", "Cargo.toml"), recursive: false },
    { path: path.join(repositoryRoot, "sdk", "Cargo.lock"), recursive: false },
  ];
}

export function runtimeServerReloadStampPath(repositoryRoot = root) {
  return path.join(repositoryRoot, "src-tauri", "runtime-server-watch", "revision.json");
}

export async function writeRuntimeServerReloadStamp(
  repositoryRoot = root,
  { revision, updatedAt = new Date().toISOString() },
) {
  const stamp = runtimeServerReloadStampPath(repositoryRoot);
  await mkdir(path.dirname(stamp), { recursive: true });
  await writeFile(stamp, `${JSON.stringify({ revision, updatedAt })}\n`);
  return stamp;
}

export function startRuntimeServerDevWatcher({
  repositoryRoot = root,
  prepare = () => prepareRuntimeServer({ profile: "dev" }),
  onError = (error) => console.error(`[runtime-server] ${error?.stack ?? error}`),
} = {}) {
  let revision = 0;
  let debounce;
  let building = false;
  let pending = false;
  let closed = false;

  const rebuild = async () => {
    if (closed) return;
    if (building) {
      pending = true;
      return;
    }
    building = true;
    do {
      pending = false;
      try {
        console.log("[runtime-server] SDK source changed; rebuilding the debug server...");
        const result = await prepare();
        if (result.changed) {
          revision += 1;
          const stamp = await writeRuntimeServerReloadStamp(repositoryRoot, { revision });
          console.log(
            `[runtime-server] Prepared new server bytes; requested Tauri reload via ${stamp}.`,
          );
        } else {
          console.log("[runtime-server] Rebuild completed without a server byte change.");
        }
      } catch (error) {
        onError(error);
      }
    } while (pending && !closed);
    building = false;
  };

  const schedule = () => {
    if (closed) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => void rebuild(), rebuildDelayMs);
  };
  const watchers = runtimeServerDevWatchTargets(repositoryRoot).map((target) =>
    watch(target.path, { recursive: target.recursive }, schedule),
  );

  return {
    close() {
      closed = true;
      clearTimeout(debounce);
      for (const watcher of watchers) watcher.close();
    },
  };
}

async function main() {
  await prepareRuntimeServer({ profile: "dev" });
  await mkdir(path.dirname(runtimeServerReloadStampPath(root)), { recursive: true });
  const runtimeWatcher = startRuntimeServerDevWatcher();
  const vite = spawn(process.execPath, ["run", "dev"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });

  const stop = (signal) => {
    runtimeWatcher.close();
    if (!vite.killed) vite.kill(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  const exitCode = await new Promise((resolve, reject) => {
    vite.once("error", reject);
    vite.once("exit", (code) => resolve(code ?? 1));
  });
  runtimeWatcher.close();
  process.exit(exitCode);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
