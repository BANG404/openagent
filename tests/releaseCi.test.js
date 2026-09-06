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
const desktopCapability = JSON.parse(
  readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"),
);
const prHeadWorkflow = readFileSync(
  new URL("../.github/workflows/report-pr-head-ci.yml", import.meta.url),
  "utf8",
);
const prepareReleaseWorkflow = readFileSync(
  new URL("../.github/workflows/prepare-release.yml", import.meta.url),
  "utf8",
);
const releaseScript = readFileSync(new URL("../scripts/release.mjs", import.meta.url), "utf8");
const privateRunnerCompose = readFileSync(
  new URL("../scripts/ci/self-hosted-runner/compose.yaml", import.meta.url),
  "utf8",
);
const privateRunnerEnvironment = readFileSync(
  new URL("../scripts/ci/self-hosted-runner/.env.example", import.meta.url),
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

  test("keeps private compiler outputs out of public caches", () => {
    const trustedWorkflows = [nativeWorkflow, sdkWorkflow, releaseWorkflow, prepareReleaseWorkflow];
    for (const workflow of trustedWorkflows) {
      expect(workflow).not.toContain("self-hosted");
      expect(workflow).not.toContain("openagent-ci");
      expect(workflow).not.toContain("sccache");
      expect(workflow).not.toContain("RUSTC_WRAPPER");
    }

    expect(nativeWorkflow).toContain("runs-on: ubuntu-24.04");
    expect(nativeWorkflow).toContain("runner: '\"windows-2025\"'");
    expect(nativeWorkflow).toContain("cache-targets: false");
    expect(ciWorkflow).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
    expect(ciWorkflow).not.toContain("OPENAGENT_SCCACHE");
    expect(sdkWorkflow).toContain("runs-on: ubuntu-24.04");
    expect(sdkWorkflow).toContain("runs-on: windows-2025");
    expect(sdkWorkflow).toContain("runs-on: macos-latest");
    expect(sdkWorkflow).toContain("cache-targets: false");
    expect(releaseWorkflow).toContain("runs-on: ubuntu-24.04");
    expect(releaseWorkflow).toContain("runs-on: windows-2025");
    expect(releaseWorkflow).toContain("runner_os: macOS");
    expect(releaseWorkflow).not.toContain("matrix.platform");
    expect(releaseWorkflow).toContain(
      "shared-key: public-host-release-${{ matrix.runtime_target }}",
    );
    expect(prepareReleaseWorkflow).toContain("runs-on: ubuntu-24.04");
    expect(nativeCargoManifest).toContain(
      'openagent-app = { path = "../sdk/rust/openagent-app", optional = true }',
    );
    expect(nativeCargoManifest).toContain(
      'openagent-runtime = { path = "../sdk/rust/openagent-runtime", optional = true }',
    );
    expect(nativeWorkflow).toContain("shared-key: public-host-linux");
    expect(nativeWorkflow).toContain("cache-targets: true");
    expect(nativeWorkflow).toContain("CARGO_TARGET_DIR: sdk/target/embedded-host");
    expect(sdkWorkflow).toContain("shared-key: public-sdk-host-dependencies");
    expect(releaseWorkflow).toContain(
      "shared-key: public-host-release-${{ matrix.runtime_target }}",
    );
    expect(releaseWorkflow).toContain("cache-targets: false");
    expect(privateRunnerCompose).toContain("./state/sccache:/var/cache/openagent-sccache");
    expect(privateRunnerCompose).not.toContain("sccache-storage:");
    expect(privateRunnerCompose).not.toContain("passnat-cache:");
    expect(privateRunnerEnvironment).not.toContain("SCCACHE_");
    expect(privateRunnerEnvironment).not.toContain("MINIO_");
  });

  test("checks out private SDK source with short-lived HTTPS app tokens", () => {
    for (const workflow of [
      ciWorkflow,
      frontendWorkflow,
      nativeWorkflow,
      sdkWorkflow,
      releaseWorkflow,
      prepareReleaseWorkflow,
    ]) {
      expect(workflow).not.toContain("OPENAGENT_SDK_DEPLOY_KEY");
      expect(workflow).not.toContain("ssh-key:");
    }

    for (const workflow of [
      frontendWorkflow,
      nativeWorkflow,
      sdkWorkflow,
      releaseWorkflow,
      prepareReleaseWorkflow,
    ]) {
      expect(workflow).toContain("uses: actions/create-github-app-token@v2");
      expect(workflow).toContain("permission-contents: read");
      expect(workflow).toContain("token: ${{ steps.");
    }
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

  test("qualifies immutable candidates and reuses the staged SDK Runtime before tagging", () => {
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
    expect(releaseWorkflow).toContain("name: Stage or reuse pinned SDK release");
    expect(releaseWorkflow).toContain("scripts/ensure-sdk-release.mjs");
    expect(releaseWorkflow).toContain("--mode stage");
    expect(releaseWorkflow).toContain("timeout-minutes: 190");
    expect(releaseWorkflow).toContain("OPENAGENT_SDK_RELEASE_TOKEN");
    expect(releaseWorkflow).toContain("openagent-desktop-manifest.json");
    expect(releaseWorkflow).toContain("needs.sdk-release.outputs.sdk_version");
    const qualifyJob = releaseWorkflow.match(/ {2}qualify:\n(?<job>[\s\S]*?)\n {2}tag:/)?.groups
      ?.job;
    const tagJob = releaseWorkflow.match(/ {2}tag:\n(?<job>[\s\S]*?)\n {2}create-draft:/)?.groups
      ?.job;
    const buildJob = releaseWorkflow.match(/ {2}build:\n(?<job>[\s\S]*?)\n {2}runtime-components:/)
      ?.groups?.job;
    expect(qualifyJob).toContain("needs: detect");
    expect(qualifyJob).not.toContain("sdk-release");
    expect(tagJob).toContain("- sdk-release");
    expect(tagJob).toContain("- qualify");
    expect(tagJob).toContain("- build");
    expect(tagJob).toContain("- runtime-components");
    expect(tagJob).toContain("- frontend-components");
    expect(buildJob).toContain("- detect");
    expect(buildJob).toContain("- sdk-release");
    expect(buildJob).not.toContain("create-draft");
    expect(buildJob).not.toContain("tagName:");
    expect(buildJob).not.toContain("releaseDraft:");
    expect(buildJob).not.toContain("gh release upload");
    expect(buildJob).toContain("release-candidate-artifacts.mjs stage-tauri");
    expect(buildJob).toContain("name: Download release-qualified SDK Runtime");
    expect(buildJob).toContain("scripts/stage-release-runtime.mjs");
    expect(buildJob).toContain('OPENAGENT_RUNTIME_SERVER_PREBUILT: "1"');
    expect(buildJob).toContain("name: Verify Windows release executable");
    expect(buildJob).toContain("VersionInfo.ProductVersion");
    expect(desktopCapability.permissions).toContain("updater:default");
    expect(buildJob).not.toContain("name: Build runtime candidate");
    expect(buildJob).toContain("name: native-release-${{ matrix.runtime_target }}");
    expect(releaseWorkflow).toContain("publish-native-assets:");
    expect(releaseWorkflow).toContain("release-candidate-artifacts.mjs publish");
    const sdkPublishJob = releaseWorkflow.match(
      / {2}publish-sdk-release:\n(?<job>[\s\S]*?)\n {2}publish:/,
    )?.groups?.job;
    const publishJob = releaseWorkflow.match(/ {2}publish:\n(?<job>[\s\S]*)/)?.groups?.job;
    expect(sdkPublishJob).toContain("- publish-native-assets");
    expect(sdkPublishJob).toContain("- publish-runtime-components");
    expect(sdkPublishJob).toContain("- publish-frontend-components");
    expect(sdkPublishJob).toContain("- publish-store");
    expect(sdkPublishJob).toContain("--mode publish");
    expect(publishJob).toContain("- publish-sdk-release");
    expect(publishJob).toContain("needs.publish-sdk-release.result == 'success'");
    expect(publishJob).toContain("name: Generate release details and download shortcuts");
    expect(publishJob).toContain("node scripts/release-notes.mjs");
    expect(publishJob).toContain('--notes-file "$RUNNER_TEMP/release-notes.md"');
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
    expect(releaseWorkflow).toContain(
      "bun run tauri:bundle -- --config src-tauri/tauri.full.conf.json ${{ matrix.args }}",
    );
    expect(releaseWorkflow).toContain("release-candidate-artifacts.mjs stage-full");
    expect(releaseWorkflow).not.toContain("upload-full-release-asset.mjs");
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
    expect(releaseWorkflow).toContain("&& needs.detect.outputs.native_shell == 'true'");
    expect(releaseWorkflow).toContain("id: tauri\n        uses: tauri-apps/tauri-action@v0");
    expect(releaseWorkflow).not.toContain("name: Build runtime candidate");
    expect(releaseWorkflow).toContain("name: Verify and stage runtime candidate");
    expect(releaseWorkflow).toContain("name: pinned-sdk-runtime");
    expect(releaseWorkflow).not.toContain("pattern: runtime-component-*");
    expect(
      releaseWorkflow.match(/OPENAGENT_RUNTIME_TARGET: \$\{\{ matrix\.sidecar_target \}\}/g),
    ).toHaveLength(2);
    expect(releaseWorkflow).not.toContain("TAURI_ENV_ARCH:");
    expect(releaseWorkflow).toContain(
      "shared-key: public-host-release-${{ matrix.runtime_target }}",
    );
  });

  test("publishes qualified SDK development artifacts for external debugging", () => {
    expect(sdkWorkflow).toContain("publish_dev:");
    expect(sdkWorkflow).toContain("development-runtime:");
    expect(sdkWorkflow).toContain("development-clients:");
    expect(sdkWorkflow).toContain("publish-development:");
    expect(sdkWorkflow).toMatch(
      /development-runtime:\n[\s\S]*?needs: pending\n[\s\S]*?development-clients:/,
    );
    expect(sdkWorkflow).toContain(
      'notes="Signed development Runtime and public clients for immutable SDK commit $SDK_SHA."',
    );
    expect(sdkWorkflow).not.toContain("\\`$SDK_SHA\\`");
    expect(sdkWorkflow).toContain(`jq -er '.upload_url | split("{")[0]'`);
    expect(sdkWorkflow).not.toContain("sed 's/{?name,label}$//'");
    expect(sdkWorkflow).toContain('release_payload="$(jq -n \\');
    expect(sdkWorkflow).toContain('--data-binary "$release_payload")"');
    expect(sdkWorkflow).toContain('"${upload_url}?name=${asset_name}"');
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
      / {2}frontend-components:\n(?<job>[\s\S]*?)\n {2}publish-native-assets:/,
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
    expect(releaseScript).toContain('const refreshFiles = [releaseManifestFile, "CHANGELOG.md"]');
    expect(releaseScript).toContain(
      "releaseRefresh ? !refreshFiles.includes(file) : !releaseFiles.includes(file)",
    );
  });

  test("fetches tags before validating release metadata", () => {
    const detectJob = releaseWorkflow.match(/ {2}detect:\n(?<job>[\s\S]*?)\n {2}qualify:/)?.groups
      ?.job;

    expect(detectJob).toContain("fetch-depth: 0");
  });
});
