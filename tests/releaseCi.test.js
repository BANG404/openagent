// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

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
const sdkWorkflow = readFileSync(
  new URL("../.github/workflows/sdk-ci.yml", import.meta.url),
  "utf8",
);
const nativeCargoManifest = readFileSync(
  new URL("../src-tauri/Cargo.toml", import.meta.url),
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

describe("release CI verification", () => {
  test("reserves complete qualification for release, scheduled, and manual runs", () => {
    expect(ciWorkflow).toContain("workflow_call:");
    expect(ciWorkflow).toContain("pull_request:");
    expect(ciWorkflow).toContain("schedule:");
    expect(ciWorkflow).not.toContain("\n  push:");
    expect(ciWorkflow).toContain('"$CI_EVENT" == "workflow_call"');
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

  test("keeps native-only compilation independent from a frontend production build", () => {
    expect(nativeWorkflow.match(/Materialize frontendDist for Tauri macros/g)).toHaveLength(3);
    const hostCompatibilityJob = sdkWorkflow.match(
      / {2}host-compatibility:\n(?<job>[\s\S]*?)\n {2}required:/,
    )?.groups?.job;

    expect(hostCompatibilityJob).toContain("Materialize frontendDist for Tauri macros");
    expect(hostCompatibilityJob).toContain(
      `node -e "require('fs').mkdirSync('host/build', { recursive: true })"`,
    );
    expect(nativeCargoManifest).toContain(
      'rfd = { version = "0.16", default-features = false, features = ["common-controls-v6"] }',
    );
  });

  test("bypasses module checks for administrator-authored pull requests", () => {
    expect(ciWorkflow).toContain("CI_PR_AUTHOR:");
    expect(ciWorkflow).toContain("collaborators/$CI_PR_AUTHOR/permission");
    expect(ciWorkflow).toContain(".user.permissions.admin // false");
    expect(ciWorkflow).toContain("bypassTrustedPullRequest=$bypass_trusted_pull_request");
    expect(ciWorkflow).toContain("if: steps.route.outputs.bypassTrustedPullRequest != 'true'");
    expect(ciWorkflow).toContain("Resolve authoritative tree-equivalent CI");
    expect(ciWorkflow).toContain("node scripts/ci-reuse.mjs resolve");
  });

  test("reports pull-request status and auto-merges only an administrator exact head", () => {
    expect(prHeadWorkflow).toContain("workflow_run:");
    expect(prHeadWorkflow).toContain("statuses: write");
    expect(prHeadWorkflow).toContain("github.event.workflow_run.event == 'pull_request'");
    expect(prHeadWorkflow).not.toContain("github.event.workflow_run.event == 'workflow_dispatch'");
    expect(prHeadWorkflow).toContain("github.event.workflow_run.head_sha");
    expect(prHeadWorkflow).toContain("latest_run_id");
    expect(prHeadWorkflow).toContain('context="Required PR Head"');
    expect(prHeadWorkflow).toContain("collaborators/$author/permission");
    expect(prHeadWorkflow).toContain('"$is_admin" == "true"');
    expect(prHeadWorkflow).toContain('"$head" != "$CI_HEAD_SHA"');
    expect(prHeadWorkflow).toContain("-f merge_method=squash");
    expect(prHeadWorkflow).toContain('-f sha="$CI_HEAD_SHA"');
  });

  test("pushes release metadata directly and qualifies it before tagging or building", () => {
    expect(prepareReleaseWorkflow).toContain("Require administrator push token");
    expect(prepareReleaseWorkflow).toContain(
      'git push origin "$release_sha:refs/heads/$RELEASE_BASE_BRANCH"',
    );
    expect(prepareReleaseWorkflow).not.toContain("gh pr create");
    expect(prepareReleaseWorkflow).not.toContain("gh workflow run ci.yml");

    expect(releaseWorkflow).toContain("push:");
    expect(releaseWorkflow).toContain("- .github/release.json");
    expect(releaseWorkflow).toContain("name: Complete release qualification");
    expect(releaseWorkflow).toContain("uses: ./.github/workflows/ci.yml");
    expect(releaseWorkflow).toContain("full: true");
    expect(releaseWorkflow).toContain("needs.qualify.result == 'success'");
    expect(prepareReleaseWorkflow).toContain("- rc");
    expect(prepareReleaseWorkflow).toContain("--promote-rc=$RC_TAG");
    expect(releaseWorkflow).toContain("release/rc/**");
    expect(releaseWorkflow).toContain("release/$RELEASE_CHANNEL/$release_line");
  });

  test("refreshes an unpublished Beta marker onto the latest master source", () => {
    expect(prepareReleaseWorkflow).toContain("ref: master");
    expect(prepareReleaseWorkflow).toContain(
      "git fetch origin refs/heads/master:refs/remotes/origin/master",
    );
    expect(prepareReleaseWorkflow).toContain('automation_sha="$(git rev-parse origin/master)"');
    expect(prepareReleaseWorkflow).toContain('base_sha="$automation_sha"');
  });

  test("fetches tags before validating release metadata", () => {
    const detectJob = releaseWorkflow.match(/ {2}detect:\n(?<job>[\s\S]*?)\n {2}qualify:/)?.groups
      ?.job;

    expect(detectJob).toContain("fetch-depth: 0");
  });
});
