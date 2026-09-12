// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { addDevUrlConfigArgument, findAvailableLoopbackPort } from "../scripts/tauri-dev-port.mjs";
import {
  applyDevelopmentInstanceEnvironment,
  normalizeDevelopmentInstanceName,
  parseDevelopmentInstanceArguments,
} from "../scripts/tauri-dev-instance.mjs";
import {
  addCargoTargetDirectoryArgument,
  defaultTauriDevTargetRoot,
  resolveTauriDevTargetDirectory,
} from "../scripts/tauri-dev-target.mjs";

describe("Tauri development port selection", () => {
  test("selects an ephemeral TCP port", async () => {
    const port = await findAvailableLoopbackPort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);
  });

  test("passes the selected URL to the Tauri CLI", () => {
    expect(addDevUrlConfigArgument(["dev", "--verbose"], 54321)).toEqual([
      "dev",
      "--verbose",
      "--config",
      '{"build":{"devUrl":"http://localhost:54321"}}',
    ]);
  });

  test("places configuration before runner arguments", () => {
    expect(addDevUrlConfigArgument(["dev", "--", "--features", "fixture"], 54321)).toEqual([
      "dev",
      "--config",
      '{"build":{"devUrl":"http://localhost:54321"}}',
      "--",
      "--features",
      "fixture",
    ]);
  });
});

describe("Tauri development multi-instance selection", () => {
  test("removes the OpenAgent multi-instance option before invoking Tauri", () => {
    expect(
      parseDevelopmentInstanceArguments(["dev", "--multi-instance=agent-a", "--verbose"]),
    ).toEqual({
      arguments_: ["dev", "--verbose"],
      instanceName: "agent-a",
    });
  });

  test("keeps Cargo and application arguments after the runner delimiter", () => {
    expect(
      parseDevelopmentInstanceArguments([
        "dev",
        "--multi-instance",
        "agent-a",
        "--",
        "--target-dir",
        "/tmp/target",
        "--",
        "--openagent-workspace-window",
      ]),
    ).toEqual({
      arguments_: [
        "dev",
        "--",
        "--target-dir",
        "/tmp/target",
        "--",
        "--openagent-workspace-window",
      ],
      instanceName: "agent-a",
    });
  });

  test("normalizes instance names and isolates the default data root", () => {
    expect(normalizeDevelopmentInstanceName("agent/a")).toBe("agent-a");
    expect(
      applyDevelopmentInstanceEnvironment({}, "agent-a", {
        homeDirectory: "/home/example",
      }),
    ).toEqual({
      OPENAGENT_DEV_MULTI_INSTANCE: "1",
      OPENAGENT_DEV_INSTANCE: "agent-a",
      OPENAGENT_HOME: "/home/example/.openagent-dev/instances/agent-a",
    });
  });

  test("preserves an explicitly selected data root", () => {
    expect(
      applyDevelopmentInstanceEnvironment({ OPENAGENT_HOME: "/tmp/fixture" }, "agent-a", {
        homeDirectory: "/home/example",
      }).OPENAGENT_HOME,
    ).toBe("/tmp/fixture");
  });

  test("rejects an unnamed or repeated multi-instance option", () => {
    expect(() => parseDevelopmentInstanceArguments(["dev", "--multi-instance"])).toThrow(
      "--multi-instance requires a non-empty instance name",
    );
    expect(() =>
      parseDevelopmentInstanceArguments(["dev", "--multi-instance=a", "--multi-instance=b"]),
    ).toThrow("--multi-instance may only be specified once");
  });
});

describe("Tauri development target isolation", () => {
  test("places Cargo target selection before application arguments", () => {
    expect(
      addCargoTargetDirectoryArgument(
        ["dev", "--no-watch", "--", "--", "--openagent-workspace-window", "C:/repo"],
        "C:/cache/openagent",
      ),
    ).toEqual([
      "dev",
      "--no-watch",
      "--",
      "--target-dir",
      "C:/cache/openagent",
      "--",
      "--openagent-workspace-window",
      "C:/repo",
    ]);
  });

  test("creates Cargo runner arguments when none were supplied", () => {
    expect(addCargoTargetDirectoryArgument(["dev", "--verbose"], "C:/cache/openagent")).toEqual([
      "dev",
      "--verbose",
      "--",
      "--target-dir",
      "C:/cache/openagent",
    ]);
  });

  test("preserves an explicit Cargo runner target directory", () => {
    const arguments_ = ["dev", "--", "--target-dir", "C:/explicit", "--", "fixture"];
    expect(addCargoTargetDirectoryArgument(arguments_, "C:/derived")).toEqual(arguments_);
  });

  test("uses a stable cache per worktree and OPENAGENT_HOME fixture", () => {
    const options = {
      platform: "win32" as const,
      homeDirectory: "C:/Users/example",
      environment: { LOCALAPPDATA: "C:/Users/example/AppData/Local" },
    };
    const ordinary = resolveTauriDevTargetDirectory("C:/work/openagent", options);
    expect(resolveTauriDevTargetDirectory("C:/work/openagent", options)).toBe(ordinary);
    expect(resolveTauriDevTargetDirectory("C:/work/openagent-other", options)).not.toBe(ordinary);
    expect(
      resolveTauriDevTargetDirectory("C:/work/openagent", {
        ...options,
        environment: {
          ...options.environment,
          OPENAGENT_HOME: "C:/fixtures/focus",
        },
      }),
    ).not.toBe(ordinary);
    expect(defaultTauriDevTargetRoot(options)).toBe(
      "C:\\Users\\example\\AppData\\Local\\OpenAgent\\dev-targets",
    );
  });
});

test("Tauri development defers frontend and Runtime reloads through the component barrier", () => {
  const vite = readFileSync("vite.config.js", "utf8");
  const updater = readFileSync("src/lib/appUpdater.ts", "utf8");
  const runtimeWatcher = readFileSync("scripts/dev-with-runtime-server.mjs", "utf8");

  expect(vite).toContain('event: "openagent:component-update-pending"');
  expect(vite).toContain('server.ws.on("openagent:component-update-ready"');
  expect(updater).toContain('hot.on("openagent:component-update-pending"');
  expect(updater).toContain('invoke<ComponentUpdateGate>("begin_component_update")');
  expect(runtimeWatcher).toContain("writeRuntimeServerPendingStamp(repositoryRoot");
  expect(runtimeWatcher).not.toContain(
    "writeRuntimeServerReloadStamp(repositoryRoot, { revision });",
  );
});
