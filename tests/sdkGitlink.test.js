// @ts-nocheck -- command fixtures intentionally use a lightweight fake runner.
import { describe, expect, test } from "bun:test";
import { verifySdkGitlink } from "../scripts/verify-sdk-gitlink.mjs";

const SDK_SHA = "1".repeat(40);
const MAIN_SHA = "2".repeat(40);

function gitFixture({ ancestorStatus = 0, sdkCommitStatus = 0, hostRevision = "INDEX" } = {}) {
  const calls = [];
  const git = (cwd, args) => {
    calls.push({ cwd, args });
    const command = args.join(" ");
    const gitlinkRevision = hostRevision === "INDEX" ? ":sdk" : `${hostRevision}:sdk`;
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
      "is not present in the initialized sdk repository",
    );
  });

  test("resolves a committed host revision for the pre-push hook", () => {
    const hostRevision = "a".repeat(40);
    const fixture = gitFixture({ hostRevision });
    expect(verifySdkGitlink({ repository: "/repo", hostRevision, git: fixture.git }).sdkSha).toBe(
      SDK_SHA,
    );
    expect(fixture.calls[0]?.args).toEqual(["rev-parse", "--verify", `${hostRevision}:sdk`]);
  });

  test("rejects a detached SDK commit that was not pushed to main", () => {
    const fixture = gitFixture({ ancestorStatus: 1 });
    expect(() => verifySdkGitlink({ repository: "/repo", git: fixture.git })).toThrow(
      "push them to main first",
    );
  });
});
