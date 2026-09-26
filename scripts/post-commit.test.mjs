import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const hook = resolve(".githooks/post-commit");
const fixtures = [];

function gitBashPath(value) {
  const normalized = value.replaceAll("\\", "/");
  const tempPrefix = `${tmpdir().replaceAll("\\", "/").replace(/\/$/u, "")}/`;
  if (normalized.startsWith(tempPrefix)) return `/tmp/${normalized.slice(tempPrefix.length)}`;
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `/${normalized[0].toLowerCase()}${normalized.slice(2)}`;
  }
  return normalized;
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" }); // NOSONAR: test invokes the fixed git tool.
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
  const realGit = process.platform === "win32" ? "/mingw64/bin/git" : "git";
  const gitShim =
    process.platform === "win32"
      ? `#!/usr/bin/env bash
if [ "$1" = "-C" ]; then
  args=("$@")
  args[1]="$(cygpath -u "\${args[1]}")"
  exec ${realGit} "\${args[@]}"
fi
exec ${realGit} "$@"
`
      : `#!/usr/bin/env bash\nexec ${realGit} "$@"\n`;
  await writeFile(join(bin, "git.exe"), gitShim);
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
  const bash =
    process.platform === "win32"
      ? join(process.env.ProgramFiles ?? String.raw`C:\Program Files`, "Git", "bin", "bash.exe")
      : "bash";
  const hookPath = process.platform === "win32" ? gitBashPath(hook) : hook;
  const args =
    process.platform === "win32"
      ? [
          "-c",
          'hash -p /mingw64/bin/git git; cd "$2" || exit 1; source "$1"',
          "openagent-hook",
          hookPath,
          gitBashPath(source),
        ]
      : [hookPath];
  return spawnSync(bash, args, {
    cwd: process.platform === "win32" ? process.cwd() : source,
    encoding: "utf8",
    env:
      process.platform === "win32"
        ? { ...process.env, PATH: `${gitBashPath(bin)}:/usr/bin:/bin:/mingw64/bin` }
        : { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
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
