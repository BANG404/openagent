import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  downloadArtifact,
  fetchSignedManifest,
  requireArtifact,
  verifySignedBytes,
  verifyArtifactBytes,
} from "./signed-artifacts.mjs";
import { copyFileIfChanged } from "./copy-if-changed.mjs";
import { TAURI_RUNTIME_TARGETS } from "./stage-release-runtime.mjs";
import { readDesktopRuntimeProtocol } from "./runtime-protocol.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const targets = {
  "win32/x64": "x86_64-pc-windows-msvc",
  "linux/x64": "x86_64-unknown-linux-gnu",
  "darwin/x64": "x86_64-apple-darwin",
  "darwin/arm64": "aarch64-apple-darwin",
};

/** @param {string} sdkSha */
export function immutableDevKitUrl(sdkSha) {
  if (!/^[0-9a-f]{40}$/.test(sdkSha)) throw new Error("Invalid SDK commit SHA");
  return `https://github.com/BANG404/openagent/releases/download/runtime-dev-${sdkSha}/sdk-dev-manifest.json`;
}

/** @param {Record<string, unknown>} manifest @param {string} expectedSha @param {string} target @param {number} [protocolVersion] */
export function validateDevKit(
  manifest,
  expectedSha,
  target,
  protocolVersion = readDesktopRuntimeProtocol(),
) {
  if (manifest.schema_version !== 2 || manifest.sdk_sha !== expectedSha) {
    throw new Error(
      `No matching public development kit for SDK ${expectedSha}. Select a published source tag or prepare an exact source kit; another SDK revision is never substituted.`,
    );
  }
  const clients = /** @type {{ typescript?: unknown }} */ (manifest.clients);
  const runtime =
    /** @type {{ sdk_sha: string; version: string; protocol?: { min: number; max: number }; artifacts?: Record<string, unknown> }} */ (
      manifest.runtime
    );
  const helpers = /** @type {Record<string, Record<string, unknown>>} */ (manifest.helpers);
  if (
    !runtime ||
    !/^[a-f0-9]{40}$/.test(runtime.sdk_sha ?? "") ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(runtime.version ?? "")
  ) {
    throw new Error("Development Runtime has no immutable source identity");
  }
  if (
    !runtime?.protocol ||
    !Number.isInteger(runtime.protocol.min) ||
    !Number.isInteger(runtime.protocol.max) ||
    runtime.protocol.min < 1 ||
    runtime.protocol.max > 0xffff_ffff ||
    runtime.protocol.min > protocolVersion ||
    runtime.protocol.max < protocolVersion
  ) {
    throw new Error(`Development Runtime does not support desktop protocol ${protocolVersion}`);
  }
  const requiredHelpers =
    target === "windows-x64"
      ? ["codex-windows-sandbox-setup.exe", "codex-command-runner.exe"]
      : target === "linux-x64"
        ? ["codex-bwrap-linux-x64"]
        : [];
  return {
    client: requireArtifact(clients?.typescript),
    runtime: requireArtifact(runtime.artifacts?.[target]),
    helpers: requiredHelpers.map((name) => {
      const artifact = requireArtifact(helpers?.[target]?.[name]);
      if (artifact.file !== name) throw new Error("Development helper filename mismatch");
      return artifact;
    }),
  };
}

/** @param {{ repositoryRoot?: string; manifestUrl?: string; expectedSdkSha?: string; targetTriple?: string; publicKey?: string; fetchRequest?: typeof fetch }} [options] */
export async function prepareDevKit(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? root;
  const expectedSha =
    options.expectedSdkSha ??
    execFileSync("git", ["rev-parse", "HEAD:runtime"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
  const targetTriple = options.targetTriple ?? targets[`${process.platform}/${process.arch}`];
  const target = TAURI_RUNTIME_TARGETS[targetTriple];
  if (!target) throw new Error(`Unsupported development platform: ${targetTriple}`);
  const manifestUrl = options.manifestUrl ?? immutableDevKitUrl(expectedSha);
  const kitDirectory = path.join(repositoryRoot, ".cache", "openagent-dev-kit");
  const cacheDirectory = path.join(repositoryRoot, ".cache", "openagent-artifacts");
  const signed = await fetchSignedManifest(manifestUrl, options);
  const artifacts = validateDevKit(
    signed.manifest,
    expectedSha,
    target,
    readDesktopRuntimeProtocol(repositoryRoot),
  );
  const allArtifacts = [artifacts.runtime, ...artifacts.helpers];
  const paths = await Promise.all(
    allArtifacts.map((artifact) =>
      downloadArtifact({
        artifact,
        manifestUrl,
        cacheDirectory,
        fetchRequest: options.fetchRequest,
      }),
    ),
  );
  await mkdir(kitDirectory, { recursive: true });
  const extension = target === "windows-x64" ? ".exe" : "";
  const runtimeDestination = path.join(
    repositoryRoot,
    "src-tauri",
    "binaries",
    `openagent-server-${targetTriple}${extension}`,
  );
  await mkdir(path.dirname(runtimeDestination), { recursive: true });
  await copyFileIfChanged(paths[0], runtimeDestination);
  if (!extension) await chmod(runtimeDestination, 0o755);
  for (let index = 0; index < artifacts.helpers.length; index += 1) {
    const artifact = artifacts.helpers[index];
    const destination =
      target === "linux-x64"
        ? path.join(repositoryRoot, "src-tauri", "binaries", `bwrap-${targetTriple}`)
        : path.join(repositoryRoot, "src-tauri", "resources", "codex-resources", artifact.file);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFileIfChanged(paths[index + 1], destination);
    if (target === "linux-x64") await chmod(destination, 0o755);
  }
  await writeFile(path.join(kitDirectory, "sdk-dev-manifest.json"), signed.bytes);
  await writeFile(path.join(kitDirectory, "sdk-dev-manifest.json.sig"), signed.signature);
  await writeFile(
    path.join(kitDirectory, "lock.json"),
    `${JSON.stringify(
      {
        schema_version: 1,
        sdk_sha: expectedSha,
        manifest_url: manifestUrl,
        target,
        runtime: artifacts.runtime,
        helpers: artifacts.helpers,
      },
      null,
      2,
    )}\n`,
  );
  return { sdkSha: expectedSha, target, runtimeDestination, kitDirectory };
}

/** Re-admit the persisted kit without network access before executing any prepared bytes.
 * @param {string} [repositoryRoot]
 */
export async function verifyPreparedDevKit(repositoryRoot = root) {
  const kitDirectory = path.join(repositoryRoot, ".cache", "openagent-dev-kit");
  const bytes = await readFile(path.join(kitDirectory, "sdk-dev-manifest.json"));
  const signature = await readFile(path.join(kitDirectory, "sdk-dev-manifest.json.sig"), "utf8");
  verifySignedBytes(bytes, signature);
  const expectedSha = execFileSync("git", ["rev-parse", "HEAD:runtime"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  const targetTriple = targets[`${process.platform}/${process.arch}`];
  const target = TAURI_RUNTIME_TARGETS[targetTriple];
  const artifacts = validateDevKit(
    JSON.parse(bytes.toString("utf8")),
    expectedSha,
    target,
    readDesktopRuntimeProtocol(repositoryRoot),
  );
  const extension = target === "windows-x64" ? ".exe" : "";
  verifyArtifactBytes(
    await readFile(
      path.join(
        repositoryRoot,
        "src-tauri",
        "binaries",
        `openagent-server-${targetTriple}${extension}`,
      ),
    ),
    artifacts.runtime,
  );
  for (const helper of artifacts.helpers) {
    const destination =
      target === "linux-x64"
        ? path.join(repositoryRoot, "src-tauri", "binaries", `bwrap-${targetTriple}`)
        : path.join(repositoryRoot, "src-tauri", "resources", "codex-resources", helper.file);
    verifyArtifactBytes(await readFile(destination), helper);
  }
  return artifacts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  let manifestUrl = value("--manifest-url");
  const release = value("--release");
  if (release) {
    if (!/^v\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?$/.test(release)) throw new Error("Invalid release tag");
    manifestUrl = `https://github.com/BANG404/openagent/releases/download/${release}/sdk-dev-manifest.json`;
  }
  const result = await prepareDevKit({ manifestUrl, targetTriple: value("--target") });
  console.log(`Prepared verified SDK ${result.sdkSha} for ${result.target}.`);
}
