// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import {
  parseRunId,
  resolveVerifiedTreeReuse,
  reusableCapabilitiesFromStatuses,
  selectCiModules,
} from "../scripts/ci-reuse.mjs";

const repository = "BANG404/openagent";
const targetSha = "a".repeat(40);
const sourceSha = "b".repeat(40);
const tree = "c".repeat(40);

function status(context, runId = "123", statusTree = tree) {
  return {
    context,
    state: "success",
    target_url: `https://github.com/${repository}/actions/runs/${runId}`,
    description: `tree=${statusTree} Capability passed for this exact source tree.`,
    updated_at: "2026-08-05T00:00:00Z",
  };
}

function successfulFastStatuses(runId = "123") {
  return [
    status("Required PR Head", runId),
    status("Verified CI / automation", runId),
    status("Verified CI / frontend-fast", runId),
    status("Verified CI / native-quality-fast", runId),
    status("Verified CI / embedding-fast", runId),
    status("Verified CI / harness-fast", runId),
  ];
}

function sourceRun(sha = sourceSha, runId = 123) {
  return {
    id: runId,
    conclusion: "success",
    event: "pull_request",
    head_sha: sha,
    path: ".github/workflows/ci.yml",
    html_url: `https://github.com/${repository}/actions/runs/${runId}`,
    repository: { full_name: repository },
  };
}

describe("verified CI tree reuse", () => {
  test("accepts only canonical Actions run URLs for this repository", () => {
    expect(parseRunId(`https://github.com/${repository}/actions/runs/123`, repository)).toBe("123");
    expect(parseRunId("https://example.com/BANG404/openagent/actions/runs/123", repository)).toBe(
      "",
    );
    expect(parseRunId("https://github.com/other/repo/actions/runs/123", repository)).toBe("");
  });

  test("subtracts reusable capabilities and omits no-op platform checks from fast tiers", () => {
    const requested = {
      automation: true,
      frontend: true,
      nativeQuality: true,
      nativePlatform: true,
      embedding: true,
      harness: true,
    };
    expect(
      selectCiModules(requested, { ...requested, frontend: false, harness: false }, false),
    ).toEqual({
      automation: false,
      frontend: true,
      nativeQuality: false,
      nativePlatform: false,
      embedding: false,
      harness: true,
    });
  });

  test("never lets fast statuses satisfy full-only capabilities", () => {
    expect(reusableCapabilitiesFromStatuses(successfulFastStatuses(), true)).toEqual({
      automation: true,
      frontend: false,
      nativeQuality: false,
      nativePlatform: false,
      embedding: false,
      harness: false,
    });
  });

  test("reuses authoritative results attached to the exact PR head", async () => {
    const responses = new Map([
      [`/repos/${repository}/commits/${targetSha}/status`, { statuses: successfulFastStatuses() }],
      [`/repos/${repository}/actions/runs/123`, sourceRun(targetSha)],
    ]);
    const result = await resolveVerifiedTreeReuse({
      repository,
      targetSha,
      targetTree: tree,
      targetBranch: "master",
      eventName: "pull_request",
      runId: "999",
      full: false,
      api: async (path) => responses.get(path),
    });

    expect(result.sourceSha).toBe(targetSha);
    expect(result.sourceTree).toBe(tree);
    expect(result.reusable).toEqual({
      automation: true,
      frontend: true,
      nativeQuality: true,
      nativePlatform: false,
      embedding: true,
      harness: true,
    });
  });

  test("reuses a merged PR only when its complete tree equals the push tree", async () => {
    const responses = new Map([
      [
        `/repos/${repository}/commits/${targetSha}/pulls`,
        [
          {
            number: 81,
            merged_at: "2026-08-05T00:00:00Z",
            merge_commit_sha: targetSha,
            base: { ref: "master" },
            head: { sha: sourceSha, repo: { full_name: repository } },
          },
        ],
      ],
      [`/repos/${repository}/commits/${targetSha}/status`, { statuses: [] }],
      [`/repos/${repository}/commits/${sourceSha}/status`, { statuses: successfulFastStatuses() }],
      [`/repos/${repository}/actions/runs/123`, sourceRun()],
    ]);
    const result = await resolveVerifiedTreeReuse({
      repository,
      targetSha,
      targetTree: tree,
      targetBranch: "master",
      eventName: "push",
      runId: "999",
      full: false,
      api: async (path) => responses.get(path),
    });

    expect(result.sourceSha).toBe(sourceSha);
    expect(result.reason).toContain("pull request #81");
  });

  test("fails closed for a different tree or the current run itself", async () => {
    const responses = new Map([
      [`/repos/${repository}/commits/${targetSha}/pulls`, []],
      [
        `/repos/${repository}/commits/${targetSha}/status`,
        { statuses: successfulFastStatuses("999") },
      ],
    ]);
    const result = await resolveVerifiedTreeReuse({
      repository,
      targetSha,
      targetTree: tree,
      targetBranch: "master",
      eventName: "push",
      runId: "999",
      full: false,
      api: async (path) => responses.get(path),
    });

    expect(Object.values(result.reusable).some(Boolean)).toBe(false);
    expect(result.sourceSha).toBe("");
  });

  test("rejects successful statuses that describe a different checked-out tree", async () => {
    const statuses = successfulFastStatuses().map((entry) => ({
      ...entry,
      description: `tree=${"d".repeat(40)} Capability passed elsewhere.`,
    }));
    const responses = new Map([[`/repos/${repository}/commits/${targetSha}/status`, { statuses }]]);
    const result = await resolveVerifiedTreeReuse({
      repository,
      targetSha,
      targetTree: tree,
      targetBranch: "master",
      eventName: "pull_request",
      runId: "999",
      full: false,
      api: async (path) => responses.get(path),
    });

    expect(Object.values(result.reusable).some(Boolean)).toBe(false);
  });
});
