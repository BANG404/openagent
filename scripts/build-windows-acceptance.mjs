// @ts-check
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { signingFixture } from "../tests/fixtures/minisign.mjs";
import { bindRuntimeHelpers } from "./bind-runtime-helpers.mjs";
import { createDistribution } from "./distribution-artifacts.mjs";
import { createFrontendManifest } from "./frontend-artifacts.mjs";
import { stageDistribution } from "./stage-distribution.mjs";
import { stageReleaseIdentity } from "./stage-release-identity.mjs";
import { readDesktopRuntimeProtocol } from "./runtime-protocol.mjs";
import {
  ACCEPTANCE_IDENTIFIER,
  describe,
  writeCandidate,
  verifyCandidate,
} from "./windows-acceptance-artifacts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

/** @param {string[]} args */
const git = (args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();

/** Builds both installers from one release-mode shell in a disposable worktree.
 * @param {{output: string}} options
 */
export async function buildWindowsAcceptance({ output }) {
  assert(process.platform === "win32" && process.arch === "x64", "Windows x64 is required");
  assert(
    git(["rev-parse", "--git-dir"]) !== git(["rev-parse", "--git-common-dir"]),
    "Use an isolated build worktree",
  );
  assert(
    !git(["status", "--porcelain", "--untracked-files=no"]),
    "Build requires a clean committed source checkout",
  );
  const sourceSha = git(["rev-parse", "HEAD"]);
  const sdkSha = git(["rev-parse", "HEAD:runtime"]);
  assert(
    git(["-C", "runtime", "rev-parse", "HEAD"]) === sdkSha,
    "Runtime source disagrees with gitlink",
  );
  assert(
    !git(["-C", "runtime", "status", "--porcelain", "--untracked-files=no"]),
    "Runtime source must be unchanged",
  );
  await mkdir(output, { recursive: true });
  assert((await readdir(output)).length === 0, "Output directory must be empty");
  await mkdir(path.join(root, ".cache"), { recursive: true });
  const work = await mkdtemp(path.join(root, ".cache", "windows-acceptance-"));
  const signer = signingFixture();
  /** @type {NodeJS.ProcessEnv} */
  const environment = {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: undefined,
    TAURI_SIGNING_PRIVATE_KEY_PATH: undefined,
    CARGO_BUILD_TARGET: undefined,
    OPENAGENT_ACCEPTANCE_PUBLIC_KEY: signer.publicKey,
    OPENAGENT_DEV_RUNTIME_SOURCE: "1",
    OPENAGENT_RUNTIME_SERVER_PREBUILT: "0",
  };
  /** @param {string} command @param {string[]} args @param {boolean} [privateOutput] */
  function run(command, args, privateOutput = false) {
    const result = spawnSync(command, args, {
      cwd: root,
      env: environment,
      windowsHide: true,
      stdio: privateOutput ? "ignore" : "inherit",
    });
    assert(!result.error && result.status === 0, `Acceptance build failed: ${args[0] ?? command}`);
  }
  /** @param {string} file */
  const signFile = async (file) => writeFile(`${file}.sig`, signer.sign(await readFile(file)));
  const version = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
  {
    environment.CARGO_TARGET_DIR = path.join(root, "runtime/target");
    console.log("Compiling pinned Release Runtime and Windows helpers (private output suppressed)");
    run(
      process.execPath,
      ["scripts/prepare-windows-sandbox-helpers.mjs", "--profile", "release"],
      true,
    );
    run(
      process.execPath,
      [
        "scripts/prepare-runtime-server.mjs",
        "--profile",
        "release",
        "--target",
        "x86_64-pc-windows-msvc",
      ],
      true,
    );
  }
  const runtime = path.join(work, "runtime");
  const frontend = path.join(work, "frontend");
  const resources = path.join(work, "resources");
  await mkdir(runtime);
  await mkdir(frontend);
  const protocol = readDesktopRuntimeProtocol(root);
  const runtimeName = "openagent-server-windows-x64.exe";
  await copyFile(
    path.join(root, "src-tauri/binaries/openagent-server-x86_64-pc-windows-msvc.exe"),
    path.join(runtime, runtimeName),
  );
  const sdkCargo = await readFile(
    path.join(root, "runtime/rust/openagent-server/Cargo.toml"),
    "utf8",
  );
  const sdkVersion = sdkCargo.match(/^version = "([^"]+)"/m)?.[1];
  assert(sdkVersion, "Missing Runtime version");
  await writeFile(
    path.join(runtime, "openagent-sdk-manifest.json"),
    JSON.stringify({
      schema_version: 1,
      sdk_sha: sdkSha,
      version: `${sdkVersion}+acceptance.${sourceSha.slice(0, 12)}`,
      release_version: version,
      protocol: { min: protocol, max: protocol },
      artifacts: { "windows-x64": await describe(runtime, runtimeName) },
    }),
  );
  const helpers = path.join(root, "src-tauri/resources/codex-resources");
  await bindRuntimeHelpers(runtime, helpers, ["windows-x64"]);
  await signFile(path.join(runtime, "openagent-sdk-manifest.json"));
  run(process.execPath, ["run", "build"]);
  const archive = path.join(frontend, "openagent-frontend.tar.gz");
  run(path.join(process.env.SystemRoot ?? "C:/Windows", "System32/tar.exe"), [
    "--format",
    "ustar",
    "-C",
    "build",
    "-czf",
    archive,
    ".",
  ]);
  const shellSource = await readFile(path.join(root, "src-tauri/src/frontend_resource.rs"), "utf8");
  const shellProtocol = Number(
    shellSource.match(/pub const FRONTEND_HOST_PROTOCOL_VERSION: u32 = (\d+)/)?.[1],
  );
  assert(Number.isSafeInteger(shellProtocol) && shellProtocol > 0, "Missing shell protocol");
  await writeFile(
    path.join(frontend, "openagent-frontend-manifest.json"),
    JSON.stringify(
      await createFrontendManifest({
        archive,
        assets: path.join(root, "build"),
        version,
        shellProtocolVersion: shellProtocol,
        runtimeProtocolVersion: protocol,
      }),
    ),
  );
  await signFile(path.join(frontend, "openagent-frontend-manifest.json"));
  run(process.execPath, ["scripts/fetch-embedding-model.mjs"]);
  await createDistribution({
    directory: resources,
    runtimeDirectory: runtime,
    frontendDirectory: frontend,
    helperDirectory: helpers,
    modelDirectory: path.join(root, "src-tauri/resources/models/all-MiniLM-L6-v2-q"),
    version,
    sdkSha,
    targets: ["windows-x64"],
  });
  await signFile(path.join(resources, "openagent-distribution.json"));
  await stageReleaseIdentity(
    resources,
    path.join(root, "src-tauri/resources/release-identity"),
    signer.publicKey,
  );
  await stageDistribution({
    source: resources,
    destination: path.join(root, "src-tauri/resources/bootstrap-release"),
    target: "windows-x64",
    publicKey: signer.publicKey,
  });
  const config = path.join(work, "shell.json");
  const baseConfig = JSON.parse(
    await readFile(path.join(root, "src-tauri/tauri.conf.json"), "utf8"),
  );
  await writeFile(
    config,
    JSON.stringify({
      identifier: ACCEPTANCE_IDENTIFIER,
      productName: "OpenAgent Acceptance",
      app: {
        windows: baseConfig.app.windows.map((/** @type {object} */ window) => ({
          ...window,
          title: "OpenAgent Acceptance",
        })),
      },
      build: {
        beforeBuildCommand:
          "bun scripts/prepare-node-runtime.mjs && bun scripts/prepare-terminal-tools.mjs && bun run build:bootstrap",
      },
      bundle: { createUpdaterArtifacts: false },
      plugins: {
        updater: { pubkey: Buffer.from(signer.publicKey).toString("base64"), endpoints: [] },
      },
    }),
  );
  environment.CARGO_TARGET_DIR = path.join(root, ".cache/acceptance-target");
  const common = ["--features", "acceptance", "--bundles", "nsis", "--config", config];
  run(process.execPath, [
    "scripts/tauri-build.mjs",
    ...common,
    "--",
    "--config",
    path.join(root, ".cargo/acceptance.toml"),
  ]);
  const bundles = path.join(environment.CARGO_TARGET_DIR, "release/bundle/nsis");
  const names = (await readdir(bundles)).filter(
    (name) => name.includes(version) && name.endsWith("-setup.exe"),
  );
  assert(names.length === 1, "Expected one online installer");
  const online = `OpenAgent-Acceptance_${version}_online-setup.exe`;
  const offline = `OpenAgent-Acceptance_${version}_offline-setup.exe`;
  await copyFile(path.join(bundles, names[0]), path.join(output, online));
  run(process.execPath, [
    "scripts/tauri-bundle.mjs",
    ...common,
    "--config",
    "src-tauri/tauri.full.conf.json",
  ]);
  await copyFile(path.join(bundles, names[0]), path.join(output, offline));
  await cp(resources, output, { recursive: true });
  const pilot = execFileSync("where.exe", ["tauri-pilot.exe"], {
    encoding: "utf8",
    windowsHide: true,
  })
    .trim()
    .split(/\r?\n/)[0];
  assert(
    execFileSync(pilot, ["--version"], { encoding: "utf8", windowsHide: true }).trim() ===
      "tauri-pilot 0.7.2",
    "Install the pinned tauri-pilot 0.7.2 CLI",
  );
  await copyFile(pilot, path.join(output, "tauri-pilot.exe"));
  await writeCandidate(output, {
    version,
    source_sha: sourceSha,
    sdk_sha: sdkSha,
    public_key: signer.publicKey,
    installers: { online, offline },
  });
  await verifyCandidate(output);
  console.log(`Verified online and offline acceptance installers: ${output}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf("--output");
  assert(index >= 0 && process.argv[index + 1], "--output is required");
  await buildWindowsAcceptance({
    output: path.resolve(process.argv[index + 1]),
  });
}
