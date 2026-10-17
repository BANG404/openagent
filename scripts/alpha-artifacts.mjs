import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ALPHA_VERSION } from "./alpha-release-plan.mjs";
import { requireArtifact, verifyArtifactBytes, verifySignedBytes } from "./signed-artifacts.mjs";

export const WINDOWS_ALPHA_HELPERS = [
  "codex-windows-sandbox-setup.exe",
  "codex-command-runner.exe",
];

/** @typedef {{file: string; size: number; sha256: string}} AlphaArtifact */
/** @typedef {{schema_version: number; channel: string; version: string; source_sha: string; sdk_sha: string; baseline_tag: string; target: string; assets: AlphaArtifact[]}} AlphaCandidate */

/** @param {{file: string; size: number; sha256: string}} a @param {{file: string; size: number; sha256: string}} b */
function sameArtifact(a, b) {
  return a.file === b.file && a.size === b.size && a.sha256 === b.sha256;
}

/** Installer asset names may contain spaces; resource manifests keep their stricter names.
 * @param {{file: string; size: number; sha256: string}} artifact
 */
function requireCandidateArtifact(artifact) {
  if (
    !artifact ||
    !/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(artifact.file) ||
    !Number.isSafeInteger(artifact.size) ||
    artifact.size <= 0 ||
    artifact.size > 512 * 1024 * 1024 ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256)
  )
    throw new Error("Invalid Alpha candidate asset");
  return artifact;
}

/** @param {string} directory @param {string} file */
export async function describeAlphaArtifact(directory, file) {
  const bytes = await readFile(path.join(directory, file));
  return requireCandidateArtifact({
    file,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

/** Windows Alpha owns its candidate identity without creating a formal SDK release.
 * @param {{directory: string; binary: string; sdkSha: string; version: string; sdkVersion: string; protocol: number}} options
 */
export async function createAlphaRuntimeManifest({
  directory,
  binary,
  sdkSha,
  version,
  sdkVersion,
  protocol,
}) {
  if (
    !ALPHA_VERSION.test(version) ||
    !/^[a-f0-9]{40}$/.test(sdkSha) ||
    !Number.isInteger(protocol) ||
    protocol < 1
  )
    throw new Error("Invalid Alpha Runtime identity");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(sdkVersion))
    throw new Error("Invalid source SDK version");
  await mkdir(directory, { recursive: true });
  const file = "openagent-server-windows-x64.exe";
  await copyFile(binary, path.join(directory, file));
  const manifest = {
    schema_version: 1,
    sdk_sha: sdkSha,
    version: `${sdkVersion}+desktop.${version}`,
    release_version: version,
    protocol: { min: protocol, max: protocol },
    artifacts: { "windows-x64": await describeAlphaArtifact(directory, file) },
  };
  await writeFile(
    path.join(directory, "openagent-sdk-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

/** Verify the signed distribution and every component before packaging/publication.
 * @param {{directory: string; version: string; sdkSha: string; publicKey?: string}} options
 */
export async function verifyAlphaDistribution({ directory, version, sdkSha, publicKey }) {
  if (!ALPHA_VERSION.test(version) || !/^[a-f0-9]{40}$/.test(sdkSha))
    throw new Error("Invalid Alpha identity");
  /** @param {string} file */
  const signed = async (file) => {
    const bytes = await readFile(path.join(directory, file));
    verifySignedBytes(
      bytes,
      await readFile(path.join(directory, `${file}.sig`), "utf8"),
      publicKey,
    );
    return JSON.parse(bytes.toString("utf8"));
  };
  const distribution = await signed("openagent-distribution.json");
  const runtime = await signed("openagent-sdk-manifest.json");
  const frontend = await signed("openagent-frontend-manifest.json");
  if (
    distribution.schema_version !== 1 ||
    distribution.version !== version ||
    distribution.sdk_sha !== sdkSha ||
    runtime.schema_version !== 1 ||
    runtime.sdk_sha !== sdkSha ||
    runtime.release_version !== version ||
    frontend.schema_version !== 2 ||
    frontend.version !== version ||
    JSON.stringify(Object.keys(runtime.artifacts)) !== '["windows-x64"]' ||
    JSON.stringify(Object.keys(distribution.runtime)) !== '["windows-x64"]'
  )
    throw new Error("Alpha component source or version mismatch");
  const manifests = ["openagent-sdk-manifest.json", "openagent-frontend-manifest.json"];
  for (const file of manifests.flatMap((file) => [file, `${file}.sig`])) {
    const descriptor = requireArtifact(distribution.manifests[file]);
    if (descriptor.file !== file) throw new Error("Alpha manifest filename mismatch");
    verifyArtifactBytes(await readFile(path.join(directory, file)), descriptor);
  }
  const runtimeArtifact = requireArtifact(runtime.artifacts["windows-x64"]);
  if (
    !sameArtifact(distribution.runtime["windows-x64"], runtimeArtifact) ||
    !sameArtifact(distribution.frontend, frontend.artifact) ||
    distribution.runtime_version !== runtime.version ||
    JSON.stringify(distribution.shell_protocol) !== JSON.stringify(frontend.compatibility.shell) ||
    JSON.stringify(distribution.runtime_protocol) !== JSON.stringify(runtime.protocol) ||
    frontend.compatibility.runtime.min > runtime.protocol.min ||
    frontend.compatibility.runtime.max < runtime.protocol.max
  )
    throw new Error("Alpha distribution disagrees with component manifests");
  const modelNames = [
    "LICENSE",
    "config.json",
    "model_quantized.onnx",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
  ];
  if (Object.keys(distribution.embedding).sort().join() !== modelNames.join())
    throw new Error("Incomplete Alpha embedding seed");
  const helpers = WINDOWS_ALPHA_HELPERS.map((name) => {
    const descriptor = requireArtifact(runtime.helpers?.["windows-x64"]?.[name]);
    if (
      descriptor.file !== name ||
      !sameArtifact(descriptor, requireArtifact(distribution.helpers?.["windows-x64"]?.[name]))
    )
      throw new Error("Alpha sandbox helper mismatch");
    return descriptor;
  });
  const descriptors = [
    runtimeArtifact,
    frontend.artifact,
    ...Object.values(distribution.embedding),
    ...helpers,
  ];
  for (const input of descriptors) {
    const descriptor = requireArtifact(input);
    verifyArtifactBytes(await readFile(path.join(directory, descriptor.file)), descriptor);
  }
  return distribution;
}

/** @param {{directory: string; version: string; sourceSha: string; sdkSha: string; baselineTag: string}} options */
export async function writeAlphaCandidate({ directory, version, sourceSha, sdkSha, baselineTag }) {
  const assets = [];
  for (const file of (await readdir(directory)).sort()) {
    if (file === "alpha-candidate.json" || file === "alpha-candidate.json.sig") continue;
    assets.push(await describeAlphaArtifact(directory, file));
  }
  const manifest = {
    schema_version: 1,
    channel: "alpha",
    version,
    source_sha: sourceSha,
    sdk_sha: sdkSha,
    baseline_tag: baselineTag,
    target: "windows-x64",
    assets,
  };
  await writeFile(
    path.join(directory, "alpha-candidate.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

/** @param {{directory: string; version: string; sourceSha: string; sdkSha: string; publicKey?: string}} options
 * @returns {Promise<AlphaCandidate>}
 */
export async function verifyAlphaCandidate({ directory, version, sourceSha, sdkSha, publicKey }) {
  const candidateBytes = await readFile(path.join(directory, "alpha-candidate.json"));
  verifySignedBytes(
    candidateBytes,
    await readFile(path.join(directory, "alpha-candidate.json.sig"), "utf8"),
    publicKey,
  );
  const candidate = JSON.parse(candidateBytes.toString("utf8"));
  if (
    candidate.schema_version !== 1 ||
    candidate.channel !== "alpha" ||
    candidate.target !== "windows-x64" ||
    candidate.version !== version ||
    candidate.source_sha !== sourceSha ||
    candidate.sdk_sha !== sdkSha ||
    !/^[a-f0-9]{40}$/.test(sourceSha) ||
    !Array.isArray(candidate.assets)
  )
    throw new Error("Alpha candidate identity mismatch");
  const names = new Set();
  for (const input of candidate.assets) {
    const artifact = requireCandidateArtifact(input);
    if (names.has(artifact.file)) throw new Error("Duplicate Alpha candidate asset");
    names.add(artifact.file);
    verifyArtifactBytes(await readFile(path.join(directory, artifact.file)), artifact);
  }
  const actual = (await readdir(directory)).filter(
    (file) => file !== "alpha-candidate.json" && file !== "alpha-candidate.json.sig",
  );
  if (actual.length !== names.size || actual.some((file) => !names.has(file)))
    throw new Error("Unexpected Alpha candidate assets");
  const installer = [...names].filter(
    (name) => name.includes(version) && /(?<!-full)(?<!-full-no-webview)-setup\.exe$/.test(name),
  );
  const full = [...names].filter(
    (name) => name.includes(version) && name.endsWith("-full-setup.exe"),
  );
  const noWebview = [...names].filter(
    (name) => name.includes(version) && name.endsWith("-full-no-webview-setup.exe"),
  );
  if (
    installer.length !== 1 ||
    full.length !== 1 ||
    noWebview.length !== 1 ||
    !names.has(`${installer[0]}.sig`) ||
    !names.has("latest.json")
  )
    throw new Error("Incomplete Alpha Windows installer set");
  verifySignedBytes(
    await readFile(path.join(directory, installer[0])),
    await readFile(path.join(directory, `${installer[0]}.sig`), "utf8"),
    publicKey,
  );
  const updater = JSON.parse(await readFile(path.join(directory, "latest.json"), "utf8"));
  const expectedUrl = `https://github.com/BANG404/openagent/releases/download/v${version}/${encodeURIComponent(installer[0])}`;
  if (
    updater.version !== version ||
    Object.keys(updater.platforms ?? {})
      .sort()
      .join() !== "windows-x86_64,windows-x86_64-nsis"
  )
    throw new Error("Alpha updater identity mismatch");
  const signature = await readFile(path.join(directory, `${installer[0]}.sig`), "utf8");
  for (const platform of Object.values(updater.platforms)) {
    if (new URL(platform.url).href !== expectedUrl || platform.signature !== signature)
      throw new Error("Alpha updater must reference the signed lightweight candidate");
  }
  await verifyAlphaDistribution({ directory, version, sdkSha, publicKey });
  return candidate;
}
