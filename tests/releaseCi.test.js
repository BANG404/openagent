// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { REQUIRED_RELEASE_CI_JOBS, verifyReleaseCiJobs } from "../scripts/verify-release-ci.mjs";

const releaseWorkflow = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);
const ciWorkflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const frontendWorkflow = readFileSync(
  new URL("../.github/workflows/check-frontend.yml", import.meta.url),
  "utf8",
);
const nativeWorkflow = readFileSync(
  new URL("../.github/workflows/check-native.yml", import.meta.url),
  "utf8",
);
const prHeadWorkflow = readFileSync(
  new URL("../.github/workflows/report-pr-head-ci.yml", import.meta.url),
  "utf8",
);
const prepareReleaseWorkflow = readFileSync(
  new URL("../.github/workflows/prepare-release.yml", import.meta.url),
  "utf8",
);

function successfulJobs() {
  return REQUIRED_RELEASE_CI_JOBS.map((name) => ({ name, conclusion: "success" }));
}

describe("release CI verification", () => {
  test("keeps pull requests fast and reserves complete qualification for integration tiers", () => {
    expect(ciWorkflow).toContain("schedule:");
    expect(ciWorkflow).toContain("CI_RELEASE_BRANCH:");
    expect(ciWorkflow).toContain('CI_REF" == "refs/heads/master"');
    expect(ciWorkflow).toContain("steps.tier.outputs.integration == 'true'");
    expect(ciWorkflow).toContain("full: ${{ needs.changes.outputs.full == 'true' }}");

    expect(frontendWorkflow).toContain("if: inputs.full\n        run: bun run build");
    expect(frontendWorkflow).toContain("if: inputs.full\n        run: bun run check:bundle-size");
    expect(nativeWorkflow).toContain("if: inputs.full && inputs.platform");
    expect(nativeWorkflow).toContain("if: inputs.full && inputs.embedding");
    expect(nativeWorkflow).toContain(
      "if: inputs.full\n        run: bun run test:harness-integration",
    );
  });

  test("reports only the latest authoritative PR or release CI run to the stable head SHA", () => {
    expect(prHeadWorkflow).toContain("workflow_run:");
    expect(prHeadWorkflow).toContain("statuses: write");
    expect(prHeadWorkflow).toContain("github.event.workflow_run.event == 'pull_request'");
    expect(prHeadWorkflow).toContain("github.event.workflow_run.event == 'workflow_dispatch'");
    expect(prHeadWorkflow).toContain(
      "startsWith(github.event.workflow_run.head_branch, 'prepare/v')",
    );
    expect(prHeadWorkflow).toContain("github.event.workflow_run.head_sha");
    expect(prHeadWorkflow).toContain("event=$CI_EVENT");
    expect(prHeadWorkflow).toContain("latest_run_id");
    expect(prHeadWorkflow).toContain('context="Required PR Head"');
  });

  test("auto-merges only an eligible owner or generated release PR at the validated head", () => {
    expect(prHeadWorkflow).toContain("secrets.ADMIN_MERGE_TOKEN");
    expect(prHeadWorkflow).toContain("steps.publish.outputs.authoritative == 'true'");
    expect(prHeadWorkflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(prHeadWorkflow).toContain('"$author" == "$REPOSITORY_OWNER"');
    expect(prHeadWorkflow).toContain('"$author" == "github-actions[bot]"');
    expect(prHeadWorkflow).toContain('"$head_repo" == "$GITHUB_REPOSITORY"');
    expect(prHeadWorkflow).toContain('"$base" == "release/stable/$stable_version"');
    expect(prHeadWorkflow).toContain('"$draft" != "false"');
    expect(prHeadWorkflow).toContain('"$head" != "$CI_HEAD_SHA"');
    expect(prHeadWorkflow).toContain('"$state" != "open"');
    expect(prHeadWorkflow).toContain("-f merge_method=squash");
    expect(prHeadWorkflow).toContain('-f sha="$CI_HEAD_SHA"');
    expect(prepareReleaseWorkflow).toContain(
      "The trusted release workflow will squash-merge this PR",
    );
  });

  test("fetches tags before validating release metadata", () => {
    const detectJob = releaseWorkflow.match(/ {2}detect:\n(?<job>[\s\S]*?)\n {2}tag:/)?.groups?.job;

    expect(detectJob).toContain("fetch-depth: 0");
  });

  test("accepts a complete successful CI run", () => {
    expect(() => verifyReleaseCiJobs(successfulJobs())).not.toThrow();
  });

  test("accepts skipped modules after the Required aggregate succeeds", () => {
    const jobs = successfulJobs().map((job) =>
      job.name === "Detect changed modules" ? job : { ...job, conclusion: "success" },
    );
    jobs.push({ name: "Native desktop / Check macOS arm64", conclusion: "skipped" });
    expect(() => verifyReleaseCiJobs(jobs)).not.toThrow();
  });

  test("rejects a run without a required job", () => {
    const jobs = successfulJobs().filter((job) => job.name !== "Detect changed modules");
    expect(() => verifyReleaseCiJobs(jobs)).toThrow(
      "Detect changed modules must succeed before release preparation; got: missing",
    );
  });
});
