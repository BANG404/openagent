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
const tauriConfig = JSON.parse(
  readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);
const fullTauriConfig = JSON.parse(
  readFileSync(new URL("../src-tauri/tauri.full.conf.json", import.meta.url), "utf8"),
);
const prHeadWorkflow = readFileSync(
  new URL("../.github/workflows/report-pr-head-ci.yml", import.meta.url),
  "utf8",
);
const prepareReleaseWorkflow = readFileSync(
  new URL("../.github/workflows/prepare-release.yml", import.meta.url),
  "utf8",
);
const privateSccacheAction = readFileSync(
  new URL("../.github/actions/setup-private-sccache/action.yml", import.meta.url),
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

  test("keeps fast SDK validation separate from release qualification", () => {
    expect(sdkWorkflow).toContain(
      "SDK_STATUS_CONTEXT: ${{ inputs.full && 'Public SDK CI' || 'Public SDK Fast CI' }}",
    );
  });

  test("routes trusted Linux and Windows compilation through private runners and sccache", () => {
    const linuxRunner = "[self-hosted, openagent-ci, linux-x64, cloudflare-sccache]";
    const windowsRunner = "[self-hosted, openagent-ci, windows-x64, cloudflare-sccache]";

    expect(nativeWorkflow).toContain(linuxRunner);
    expect(nativeWorkflow).toContain("windows-x64");
    expect(nativeWorkflow).toContain("uses: ./.github/actions/setup-private-sccache");
    expect(ciWorkflow).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
    expect(ciWorkflow).toContain(
      "OPENAGENT_SCCACHE_ACCESS_KEY: ${{ secrets.OPENAGENT_SCCACHE_ACCESS_KEY }}",
    );
    expect(sdkWorkflow).toContain(linuxRunner);
    expect(sdkWorkflow).toContain(windowsRunner);
    expect(sdkWorkflow).toContain("runs-on: macos-latest");
    expect(sdkWorkflow).not.toContain("if: vars.OPENAGENT_SCCACHE_ENDPOINT != ''");
    expect(releaseWorkflow).toContain(linuxRunner);
    expect(releaseWorkflow).toContain(windowsRunner);
    expect(releaseWorkflow).toContain("runner_os: macOS");
    expect(releaseWorkflow).not.toContain("matrix.platform");
    expect(prepareReleaseWorkflow).toContain(linuxRunner);
    expect(privateSccacheAction).toContain("SCCACHE_S3_KEY_PREFIX");
    expect(privateSccacheAction).toContain("SCCACHE_IGNORE_SERVER_IO_ERROR=1");
    expect(privateSccacheAction).toContain("SCCACHE_NO_DAEMON=1");
    expect(sdkWorkflow).toContain("SCCACHE_NO_DAEMON=1");
  });

  test("keeps native-only compilation independent from a frontend production build", () => {
    expect(nativeWorkflow.match(/Materialize frontendDist for Tauri macros/g)).toHaveLength(3);
    expect(nativeWorkflow.match(/Materialize Runtime sidecar for Tauri macros/g)).toHaveLength(3);
    expect(nativeWorkflow.match(/prepare-runtime-server\.mjs --placeholder/g)).toHaveLength(3);
    const hostCompatibilityJob = sdkWorkflow.match(
      / {2}host-compatibility:\n(?<job>[\s\S]*?)\n {2}required:/,
    )?.groups?.job;

    expect(hostCompatibilityJob).toContain("Materialize frontendDist for Tauri macros");
    expect(hostCompatibilityJob).toContain(
      `node -e "require('fs').mkdirSync('host/build', { recursive: true })"`,
    );
    expect(hostCompatibilityJob).toContain("Materialize Runtime sidecar for Tauri macros");
    expect(hostCompatibilityJob).toContain("node scripts/prepare-runtime-server.mjs --placeholder");
    expect(nativeCargoManifest).toContain(
      'rfd = { version = "0.16", default-features = false, features = ["common-controls-v6"] }',
    );
  });

  test("uses public SDK artifacts for untrusted frontend pull requests", () => {
    expect(frontendWorkflow).toContain("required: false");
    expect(frontendWorkflow).toContain("Fetch public TypeScript SDK for fork pull request");
    expect(frontendWorkflow).toContain("scripts/fetch-public-typescript-sdk.mjs");
    expect(frontendWorkflow).toContain(
      "github.event.pull_request.head.repo.full_name != github.repository",
    );
    expect(ciWorkflow).toContain("if: needs.changes.outputs.frontend == 'true'");
  });

  test("keeps release binaries and generated Tauri commands size-oriented", () => {
    expect(nativeCargoManifest).toContain("[profile.release]");
    expect(nativeCargoManifest).toContain("codegen-units = 1");
    expect(nativeCargoManifest).toContain("lto = true");
    expect(nativeCargoManifest).toContain('opt-level = "s"');
    expect(nativeCargoManifest).toContain('panic = "abort"');
    expect(nativeCargoManifest).toContain("strip = true");
    expect(tauriConfig.build.removeUnusedCommands).toBe(true);
  });

  test("delivers public-host Windows sandbox failures only to the private SDK commit", () => {
    expect(ciWorkflow).toContain(
      "OPENAGENT_CI_REPORTER_PRIVATE_KEY: ${{ secrets.OPENAGENT_CI_REPORTER_PRIVATE_KEY }}",
    );
    expect(nativeWorkflow).toContain('OPENAGENT_WINDOWS_NETWORK_PRIVATE_DIAGNOSTIC: "1"');
    expect(nativeWorkflow).toContain('SBX_DEBUG: "1"');
    expect(nativeWorkflow).toContain(
      '"sdk-windows-sandbox-test.log" | Out-File "$env:RUNNER_TEMP/sdk-private-diagnostic-name"',
    );
    expect(nativeWorkflow).toContain("name: Report Windows diagnostic to private SDK");
    expect(nativeWorkflow).toContain("permission-checks: write");
    expect(nativeWorkflow).toContain("permission-contents: read");
    expect(nativeWorkflow).toContain("SDK_SHA: ${{ steps.sdk.outputs.sha }}");
    expect(nativeWorkflow).toContain("run: node scripts/report-private-sdk-diagnostic.mjs");
    expect(nativeWorkflow).not.toContain("Get-Content $log");
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
    expect(releaseWorkflow).toContain("name: Qualify or reuse pinned SDK release");
    expect(releaseWorkflow).toContain("scripts/ensure-sdk-release.mjs");
    expect(releaseWorkflow).toContain("timeout-minutes: 190");
    expect(releaseWorkflow).toContain("OPENAGENT_SDK_RELEASE_TOKEN");
    expect(releaseWorkflow).toContain("openagent-desktop-manifest.json");
    expect(releaseWorkflow).toContain("needs.sdk-release.outputs.sdk_version");
    expect(prepareReleaseWorkflow).toContain("- rc");
    expect(prepareReleaseWorkflow).toContain("--promote-rc=$RC_TAG");
    expect(releaseWorkflow).toContain("release/rc/**");
    expect(releaseWorkflow).toContain("release/$RELEASE_CHANNEL/$release_line");
  });

  test("preserves lowercase prerelease updater channel names", () => {
    expect(releaseWorkflow).toContain("console.log(`channel=${manifest.channel}`)");
    expect(releaseWorkflow).not.toContain("manifest.channel[0].toUpperCase()");
    expect(releaseWorkflow).toContain(
      'public_metadata_url="https://github.com/$GH_REPO/releases/download/$RELEASE_CHANNEL/latest.json"',
    );
  });

  test("publishes lightweight updater inputs and separate full first-install bundles", () => {
    expect(tauriConfig.bundle.createUpdaterArtifacts).toBe(true);
    expect(tauriConfig.bundle.resources).toBeUndefined();
    expect(fullTauriConfig.bundle.createUpdaterArtifacts).toBe(false);
    expect(fullTauriConfig.bundle.resources).toEqual({
      "resources/models/all-MiniLM-L6-v2-q/": "models/all-MiniLM-L6-v2-q/",
    });
    expect(releaseWorkflow).toContain("Build full first-install bundle");
    expect(releaseWorkflow).toContain("bun run tauri:build:full -- ${{ matrix.args }}");
    expect(releaseWorkflow).toContain("upload-full-release-asset.mjs --tag");
  });

  test("publishes signed runtime and frontend component channels", () => {
    expect(tauriConfig.bundle.externalBin).toContain("binaries/openagent-server");
    expect(releaseWorkflow).toContain("runtime-components:");
    expect(releaseWorkflow).toContain('component_channel="runtime-$RELEASE_CHANNEL"');
    expect(releaseWorkflow).toContain("openagent-sdk-manifest.json.sig");
    expect(releaseWorkflow).toContain("frontend-components:");
    expect(releaseWorkflow).toContain("scripts/frontend-artifacts.mjs");
    expect(
      releaseWorkflow.match(
        /signer sign --private-key "\$TAURI_SIGNING_PRIVATE_KEY" --password ""/g,
      ),
    ).toHaveLength(2);
    expect(releaseWorkflow).toContain('component_channel="frontend-$RELEASE_CHANNEL"');
    expect(releaseWorkflow).toContain("openagent-frontend-manifest.json.sig");
  });

  test("builds only the release components selected by the manifest", () => {
    expect(releaseWorkflow).toContain(
      "const components = manifest.components ?? { frontend: true, runtime: true, nativeShell: true };",
    );
    expect(releaseWorkflow).toContain("console.log(`frontend=${components.frontend === true}`)");
    expect(releaseWorkflow).toContain("console.log(`runtime=${components.runtime === true}`)");
    expect(releaseWorkflow).toContain(
      "console.log(`native_shell=${components.nativeShell === true}`)",
    );
    expect(releaseWorkflow).toContain(
      "&& (needs.detect.outputs.native_shell == 'true' || needs.detect.outputs.runtime == 'true')",
    );
    expect(releaseWorkflow).toContain(
      "if: needs.detect.outputs.native_shell == 'true'\n        uses: tauri-apps/tauri-action@v0",
    );
    expect(releaseWorkflow).toContain("name: Build qualified runtime component");
    expect(releaseWorkflow).toContain(
      'bun scripts/prepare-runtime-server.mjs --profile release "${target_args[@]}"',
    );
    expect(
      releaseWorkflow.match(/OPENAGENT_RUNTIME_TARGET: \$\{\{ matrix\.sidecar_target \}\}/g),
    ).toHaveLength(2);
    expect(releaseWorkflow).not.toContain("TAURI_ENV_ARCH:");
    expect(releaseWorkflow).toContain("cache-targets: false");
  });

  test("publishes qualified SDK development artifacts for external debugging", () => {
    expect(sdkWorkflow).toContain("publish_dev:");
    expect(sdkWorkflow).toContain("development-runtime:");
    expect(sdkWorkflow).toContain("development-clients:");
    expect(sdkWorkflow).toContain("publish-development:");
    expect(sdkWorkflow).toContain("needs: [required, development-runtime, development-clients]");
    expect(sdkWorkflow).toContain("channel=runtime-dev");
    expect(sdkWorkflow).toContain("sdk-dev-manifest.json");
    expect(sdkWorkflow).toContain('--sdk-sha "$SDK_SHA"');
    expect(
      sdkWorkflow.match(
        /signer sign \\\n {12}--private-key "\$TAURI_SIGNING_PRIVATE_KEY" \\\n {12}--password ""/g,
      ),
    ).toHaveLength(2);
    const installLinuxDependencies = sdkWorkflow.indexOf(
      "name: Install Linux Runtime build dependencies",
    );
    const prepareLinuxHelper = sdkWorkflow.indexOf(
      "name: Prepare pinned Linux sandbox helper",
      installLinuxDependencies,
    );
    const buildDevelopmentRuntime = sdkWorkflow.indexOf(
      "name: Build release Runtime server",
      prepareLinuxHelper,
    );
    expect(installLinuxDependencies).toBeGreaterThan(-1);
    expect(prepareLinuxHelper).toBeGreaterThan(installLinuxDependencies);
    expect(prepareLinuxHelper).toBeGreaterThan(-1);
    expect(buildDevelopmentRuntime).toBeGreaterThan(prepareLinuxHelper);
    expect(sdkWorkflow).toContain("sudo apt-get install -y binutils libcap-dev pkg-config");
    expect(sdkWorkflow).toContain(
      "scripts/prepare-linux-sandbox-helper.mjs --profile release --github-env",
    );
  });

  test("keeps resource-only releases independent from native publishing", () => {
    const frontendJob = releaseWorkflow.match(
      / {2}frontend-components:\n(?<job>[\s\S]*?)\n {2}publish-store:/,
    )?.groups?.job;
    const storeJob = releaseWorkflow.match(/ {2}publish-store:\n(?<job>[\s\S]*?)\n {2}publish:/)
      ?.groups?.job;

    expect(frontendJob).not.toContain("- build");
    expect(frontendJob).toContain("repository: BANG404/openagent-sdk");
    expect(frontendJob).toContain("needs.detect.outputs.frontend == 'true'");
    expect(storeJob).toContain("needs.detect.outputs.native_shell == 'true'");
    expect(releaseWorkflow).toContain(
      "if: needs.detect.outputs.native_shell == 'true' && needs.detect.outputs.prerelease == 'true'",
    );
    expect(releaseWorkflow).toContain("needs.detect.outputs.runtime == 'true'");
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
