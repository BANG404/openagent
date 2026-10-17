import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";

/** @param {URL|string} url */
const readText = (url) => readFileSync(url, "utf8").replace(/\r\n/g, "\n");

const releaseWorkflow = readText(new URL("../.github/workflows/release.yml", import.meta.url));
const ciWorkflow = readText(new URL("../.github/workflows/ci.yml", import.meta.url));
const frontendWorkflow = readText(
  new URL("../.github/workflows/check-frontend.yml", import.meta.url),
);
const nativeWorkflow = readText(new URL("../.github/workflows/check-native.yml", import.meta.url));
const sdkWorkflow = readText(new URL("../.github/workflows/sdk-ci.yml", import.meta.url));
const nativeCargoManifest = readText(new URL("../src-tauri/Cargo.toml", import.meta.url));
const tauriConfig = JSON.parse(readText(new URL("../src-tauri/tauri.conf.json", import.meta.url)));
const fullTauriConfig = JSON.parse(
  readText(new URL("../src-tauri/tauri.full.conf.json", import.meta.url)),
);
const desktopCapability = JSON.parse(
  readText(new URL("../src-tauri/capabilities/default.json", import.meta.url)),
);
const prHeadWorkflow = readText(
  new URL("../.github/workflows/report-pr-head-ci.yml", import.meta.url),
);
const prepareReleaseWorkflow = readText(
  new URL("../.github/workflows/prepare-release.yml", import.meta.url),
);
const releaseScript = readText(new URL("../scripts/release.mjs", import.meta.url));
const privateRunnerCompose = readText(
  new URL("../scripts/ci/self-hosted-runner/compose.yaml", import.meta.url),
);
const privateRunnerEnvironment = readText(
  new URL("../scripts/ci/self-hosted-runner/.env.example", import.meta.url),
);
describe("release CI verification", () => {
  test("public native checks require no private source or credentials", () => {
    expect(nativeWorkflow).not.toContain("secrets:");
    expect(nativeWorkflow).not.toContain("create-github-app-token");
    expect(nativeWorkflow).not.toContain("repository: BANG404/openagent-runtime");
    expect(nativeWorkflow).not.toContain("runtime/Cargo.toml");
    expect(nativeWorkflow).not.toContain("embedded-cargo");
    expect(nativeWorkflow).toContain(
      "cargo test --manifest-path crates/Cargo.toml --workspace --all-features",
    );
    expect(sdkWorkflow).toContain(
      "bootstrap::tests::verified_seed_installs_and_loads -- --exact --ignored",
    );
    expect(sdkWorkflow).toContain(
      "plugin_embedding::tests::bundled_model_inference_through_authenticated_plugin_http -- --exact --ignored",
    );
    expect(sdkWorkflow).toContain("ENGINE_EMBEDDING_RESULT: ${{ needs.engine-embedding.result }}");
    expect(sdkWorkflow).toContain(
      "grep -Fq 'test bootstrap::tests::verified_seed_installs_and_loads ... ok'",
    );
    expect(sdkWorkflow).toContain(
      "grep -Fq 'test plugin_embedding::tests::bundled_model_inference_through_authenticated_plugin_http ... ok'",
    );
  });
  test("every workflow uses the Bun version declared in package.json", () => {
    const manifest = JSON.parse(readText(new URL("../package.json", import.meta.url)));
    const version = manifest.packageManager.replace(/^bun@/, "");
    const directory = new URL("../.github/workflows/", import.meta.url);
    for (const name of readdirSync(directory).filter((name) => name.endsWith(".yml"))) {
      const workflow = readText(new URL(name, directory));
      for (const [, configured] of workflow.matchAll(/^\s+bun-version:\s*(.+)$/gm)) {
        const value = configured.trim();
        if (value === "${{ env.BUN_VERSION }}") {
          expect(workflow).toContain(`  BUN_VERSION: ${version}\n`);
        } else {
          expect(value).toBe(version);
        }
      }
    }
  });

  test("reserves complete qualification for release, scheduled, and manual runs", () => {
    expect(ciWorkflow).toContain("workflow_call:");
    expect(ciWorkflow).toContain("pull_request:");
    expect(ciWorkflow).toContain("schedule:");
    expect(ciWorkflow).not.toContain("\n  push:");
    expect(ciWorkflow).toContain('"$CI_EVENT" == "workflow_call"');
    expect(ciWorkflow).toContain("steps.tier.outputs.integration == 'true'");
    expect(ciWorkflow).toContain("full: ${{ needs.changes.outputs.full == 'true' }}");

    expect(frontendWorkflow).toContain("if: inputs.full && !inputs.external_build");
    expect(frontendWorkflow).toContain("uses: ./.github/workflows/build-frontend.yml");
    expect(nativeWorkflow).toContain("if: inputs.full && inputs.platform");
    expect(sdkWorkflow).toContain("if: inputs.full && inputs.rust");
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
    expect(nativeCargoManifest).not.toContain('path = "../runtime/');
    expect(nativeWorkflow).toContain("shared-key: public-host-linux");
    expect(nativeWorkflow).toContain("cache-targets: true");
    expect(nativeWorkflow).not.toContain("runtime/target");
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

    for (const workflow of [sdkWorkflow, releaseWorkflow, prepareReleaseWorkflow]) {
      expect(workflow).toContain("uses: actions/create-github-app-token@v2");
      expect(workflow).toContain("permission-contents: read");
      expect(workflow).toContain("token: ${{ steps.");
    }
  });

  test("keeps native-only compilation independent from a frontend production build", () => {
    expect(nativeWorkflow.match(/Materialize frontendDist for Tauri macros/g)).toHaveLength(2);
    expect(nativeWorkflow.match(/Materialize Runtime sidecar for Tauri macros/g)).toHaveLength(2);
    expect(nativeWorkflow.match(/prepare-runtime-server\.mjs --placeholder/g)).toHaveLength(2);
    const hostCompatibilityJob = sdkWorkflow.match(
      / {2}host-compatibility:\n(?<job>[\s\S]*?)\n {2}required:/,
    )?.groups?.job;

    expect(hostCompatibilityJob).toContain("Materialize frontendDist for Tauri macros");
    expect(hostCompatibilityJob).toContain(
      `node -e "for(const p of ['host/build','host/.cache/bootstrap-dist'])require('fs').mkdirSync(p,{recursive:true})"`,
    );
    expect(hostCompatibilityJob).toContain("Materialize Runtime sidecar for Tauri macros");
    expect(hostCompatibilityJob).toContain("node scripts/prepare-runtime-server.mjs --placeholder");
    expect(nativeCargoManifest).toContain(
      'rfd = { version = "0.16", default-features = false, features = ["common-controls-v6"] }',
    );
  });

  test("prepares shell bundle resources before every native CI compilation", () => {
    const nativeJobs = nativeWorkflow.matchAll(
      /^ {2}[a-z-]+:\n[\s\S]*?(?=^ {2}[a-z-]+:|$(?![\s\S]))/gm,
    );
    const hostCompatibilityJob = sdkWorkflow.match(
      / {2}host-compatibility:\n(?<job>[\s\S]*?)\n {2}required:/,
    )?.groups?.job;
    expect(hostCompatibilityJob).toBeDefined();
    const jobs = [
      ...Array.from(nativeJobs, ([job]) => job).filter((job) =>
        /cargo (?:clippy|check|test)|embedded-cargo\.mjs/.test(job),
      ),
      hostCompatibilityJob ?? "",
    ];
    expect(jobs).toHaveLength(3);
    for (const job of jobs) {
      const compile = job.search(/cargo (?:clippy|check|test)|embedded-cargo\.mjs/);
      for (const script of ["prepare-node-runtime.mjs", "prepare-terminal-tools.mjs"]) {
        const preparation = job.indexOf(`run: node scripts/${script}`);
        expect(preparation).toBeGreaterThan(-1);
        expect(preparation).toBeLessThan(compile);
      }
    }
    for (const script of ["prepare-node-runtime.mjs", "prepare-terminal-tools.mjs"]) {
      expect(hostCompatibilityJob).toContain(
        `working-directory: host\n        run: node scripts/${script}`,
      );
    }
  });

  test("uses checked-in SDK source for every frontend pull request", () => {
    expect(frontendWorkflow).not.toContain("fetch-public-typescript-sdk");
    expect(frontendWorkflow).not.toContain("repository: BANG404/openagent-runtime");
    expect(frontendWorkflow).not.toContain("create-github-app-token");
    expect(ciWorkflow).toContain("if: needs.changes.outputs.frontend == 'true'");
  });

  test("keeps release binaries and generated Tauri commands size-oriented", () => {
    expect(nativeCargoManifest).toContain("[profile.release]");
    expect(nativeCargoManifest).toContain("codegen-units = 1");
    expect(nativeCargoManifest).toContain("lto = true");
    expect(nativeCargoManifest).toContain('opt-level = "s"');
    expect(nativeCargoManifest).toContain('panic = "abort"');
    expect(nativeCargoManifest).toContain("strip = true");
    expect(tauriConfig.build.removeUnusedCommands).toBe(false);
  });

  test("runs each Windows sandbox capability in its own test target", () => {
    for (const workflow of [sdkWorkflow]) {
      expect(workflow).toContain("name: Exercise confined plugin MCP on Windows");
      expect(workflow).toContain("-p openagent-server --test plugin_process_confinement");
      expect(workflow).toContain(
        "-p openagent-server --test windows_process_sandbox $test -- --exact --test-threads=1",
      );
      expect(workflow).not.toContain("-p openagent-server $test");
    }
    expect(sdkWorkflow).toContain(
      "restricted_token_writes_workspace_and_blocks_outside_and_metadata",
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

  test("qualifies immutable candidates and reuses the staged SDK Runtime before tagging", () => {
    expect(prepareReleaseWorkflow).toContain("Require administrator push token");
    expect(prepareReleaseWorkflow).toContain(
      'git push origin "$release_sha:refs/heads/$RELEASE_BASE_BRANCH"',
    );
    expect(prepareReleaseWorkflow).not.toContain("gh pr create");
    expect(prepareReleaseWorkflow).not.toContain("gh workflow run ci.yml");

    expect(releaseWorkflow).toContain("push:");
    expect(releaseWorkflow).toContain("- .github/release.json");
    expect(releaseWorkflow).toContain("name: Qualify changed components and shared release policy");
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
    expect(qualifyJob).toContain("needs: [detect, component-plan]");
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
    expect(buildJob).toContain("release-candidate-artifacts.mjs stage-lightweight");
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
    expect(tauriConfig.bundle.resources).toEqual({
      "resources/release-identity/": "release-identity/",
      "resources/node-runtime/": "node-runtime/",
      "resources/terminal-tools/": "terminal-tools/",
    });
    expect(fullTauriConfig.bundle.createUpdaterArtifacts).toBe(false);
    expect(fullTauriConfig.bundle.resources).toEqual({
      "resources/release-identity/": "release-identity/",
      "resources/node-runtime/": "node-runtime/",
      "resources/terminal-tools/": "terminal-tools/",
      "resources/bootstrap-release/": "bootstrap-release/",
    });
    expect(releaseWorkflow).toContain("Build full first-install bundle");
    expect(releaseWorkflow).toContain(
      "bun run tauri:bundle -- --config src-tauri/tauri.full.conf.json ${{ matrix.args }}",
    );
    expect(releaseWorkflow).toContain("release-candidate-artifacts.mjs stage-full");
    expect(releaseWorkflow).not.toContain("upload-full-release-asset.mjs");
  });

  test("ships a target-specific Node.js in shell installers, updates and Store packages", () => {
    expect(tauriConfig.build.beforeBuildCommand).toContain("bun scripts/prepare-node-runtime.mjs");
    expect(releaseWorkflow).toContain("OPENAGENT_NODE_TARGET: ${{ matrix.sidecar_target }}");
    expect(releaseWorkflow).toContain('Copy-Item "src-tauri\\resources\\node-runtime"');
    expect(nativeWorkflow).toContain("name: Prepare bundled plugin Node.js");
  });

  test("ships terminal commands for the installer target in every shell layout", () => {
    expect(tauriConfig.build.beforeBuildCommand).toContain(
      "bun scripts/prepare-terminal-tools.mjs",
    );
    expect(releaseWorkflow).toContain(
      "OPENAGENT_TERMINAL_TOOLS_TARGET: ${{ matrix.sidecar_target }}",
    );
    expect(releaseWorkflow).toContain('Copy-Item "src-tauri\\resources\\terminal-tools"');
    expect(nativeWorkflow).toContain("name: Prepare bundled terminal tools");
  });

  test("publishes signed runtime and frontend component channels", () => {
    expect(tauriConfig.bundle.externalBin).toEqual([]);
    expect(tauriConfig.build.frontendDist).toBe("../.cache/bootstrap-dist");
    expect(releaseWorkflow).toContain("runtime-components:");
    expect(releaseWorkflow).toContain('component_channel="runtime-$RELEASE_CHANNEL"');
    expect(releaseWorkflow).toContain("openagent-sdk-manifest.json.sig");
    expect(releaseWorkflow).toContain("frontend-components:");
    expect(releaseWorkflow).toContain("scripts/frontend-artifacts.mjs");
    expect(
      releaseWorkflow.match(
        /signer sign --private-key "\$TAURI_SIGNING_PRIVATE_KEY" --password ""/g,
      ),
    ).toHaveLength(4);
    expect(releaseWorkflow).toContain('component_channel="frontend-$RELEASE_CHANNEL"');
    expect(releaseWorkflow).toContain("openagent-frontend-manifest.json.sig");
  });

  test("retains component selection while packaging every product release", () => {
    expect(releaseWorkflow).toContain(
      "const components = manifest.components ?? { frontend: true, runtime: true, nativeShell: true };",
    );
    expect(releaseWorkflow).toContain("console.log(`frontend=${components.frontend === true}`)");
    expect(releaseWorkflow).toContain("console.log(`runtime=${components.runtime === true}`)");
    expect(releaseWorkflow).toContain(
      "console.log(`native_shell=${components.nativeShell === true}`)",
    );
    for (const jobName of [
      "build",
      "distribution-helpers",
      "distribution-resources",
      "runtime-components",
      "frontend-components",
      "publish-native-assets",
      "publish-distribution-resources",
    ]) {
      const job = releaseWorkflow.split(`  ${jobName}:\n`)[1].split(/^ {2}[\w-]+:/m)[0];
      expect(job).not.toContain("needs.detect.outputs.native_shell");
      expect(job).not.toContain("needs.detect.outputs.frontend");
      expect(job).not.toContain("needs.detect.outputs.runtime");
      expect(job).toContain("outputs.published != 'true'");
    }
    expect(releaseWorkflow).toContain("--no-bundle --config .github/tauri-prebuilt.conf.json");
    expect(releaseWorkflow).toContain(
      "name: Bundle lightweight release candidate from compiled shell",
    );
    expect(releaseWorkflow).not.toContain("name: Build runtime candidate");
    expect(releaseWorkflow).toContain("name: Verify and stage runtime candidate");
    expect(releaseWorkflow).toContain("name: pinned-sdk-runtime");
    expect(releaseWorkflow).not.toContain("pattern: runtime-component-*");
    expect(
      releaseWorkflow.match(/OPENAGENT_RUNTIME_TARGET: \$\{\{ matrix\.sidecar_target \}\}/g),
    ).toHaveLength(3);
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
    const pendingJob = sdkWorkflow.split("  pending:\n")[1].split("  rust-format:\n")[0];
    expect(pendingJob).toContain("if: inputs.publish_dev && inputs.full");
    expect(pendingJob).toContain("sparse-checkout: |");
    expect(pendingJob).toContain("Cargo.toml");
    expect(pendingJob).toContain("scripts/public-protocol.mjs");
    expect(pendingJob).toContain("run: node scripts/runtime-protocol.mjs");
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

  test("refreshes installer channels and Store packages without requiring shell source changes", () => {
    const frontendJob = releaseWorkflow.match(
      / {2}frontend-components:\n(?<job>[\s\S]*?)\n {2}publish-native-assets:/,
    )?.groups?.job;
    const storeJob = releaseWorkflow.match(
      / {2}publish-store:\n(?<job>[\s\S]*?)\n {2}publish-plugins:/,
    )?.groups?.job;

    expect(frontendJob).not.toContain("- build");
    expect(frontendJob).toContain("repository: BANG404/openagent-runtime");
    expect(frontendJob).not.toContain("needs.detect.outputs.frontend");
    expect(storeJob).not.toContain("needs.detect.outputs.native_shell");
    expect(storeJob).toContain("needs.detect.outputs.prerelease != 'true'");
    expect(releaseWorkflow).toContain("if: needs.detect.outputs.prerelease == 'true'");
    expect(releaseWorkflow).toContain("needs.detect.outputs.runtime == 'true'");
  });

  test("refreshes an unpublished Beta marker onto the latest main source", () => {
    expect(prepareReleaseWorkflow).toContain("ref: main");
    expect(prepareReleaseWorkflow).toContain(
      "git fetch origin refs/heads/main:refs/remotes/origin/main",
    );
    expect(prepareReleaseWorkflow).toContain('automation_sha="$(git rev-parse origin/main)"');
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
