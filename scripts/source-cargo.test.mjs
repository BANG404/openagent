import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cargoProfileDirectory,
  sourceCargoEnvironment,
  withSourceCargoLock,
  withSourceCargoWorkspaceLock,
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
  ).toBe(path.resolve("worktree-a/runtime/target"));
});

test("only an explicit Cargo target adds the triple directory to staged bytes", () => {
  const targetDirectory = path.resolve("repository/runtime/target");
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
  const ignoredPlan = runtimeVerificationPlan({ ...options, ignored: true });
  expect(ignoredPlan).toHaveLength(1);
  expect(ignoredPlan[0]).toContain("--ignored");
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

test("binary unit tests retain focused admission and reject mixed targets", () => {
  const options = {
    packageName: "openagent-server",
    binaryTarget: "openagent-server",
    caseName: "storage::tests::failed_database_backup_leaves_original_state_untouched",
    targetTriple: "x86_64-pc-windows-msvc",
  };
  const [focused, workspace] = runtimeVerificationPlan({ ...options, qualify: true });
  expect(focused).toContain("--bin");
  expect(focused).not.toContain("--lib");
  expect(focused).toContain("--exact");
  expect(workspace).not.toContain("--bin");
  expect(() => runtimeVerificationPlan({ ...options, testTarget: "integration" })).toThrow(
    "Select either an integration test or a binary test target.",
  );
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

test("switching worktrees invalidates only workspace artifacts before build and staging", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "openagent-source-owner-test-"));
  try {
    const events = [];
    const environment = { CARGO_TARGET_DIR: directory };
    const run = (repositoryRoot) =>
      withSourceCargoWorkspaceLock(
        {
          repositoryRoot,
          environment,
          async cleanWorkspace() {
            events.push(`clean:${repositoryRoot}`);
          },
        },
        async () => {
          events.push(`build:${repositoryRoot}`);
          events.push(`stage:${repositoryRoot}`);
        },
      );
    await run("worktree-a");
    await run("worktree-a");
    await run("worktree-b");
    expect(events).toEqual([
      "clean:worktree-a",
      "build:worktree-a",
      "stage:worktree-a",
      "build:worktree-a",
      "stage:worktree-a",
      "clean:worktree-b",
      "build:worktree-b",
      "stage:worktree-b",
    ]);
    await expect(
      withSourceCargoWorkspaceLock(
        {
          repositoryRoot: "worktree-c",
          environment,
          async cleanWorkspace() {
            throw new Error("clean refused");
          },
        },
        async () => {
          throw new Error("build must not run");
        },
      ),
    ).rejects.toThrow("clean refused");
    const identity = path.resolve("worktree-b");
    expect(await readFile(path.join(directory, ".openagent-source-worktree"), "utf8")).toBe(
      process.platform === "win32" ? identity.toLowerCase() : identity,
    );
    await run("worktree-c");
    expect(events.slice(-3)).toEqual(["clean:worktree-c", "build:worktree-c", "stage:worktree-c"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a legacy launcher cannot hide foreign SDK artifacts behind the current owner marker", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "openagent-source-dep-info-test-"));
  try {
    const repositoryRoot = path.resolve("task-worktree");
    const marker = process.platform === "win32" ? repositoryRoot.toLowerCase() : repositoryRoot;
    await writeFile(path.join(directory, ".openagent-source-worktree"), marker);
    const deps = path.join(directory, "x86_64-pc-windows-msvc", "debug", "deps");
    await mkdir(deps, { recursive: true });
    const manifest = path.resolve("default-worktree/runtime/rust/openagent-runtime");
    await writeFile(
      path.join(deps, "openagent_runtime-fixture.d"),
      `# env-dep:CARGO_MANIFEST_DIR=${manifest.replaceAll("\\", "\\\\")}\n`,
    );
    const events = [];
    await withSourceCargoWorkspaceLock(
      {
        repositoryRoot,
        environment: { CARGO_TARGET_DIR: directory },
        async cleanWorkspace() {
          events.push("clean");
        },
      },
      async () => {
        events.push("build");
      },
    );
    expect(events).toEqual(["clean", "build"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
