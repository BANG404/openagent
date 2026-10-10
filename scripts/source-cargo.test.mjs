import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cargoProfileDirectory,
  sourceCargoEnvironment,
  withSourceCargoLock,
} from "./source-cargo.mjs";
import {
  runtimeVerificationPlan,
  runRuntimeVerification,
  passedRuntimeTests,
} from "./verify-runtime.mjs";

test("worktrees share private dependency output while explicit targets and releases remain authoritative", () => {
  const commonGitDirectory = path.resolve("repository/.git");
  const options = { commonGitDirectory, platform: "win32", environment: {} };
  const first = sourceCargoEnvironment({ ...options, repositoryRoot: path.resolve("worktree-a") });
  const second = sourceCargoEnvironment({ ...options, repositoryRoot: path.resolve("worktree-b") });
  expect(first.CARGO_TARGET_DIR).toBe(second.CARGO_TARGET_DIR);
  expect(first.CARGO_INCREMENTAL).toBe("0");
  expect(
    sourceCargoEnvironment({
      ...options,
      repositoryRoot: path.resolve("worktree-a"),
      environment: { CARGO_TARGET_DIR: "custom" },
    }).CARGO_TARGET_DIR,
  ).toBe(path.resolve("worktree-a/custom"));
  expect(
    sourceCargoEnvironment({
      ...options,
      repositoryRoot: path.resolve("worktree-a"),
      profile: "release",
    }).CARGO_TARGET_DIR,
  ).toBe(path.resolve("worktree-a/sdk/target"));
});

test("only an explicit Cargo target adds the triple directory to staged bytes", () => {
  const targetDirectory = path.resolve("repository/sdk/target");
  expect(cargoProfileDirectory(targetDirectory, "debug", undefined)).toBe(
    path.join(targetDirectory, "debug"),
  );
  expect(cargoProfileDirectory(targetDirectory, "debug", "x86_64-pc-windows-msvc")).toBe(
    path.join(targetDirectory, "x86_64-pc-windows-msvc", "debug"),
  );
});

test("a shared build keeps its staging lock until bytes are consumed, and failure releases it", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "openagent-source-lock-test-"));
  try {
    const events = [];
    let started;
    const entered = new Promise((resolve) => {
      started = resolve;
    });
    const first = withSourceCargoLock(directory, async () => {
      events.push("build");
      started();
      await new Promise((resolve) => setTimeout(resolve, 80));
      events.push("stage");
    });
    await entered;
    await Promise.all([
      first,
      withSourceCargoLock(directory, async () => {
        events.push("next-build");
      }),
    ]);
    expect(events).toEqual(["build", "stage", "next-build"]);
    await expect(
      withSourceCargoLock(directory, async () => {
        throw new Error("compile failed");
      }),
    ).rejects.toThrow("compile failed");
    expect(await withSourceCargoLock(directory, async () => "retry")).toBe("retry");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("focused failure stops workspace qualification and focused-only mode never requests it", () => {
  const options = {
    packageName: "openagent-runtime",
    testTarget: "incident",
    caseName: "regression",
    targetTriple: "x86_64-pc-windows-msvc",
  };
  const plan = runtimeVerificationPlan({ ...options, qualify: true });
  const calls = [];
  expect(
    runRuntimeVerification(plan, (args) => {
      calls.push(args);
      return 101;
    }),
  ).toBe(101);
  expect(calls).toHaveLength(1);
  expect(runtimeVerificationPlan(options)).toHaveLength(1);
  expect(plan[0]).toContain("--exact");
  expect(plan[1]).toContain("--workspace");
  expect(plan[1]).not.toContain("--test");
});

test("qualification runs serially after the focused case passes", () => {
  const calls = [];
  expect(
    runRuntimeVerification([["focused"], ["workspace"]], (args) => {
      calls.push(args[0]);
      return 0;
    }),
  ).toBe(0);
  expect(calls).toEqual(["focused", "workspace"]);
});

test("source edits invalidate the focused pass before full qualification", () => {
  let source = "before";
  const calls = [];
  expect(() =>
    runRuntimeVerification(
      [["focused"], ["workspace"]],
      (args) => {
        calls.push(args[0]);
        source = "edited";
        return 0;
      },
      () => source,
    ),
  ).toThrow("Source changed");
  expect(calls).toEqual(["focused"]);
});

test("zero matches and ignored cases are not evidence of a focused pass", () => {
  expect(passedRuntimeTests("test result: ok. 0 passed; 0 failed; 1 ignored;")).toBe(0);
  expect(passedRuntimeTests("test result: ok. 1 passed; 0 failed; 0 ignored;")).toBe(1);
});
