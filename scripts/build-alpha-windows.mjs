import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALPHA_VERSION, stampAlphaBuild } from "./alpha-release-plan.mjs";
import {
  createAlphaRuntimeManifest,
  verifyAlphaDistribution,
  verifyAlphaCandidate,
  writeAlphaCandidate,
} from "./alpha-artifacts.mjs";
import { bindRuntimeHelpers } from "./bind-runtime-helpers.mjs";
import { createDistribution } from "./distribution-artifacts.mjs";
import { stageReleaseIdentity } from "./stage-release-identity.mjs";
import { createFrontendManifest } from "./frontend-artifacts.mjs";
import { stageDistribution } from "./stage-distribution.mjs";
import { readRuntimeProtocol } from "./runtime-protocol.mjs";
import { stageFullInstaller } from "./release-candidate-artifacts.mjs";
import {
  checkUpdateDataCompatibility,
  downloadBaseline,
} from "./check-update-data-compatibility.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

/** @param {string} command @param {string[]} args @param {{privateOutput?: boolean; env?: NodeJS.ProcessEnv; cwd?: string}} [options] */
function run(command, args, { privateOutput = false, env = process.env, cwd = root } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: privateOutput ? "ignore" : "inherit",
  });
  if (result.error || result.status !== 0)
    throw new Error(`Alpha build stage failed: ${command} ${args[0] ?? ""}`);
}

/** @param {string} file @param {NodeJS.ProcessEnv} environment */
function sign(file, environment) {
  run(process.execPath, ["scripts/tauri.mjs", "signer", "sign", file], {
    privateOutput: true,
    env: environment,
  });
}

/** @param {string} file @param {string} name */
async function rustConstant(file, name) {
  const value = (await readFile(path.join(root, file), "utf8")).match(
    new RegExp(`pub const ${name}: u32 = (\\d+);`),
  )?.[1];
  if (!value) throw new Error(`Missing protocol constant: ${name}`);
  return Number(value);
}

/** This command stamps its checkout. Call only inside a disposable build worktree.
 * @param {{version: string; sourceSha: string; sdkSha: string; baselineTag: string; output: string}} options
 */
export async function buildAlphaWindows({ version, sourceSha, sdkSha, baselineTag, output }) {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("Alpha currently builds on Windows x64 only");
  if (
    !ALPHA_VERSION.test(version) ||
    !/^[a-f0-9]{40}$/.test(sourceSha) ||
    !/^[a-f0-9]{40}$/.test(sdkSha)
  )
    throw new Error("Invalid Alpha build identity");
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !process.env.TAURI_SIGNING_PRIVATE_KEY_PATH)
    throw new Error("Alpha requires the existing production signing key or its local file path");
  /** @param {string[]} args */
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  if (!process.env.CI && git(["rev-parse", "--git-dir"]) === git(["rev-parse", "--git-common-dir"]))
    throw new Error(
      "Local Alpha builds require an isolated worktree; the default checkout must stay intact",
    );
  if (
    git(["rev-parse", "HEAD"]) !== sourceSha ||
    git(["rev-parse", "HEAD:runtime"]) !== sdkSha ||
    git(["-C", "runtime", "rev-parse", "HEAD"]) !== sdkSha
  )
    throw new Error("Alpha source checkout disagrees with requested immutable revisions");
  if (git(["status", "--porcelain", "--untracked-files=no"]))
    throw new Error("Alpha requires an unchanged disposable source checkout");
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length) throw new Error("Alpha output directory must be empty");
  await mkdir(path.join(root, ".cache"), { recursive: true });
  const work = await mkdtemp(path.join(root, ".cache", "alpha-build-"));
  const environment = {
    ...process.env,
    OPENAGENT_DEV_RUNTIME_SOURCE: "1",
    OPENAGENT_RUNTIME_TARGET: undefined,
    CARGO_BUILD_TARGET: undefined,
    OPENAGENT_RUNTIME_SERVER_PREBUILT: "0",
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "",
  };
  await stampAlphaBuild(root, version);
  const sdkRoot = path.join(root, "runtime");
  let sdkVersion;
  try {
    sdkVersion = JSON.parse(
      execFileSync(process.execPath, ["scripts/release-version.mjs", "--sha", sdkSha], {
        cwd: sdkRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    ).version;
  } catch {
    throw new Error("Unable to resolve independent SDK version from the pinned source history");
  }
  run(process.execPath, ["scripts/release.mjs", "--set", sdkVersion], {
    cwd: sdkRoot,
    privateOutput: true,
  });
  const runtimeDirectory = path.join(work, "runtime");
  const frontendDirectory = path.join(work, "frontend");
  const distributionDirectory = path.join(work, "distribution");
  const modelDirectory = path.join(root, "src-tauri/resources/models/all-MiniLM-L6-v2-q");
  const helperDirectory = path.join(root, "src-tauri/resources/codex-resources");
  const privateEnvironment = {
    ...environment,
    CARGO_TARGET_DIR: path.join(root, "runtime/target"),
    CARGO_INCREMENTAL: "0",
  };
  console.log("Building exact Alpha Runtime and Windows helpers");
  run(process.execPath, ["scripts/prepare-windows-sandbox-helpers.mjs", "--profile", "release"], {
    privateOutput: true,
    env: privateEnvironment,
  });
  run(
    process.execPath,
    [
      "scripts/prepare-runtime-server.mjs",
      "--profile",
      "release",
      "--target",
      "x86_64-pc-windows-msvc",
    ],
    {
      privateOutput: true,
      env: privateEnvironment,
    },
  );
  const binary = path.join(root, "src-tauri/binaries/openagent-server-x86_64-pc-windows-msvc.exe");
  const runtimeProtocol = readRuntimeProtocol(root);
  const hostProtocol = await rustConstant(
    "crates/openagent-protocol/src/lib.rs",
    "SDK_PROTOCOL_VERSION",
  );
  if (hostProtocol !== runtimeProtocol)
    throw new Error("Alpha shell and Runtime protocols disagree");
  await createAlphaRuntimeManifest({
    directory: runtimeDirectory,
    binary,
    sdkSha,
    version,
    sdkVersion,
    protocol: runtimeProtocol,
  });
  await bindRuntimeHelpers(runtimeDirectory, helperDirectory, ["windows-x64"]);
  sign(path.join(runtimeDirectory, "openagent-sdk-manifest.json"), environment);

  console.log("Checking Windows upgrade data with the published baseline");
  const baselineDirectory = path.join(work, "baseline");
  const baselineBinary = await downloadBaseline(baselineTag, "windows-x64", baselineDirectory);
  await checkUpdateDataCompatibility({ baselineBinary, candidateBinary: binary });

  run(process.execPath, ["run", "build"], { env: environment });
  await mkdir(frontendDirectory);
  const archive = path.join(frontendDirectory, "openagent-frontend.tar.gz");
  // USTAR works with both Windows bsdtar and GNU tar without a platform-specific flag.
  run("tar", ["--format", "ustar", "-C", "build", "-czf", archive, "."]);
  const frontendManifest = await createFrontendManifest({
    archive,
    assets: path.join(root, "build"),
    version,
    shellProtocolVersion: await rustConstant(
      "src-tauri/src/frontend_resource.rs",
      "FRONTEND_HOST_PROTOCOL_VERSION",
    ),
    runtimeProtocolVersion: runtimeProtocol,
  });
  await writeFile(
    path.join(frontendDirectory, "openagent-frontend-manifest.json"),
    `${JSON.stringify(frontendManifest, null, 2)}\n`,
  );
  sign(path.join(frontendDirectory, "openagent-frontend-manifest.json"), environment);
  run(process.execPath, ["scripts/fetch-embedding-model.mjs"]);
  await createDistribution({
    directory: distributionDirectory,
    runtimeDirectory,
    frontendDirectory,
    modelDirectory,
    helperDirectory,
    version,
    sdkSha,
    targets: ["windows-x64"],
  });
  sign(path.join(distributionDirectory, "openagent-distribution.json"), environment);
  await verifyAlphaDistribution({ directory: distributionDirectory, version, sdkSha });
  await stageReleaseIdentity(
    distributionDirectory,
    path.join(root, "src-tauri/resources/release-identity"),
  );
  await stageDistribution({
    source: distributionDirectory,
    destination: path.join(root, "src-tauri/resources/bootstrap-release"),
    target: "windows-x64",
  });

  // Frontend is already built. The shell only needs its independent bootstrap and pinned resources.
  const config = path.join(work, "shell-build.json");
  await writeFile(
    config,
    JSON.stringify({
      build: {
        beforeBuildCommand:
          "bun scripts/prepare-node-runtime.mjs && bun scripts/prepare-terminal-tools.mjs && bun run build:bootstrap",
      },
    }),
  );
  const shellEnvironment = {
    ...environment,
    CARGO_TARGET_DIR: path.join(root, "src-tauri/target"),
  };
  run(process.execPath, ["scripts/tauri-build.mjs", "--bundles", "nsis", "--config", config], {
    env: shellEnvironment,
  });
  const nsis = path.join(root, "src-tauri/target/release/bundle/nsis");
  const lightweight = (await readdir(nsis)).filter(
    (name) => name.includes(version) && name.endsWith("-setup.exe"),
  );
  if (lightweight.length !== 1) throw new Error("Expected exactly one Alpha lightweight installer");
  for (const name of [lightweight[0], `${lightweight[0]}.sig`])
    await copyFile(path.join(nsis, name), path.join(output, name));
  run(
    process.execPath,
    ["scripts/tauri-bundle.mjs", "--bundles", "nsis", "--config", "src-tauri/tauri.full.conf.json"],
    { env: shellEnvironment },
  );
  await stageFullInstaller({
    bundleRoot: path.join(root, "src-tauri/target"),
    outputDirectory: output,
    target: "windows-x64",
    version,
  });
  await cp(distributionDirectory, output, { recursive: true });
  const url = `https://github.com/BANG404/openagent/releases/download/v${version}/${encodeURIComponent(lightweight[0])}`;
  const entry = {
    url,
    signature: await readFile(path.join(output, `${lightweight[0]}.sig`), "utf8"),
  };
  const updater = {
    version,
    notes: "Windows Alpha preview",
    pub_date: new Date().toISOString(),
    platforms: { "windows-x86_64": entry, "windows-x86_64-nsis": entry },
  };
  await writeFile(path.join(output, "latest.json"), `${JSON.stringify(updater, null, 2)}\n`);
  await writeAlphaCandidate({ directory: output, version, sourceSha, sdkSha, baselineTag });
  sign(path.join(output, "alpha-candidate.json"), environment);
  await verifyAlphaCandidate({ directory: output, version, sourceSha, sdkSha });
  await rm(work, { recursive: true, force: true });
  console.log(`Complete signed Windows Alpha candidate: ${output}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  /** @param {string} name */
  const option = (name) => {
    const index = args.indexOf(name);
    if (index < 0 || !args[index + 1]) throw new Error(`${name} is required`);
    return args[index + 1];
  };
  await buildAlphaWindows({
    version: option("--version"),
    sourceSha: option("--source-sha"),
    sdkSha: option("--sdk-sha"),
    baselineTag: option("--baseline-tag"),
    output: path.resolve(option("--output")),
  });
}
