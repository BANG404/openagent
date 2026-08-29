import { expect, test } from "bun:test";
import path from "node:path";

import { parseRustHost, runtimeServerPaths, tauriTarget } from "./prepare-runtime-server.mjs";

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
