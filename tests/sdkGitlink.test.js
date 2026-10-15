// @ts-nocheck -- command fixtures intentionally use a lightweight fake runner.
import { describe, expect, test } from "bun:test";
import { verifySdkGitlink } from "../scripts/verify-sdk-gitlink.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SDK_SHA = "1".repeat(40);
const MAIN_SHA = "2".repeat(40);

function gitFixture({ ancestorStatus = 0, sdkCommitStatus = 0, hostRevision = "INDEX" } = {}) {
  const calls = [];
  const git = (cwd, args) => {
    calls.push({ cwd, args });
    const command = args.join(" ");
    const gitlinkRevision = hostRevision === "INDEX" ? ":runtime" : `${hostRevision}:runtime`;
    if (command === `rev-parse --verify ${gitlinkRevision}`) {
      return { status: 0, stdout: SDK_SHA, stderr: "" };
    }
    if (command === `cat-file -e ${SDK_SHA}^{commit}`) {
      return { status: sdkCommitStatus, stdout: "", stderr: "missing" };
    }
    if (command === "rev-parse --verify origin/main^{commit}") {
      return { status: 0, stdout: MAIN_SHA, stderr: "" };
    }
    if (command === `merge-base --is-ancestor ${SDK_SHA} ${MAIN_SHA}`) {
      return { status: ancestorStatus, stdout: "", stderr: "" };
    }
    throw new Error(`Unexpected git command: ${command}`);
  };
  return { calls, git };
}

describe("SDK gitlink delivery guard", () => {
  test("discovers the nested Runtime repository under Git hook environment", () => {
    const root = mkdtempSync(join(tmpdir(), "openagent-gitlink-hook-"));
    const runtime = join(root, "runtime");
    const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    try {
      mkdirSync(runtime);
      for (const cwd of [root, runtime]) {
        git(cwd, "init", "-b", "main");
        git(cwd, "config", "user.name", "Fixture");
        git(cwd, "config", "user.email", "fixture@example.invalid");
      }
      writeFileSync(join(runtime, "fixture"), "independent Runtime object\n");
      git(runtime, "add", "fixture");
      git(runtime, "commit", "-m", "fixture");
      const sha = git(runtime, "rev-parse", "HEAD");
      git(runtime, "update-ref", "refs/remotes/origin/main", sha);
      mkdirSync(join(root, ".githooks"));
      writeFileSync(join(root, ".githooks/public-sdk-sources.txt"), "");
      git(root, "update-index", "--add", "--cacheinfo", "160000", sha, "runtime");
      const result = spawnSync(process.execPath, [resolve("scripts/verify-sdk-gitlink.mjs")], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, GIT_DIR: join(root, ".git"), GIT_WORK_TREE: root },
      });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(sha.slice(0, 12));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("accepts a pinned commit contained in SDK origin/main", () => {
    const fixture = gitFixture();
    expect(verifySdkGitlink({ repository: "/repo", git: fixture.git })).toEqual({
      sdkSha: SDK_SHA,
      mainSha: MAIN_SHA,
    });
    expect(fixture.calls.at(-1)?.args).toEqual(["merge-base", "--is-ancestor", SDK_SHA, MAIN_SHA]);
  });

  test("rejects a gitlink commit missing from the initialized SDK", () => {
    const fixture = gitFixture({ sdkCommitStatus: 1 });
    expect(() => verifySdkGitlink({ repository: "/repo", git: fixture.git })).toThrow(
      "is not present in the initialized runtime repository",
    );
  });

  test("resolves a committed host revision for the pre-push hook", () => {
    const hostRevision = "a".repeat(40);
    const fixture = gitFixture({ hostRevision });
    expect(verifySdkGitlink({ repository: "/repo", hostRevision, git: fixture.git }).sdkSha).toBe(
      SDK_SHA,
    );
    expect(fixture.calls[0]?.args).toEqual(["rev-parse", "--verify", `${hostRevision}:runtime`]);
  });

  test("rejects a detached SDK commit that was not pushed to main", () => {
    const fixture = gitFixture({ ancestorStatus: 1 });
    expect(() => verifySdkGitlink({ repository: "/repo", git: fixture.git })).toThrow(
      "push them to main first",
    );
  });
});
