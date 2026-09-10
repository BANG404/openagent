import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const hook = resolve(".githooks/post-commit");
const fixtures = [];

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "openagent-post-commit-"));
  fixtures.push(root);
  const source = join(root, "source");
  const windows = join(root, "windows");
  const bin = join(root, "bin");
  await mkdir(source);
  await mkdir(bin);
  await writeFile(join(bin, "git.exe"), '#!/usr/bin/env bash\nexec git "$@"\n');
  await chmod(join(bin, "git.exe"), 0o755);

  git(source, "init", "-b", "master");
  git(source, "config", "user.name", "Hook Test");
  git(source, "config", "user.email", "hook@example.com");
  await writeFile(join(source, "tracked.txt"), "initial\n");
  git(source, "add", "tracked.txt");
  git(source, "commit", "-m", "initial");
  git(root, "clone", source, windows);
  git(windows, "config", "user.name", "Hook Test");
  git(windows, "config", "user.email", "hook@example.com");
  git(windows, "remote", "add", "wsl-source", source);
  git(source, "config", "wsl.windowsCheckout", windows);
  git(source, "config", "wsl.windowsRemote", "wsl-source");

  return { bin, source, windows };
}

function runHook({ bin, source }) {
  return spawnSync("bash", [hook], {
    cwd: source,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("WSL-to-Windows post-commit hook", () => {
  test("fast-forwards a clean Windows checkout on the same branch", async () => {
    const context = await fixture();
    await writeFile(join(context.source, "tracked.txt"), "updated\n");
    git(context.source, "commit", "-am", "update");

    const result = runHook(context);

    expect(result.status, result.stderr).toBe(0);
    expect(git(context.windows, "rev-parse", "HEAD")).toBe(
      git(context.source, "rev-parse", "HEAD"),
    );
  });

  test("does not advance Windows when its checked-out branch differs", async () => {
    const context = await fixture();
    const windowsHead = git(context.windows, "rev-parse", "HEAD");
    git(context.source, "switch", "-c", "feature");
    await writeFile(join(context.source, "tracked.txt"), "feature\n");
    git(context.source, "commit", "-am", "feature update");

    const result = runHook(context);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("branch mismatch (WSL: feature, Windows: master)");
    expect(git(context.windows, "rev-parse", "HEAD")).toBe(windowsHead);
  });
});
