import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  sdkReleaseVersionInvocation,
  sdkReleaseManifestArtifact,
  sdkReleaseWorkflowTitle,
  selectDispatchedWorkflowRun,
  selectSdkQualificationStatus,
  validateSdkManifest,
  workflowDispatchInvocation,
  workflowRunProgress,
} from "./ensure-sdk-release.mjs";

describe("SDK release version invocation", () => {
  test("resolves the SDK script before changing to the SDK directory", () => {
    const invocation = sdkReleaseVersionInvocation("sdk", "0123456789abcdef");

    expect(invocation).toEqual({
      args: [join(resolve("sdk"), "scripts/release-version.mjs"), "--sha", "0123456789abcdef"],
      cwd: resolve("sdk"),
    });
  });
});

describe("SDK release manifest verification", () => {
  const plan = { version: "0.6.3", releaseSha: "0123456789abcdef0123456789abcdef01234567" };

  test("accepts the exact SDK source and protocol range", () => {
    expect(
      validateSdkManifest(
        { version: "0.6.3", sdk_sha: plan.releaseSha, protocol: { min: 12, max: 12 } },
        plan,
      ),
    ).toEqual({ protocolMin: 12, protocolMax: 12 });
  });

  test("rejects a manifest built from another SDK revision", () => {
    expect(() =>
      validateSdkManifest(
        {
          version: "0.6.3",
          sdk_sha: "fedcba9876543210fedcba9876543210fedcba98",
          protocol: { min: 12, max: 12 },
        },
        plan,
      ),
    ).toThrow(/does not match/);
  });
});

describe("SDK release workflow orchestration", () => {
  test("names staged and public release runs independently", () => {
    expect(sdkReleaseWorkflowTitle("sdk-v0.2.1", "stage")).toBe("Stage SDK Release sdk-v0.2.1");
    expect(sdkReleaseWorkflowTitle("sdk-v0.2.1", "publish")).toBe("Publish SDK Release sdk-v0.2.1");
    expect(sdkReleaseManifestArtifact("sdk-v0.2.1")).toBe("sdk-release-manifest-sdk-v0.2.1");
  });

  test("renders safe progress metadata for tracked cross-repository runs", () => {
    expect(
      workflowRunProgress({
        workflow: "ci.yml",
        databaseId: 42,
        status: "completed",
        conclusion: "success",
        url: "https://github.com/BANG404/openagent-sdk/actions/runs/42",
      }),
    ).toBe(
      "ci.yml run 42: completed/success (https://github.com/BANG404/openagent-sdk/actions/runs/42)",
    );
  });

  test("qualifies an SDK revision before preparing its immutable tag", () => {
    const source = readFileSync(new URL("./ensure-sdk-release.mjs", import.meta.url), "utf8");
    const ciDispatch = source.indexOf('dispatchWorkflow(repository, "ci.yml"');
    const qualificationWait = source.indexOf('while (qualifiedRun.status !== "completed")');
    const prepareDispatch = source.indexOf('dispatchWorkflow(repository, "prepare-release.yml"');
    expect(ciDispatch).toBeGreaterThanOrEqual(0);
    expect(qualificationWait).toBeGreaterThan(ciDispatch);
    expect(prepareDispatch).toBeGreaterThan(qualificationWait);
  });

  test("dispatches current CI automation for an immutable SDK SHA", () => {
    expect(
      workflowDispatchInvocation("BANG404/openagent-sdk", "ci.yml", "main", [
        `sdk_sha=${"b".repeat(40)}`,
        "full=true",
      ]),
    ).toEqual([
      "workflow",
      "run",
      "ci.yml",
      "--repo",
      "BANG404/openagent-sdk",
      "--ref",
      "main",
      "-f",
      `sdk_sha=${"b".repeat(40)}`,
      "-f",
      "full=true",
    ]);
  });

  test("dispatches staged workflows against an immutable SDK tag", () => {
    expect(
      workflowDispatchInvocation("BANG404/openagent-sdk", "release.yml", "main", [
        "sdk_tag=sdk-v0.2.1",
        "operation=stage",
      ]),
    ).toEqual([
      "workflow",
      "run",
      "release.yml",
      "--repo",
      "BANG404/openagent-sdk",
      "--ref",
      "main",
      "-f",
      "sdk_tag=sdk-v0.2.1",
      "-f",
      "operation=stage",
    ]);
  });

  test("requires staged and published modes explicitly", () => {
    const source = readFileSync(new URL("./ensure-sdk-release.mjs", import.meta.url), "utf8");
    expect(source).toContain('!["stage", "publish"].includes(mode)');
    expect(source).toContain('"operation=stage"');
    expect(source).toContain('"operation=publish"');
    expect(source.indexOf('mode === "stage"')).toBeLessThan(source.indexOf('mode === "publish"'));
  });

  test("selects only the dispatched workflow for the exact SDK SHA", () => {
    const dispatchedAt = Date.parse("2026-08-30T20:00:00Z");
    const selected = selectDispatchedWorkflowRun(
      [
        {
          event: "push",
          headSha: "a".repeat(40),
          createdAt: "2026-08-30T20:00:01Z",
        },
        {
          databaseId: 42,
          event: "workflow_dispatch",
          headSha: "b".repeat(40),
          createdAt: "2026-08-30T20:00:02Z",
        },
      ],
      "b".repeat(40),
      dispatchedAt,
    );

    expect(selected?.databaseId).toBe(42);
  });

  test("tracks an older immutable tag through its explicit run title", () => {
    const selected = selectDispatchedWorkflowRun(
      [
        {
          databaseId: 84,
          event: "workflow_dispatch",
          headSha: "c".repeat(40),
          displayTitle: "Publish SDK Release sdk-v0.2.0",
          createdAt: "2026-08-30T20:00:02Z",
        },
      ],
      "b".repeat(40),
      Date.parse("2026-08-30T20:00:00Z"),
      "Publish SDK Release sdk-v0.2.0",
    );

    expect(selected?.databaseId).toBe(84);
  });

  test("waits for the full SDK status created by the current dispatch", () => {
    const selected = selectSdkQualificationStatus(
      [
        {
          context: "Public SDK CI",
          state: "success",
          description: "Public SDK full validation passed",
          created_at: "2026-08-30T19:00:00Z",
        },
        {
          context: "Public SDK CI",
          state: "pending",
          description: "Public SDK full validation pending",
          created_at: "2026-08-30T20:00:02Z",
        },
        {
          context: "Public SDK CI",
          state: "success",
          description: "Public SDK full validation passed",
          created_at: "2026-08-30T20:19:02Z",
        },
      ],
      Date.parse("2026-08-30T20:00:00Z"),
    );

    expect(selected?.state).toBe("success");
  });

  test("tracks SDK release preparation before waiting for its tag", () => {
    const source = readFileSync(new URL("./ensure-sdk-release.mjs", import.meta.url), "utf8");
    const qualificationWait = source.indexOf("await waitForSdkQualification");
    const prepareDispatch = source.indexOf('dispatchWorkflow(repository, "prepare-release.yml"');
    const prepareRunWait = source.indexOf("let prepareRun = await waitForWorkflowRun");
    const tagWait = source.indexOf("await waitForSdkTag");
    expect(qualificationWait).toBeGreaterThanOrEqual(0);
    expect(prepareDispatch).toBeGreaterThan(qualificationWait);
    expect(prepareRunWait).toBeGreaterThan(prepareDispatch);
    expect(tagWait).toBeGreaterThan(prepareRunWait);
  });
});
