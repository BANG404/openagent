import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  runtimeServerDevWatchTargets,
  runtimeServerReloadStampPath,
  startRuntimeServerDevWatcher,
  writeRuntimeServerReloadStamp,
} from "./dev-with-runtime-server.mjs";

test("watches only Runtime server source inputs before requesting a Tauri reload", () => {
  const targets = runtimeServerDevWatchTargets("C:/openagent");
  expect(targets).toEqual([
    { path: path.join("C:/openagent", "sdk", "rust"), recursive: true },
    { path: path.join("C:/openagent", "sdk", "Cargo.toml"), recursive: false },
    { path: path.join("C:/openagent", "sdk", "Cargo.lock"), recursive: false },
  ]);
});

test("writes the reload signal only after a server build is ready", async () => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "openagent-runtime-watch-"));
  try {
    const stamp = await writeRuntimeServerReloadStamp(repositoryRoot, {
      revision: 7,
      updatedAt: "2026-08-30T12:00:00.000Z",
    });
    expect(stamp).toBe(runtimeServerReloadStampPath(repositoryRoot));
    expect(JSON.parse(await readFile(stamp, "utf8"))).toEqual({
      revision: 7,
      updatedAt: "2026-08-30T12:00:00.000Z",
    });
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("rebuilds changed Runtime sources before emitting the reload stamp", async () => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "openagent-runtime-watch-"));
  const rustRoot = path.join(repositoryRoot, "sdk", "rust");
  await mkdir(rustRoot, { recursive: true });
  await writeFile(path.join(repositoryRoot, "sdk", "Cargo.toml"), "[workspace]\n");
  await writeFile(path.join(repositoryRoot, "sdk", "Cargo.lock"), "");
  let builds = 0;
  const watcher = startRuntimeServerDevWatcher({
    repositoryRoot,
    prepare: async () => {
      builds += 1;
      return { changed: true };
    },
  });
  try {
    await writeFile(path.join(rustRoot, "changed.rs"), "fn changed() {}\n");
    const stampPath = runtimeServerReloadStampPath(repositoryRoot);
    let stamp;
    for (let attempt = 0; attempt < 100 && !stamp; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      try {
        stamp = JSON.parse(await readFile(stampPath, "utf8"));
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    expect(builds).toBe(1);
    expect(stamp?.revision).toBe(1);
  } finally {
    watcher.close();
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});
