import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  materializeRuntimeServerPlaceholder,
  parseRustHost,
  prepareRuntimeServer,
  requirePreparedRuntimeServer,
  runtimeServerPaths,
  tauriTarget,
} from "./prepare-runtime-server.mjs";

test("parses the exact rust host triple", () => {
  expect(parseRustHost("rustc 1.90.0\nhost: x86_64-pc-windows-msvc\nrelease: 1.90.0")).toBe(
    "x86_64-pc-windows-msvc",
  );
});

test("maps Tauri cross-build environment to the requested target", () => {
  expect(tauriTarget("macos", "x86_64")).toBe("x86_64-apple-darwin");
  expect(tauriTarget("macos", "aarch64")).toBe("aarch64-apple-darwin");
  expect(tauriTarget("windows", "x86_64")).toBe("x86_64-pc-windows-msvc");
  expect(tauriTarget("linux", "x86_64")).toBe("x86_64-unknown-linux-gnu");
  expect(tauriTarget("linux", "aarch64")).toBeUndefined();
});

test("prefers the explicit release target over Tauri's host environment", async () => {
  const previousTarget = process.env.OPENAGENT_RUNTIME_TARGET;
  const previousPlatform = process.env.TAURI_ENV_PLATFORM;
  const previousArchitecture = process.env.TAURI_ENV_ARCH;
  process.env.OPENAGENT_RUNTIME_TARGET = "unsupported-explicit-target";
  process.env.TAURI_ENV_PLATFORM = "macos";
  process.env.TAURI_ENV_ARCH = "aarch64";
  try {
    await expect(prepareRuntimeServer()).rejects.toThrow(
      "OpenAgent has no packaged runtime server for unsupported-explicit-target.",
    );
  } finally {
    if (previousTarget === undefined) delete process.env.OPENAGENT_RUNTIME_TARGET;
    else process.env.OPENAGENT_RUNTIME_TARGET = previousTarget;
    if (previousPlatform === undefined) delete process.env.TAURI_ENV_PLATFORM;
    else process.env.TAURI_ENV_PLATFORM = previousPlatform;
    if (previousArchitecture === undefined) delete process.env.TAURI_ENV_ARCH;
    else process.env.TAURI_ENV_ARCH = previousArchitecture;
  }
});

test("maps runtime server outputs to Tauri sidecar names", () => {
  const windows = runtimeServerPaths({
    repositoryRoot: "C:/openagent",
    targetTriple: "x86_64-pc-windows-msvc",
    profile: "release",
  });
  expect(windows.source).toBe(
    path.join(
      "C:/openagent",
      "sdk",
      "target",
      "x86_64-pc-windows-msvc",
      "release",
      "openagent-server.exe",
    ),
  );
  expect(windows.destination).toBe(
    path.join(
      "C:/openagent",
      "src-tauri",
      "binaries",
      "openagent-server-x86_64-pc-windows-msvc.exe",
    ),
  );

  const macos = runtimeServerPaths({
    repositoryRoot: "/openagent",
    targetTriple: "aarch64-apple-darwin",
    profile: "dev",
  });
  expect(macos.source).toBe(
    path.join("/openagent", "sdk", "target", "aarch64-apple-darwin", "debug", "openagent-server"),
  );
  expect(macos.destination).toBe(
    path.join("/openagent", "src-tauri", "binaries", "openagent-server-aarch64-apple-darwin"),
  );
});

test("rejects targets that the release matrix cannot publish", () => {
  expect(() =>
    runtimeServerPaths({
      repositoryRoot: "/openagent",
      targetTriple: "aarch64-unknown-linux-gnu",
      profile: "release",
    }),
  ).toThrow("no packaged runtime server");
});

test("requires non-empty staged bytes when release builds reuse a Runtime", async () => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "openagent-prebuilt-runtime-"));
  const paths = runtimeServerPaths({
    repositoryRoot,
    targetTriple: "x86_64-unknown-linux-gnu",
    profile: "release",
  });
  await expect(
    requirePreparedRuntimeServer({ ...paths, targetTriple: "x86_64-unknown-linux-gnu" }),
  ).rejects.toThrow(/sidecar is missing/);
  await writeFile(paths.destination, "runtime-bytes").catch(async (error) => {
    if (error?.code !== "ENOENT") throw error;
    await materializeRuntimeServerPlaceholder({
      repositoryRoot,
      targetTriple: "x86_64-unknown-linux-gnu",
    });
    await writeFile(paths.destination, "runtime-bytes");
  });
  expect(
    await requirePreparedRuntimeServer({ ...paths, targetTriple: "x86_64-unknown-linux-gnu" }),
  ).toEqual({ ...paths, targetTriple: "x86_64-unknown-linux-gnu", changed: false });
});

test("materializes a target-named placeholder without replacing real bytes", async () => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "openagent-runtime-placeholder-"));
  try {
    const first = await materializeRuntimeServerPlaceholder({
      repositoryRoot,
      targetTriple: "x86_64-pc-windows-msvc",
    });
    expect(await readFile(first.destination, "utf8")).toBe("");

    await writeFile(first.destination, "runtime-bytes");
    await materializeRuntimeServerPlaceholder({
      repositoryRoot,
      targetTriple: "x86_64-pc-windows-msvc",
    });
    expect(await readFile(first.destination, "utf8")).toBe("runtime-bytes");
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});
