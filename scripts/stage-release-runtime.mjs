import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const RELEASE_RUNTIME_ARTIFACTS = {
  "linux-x64": "openagent-server-linux-x64",
  "macos-arm64": "openagent-server-macos-arm64",
  "macos-x64": "openagent-server-macos-x64",
  "windows-x64": "openagent-server-windows-x64.exe",
};

export const TAURI_RUNTIME_TARGETS = {
  "aarch64-apple-darwin": "macos-arm64",
  "x86_64-apple-darwin": "macos-x64",
  "x86_64-pc-windows-msvc": "windows-x64",
  "x86_64-unknown-linux-gnu": "linux-x64",
};

async function verifyArtifact(directory, target, expectedFile, descriptor) {
  if (descriptor?.file !== expectedFile) {
    throw new Error(`Runtime manifest has an unexpected file for ${target}.`);
  }
  if (!/^[0-9a-f]{64}$/.test(descriptor.sha256 ?? "")) {
    throw new Error(`Runtime manifest has an invalid SHA-256 for ${target}.`);
  }
  const source = path.join(directory, expectedFile);
  const bytes = await readFile(source);
  const metadata = await stat(source);
  if (metadata.size !== descriptor.size) {
    throw new Error(`Runtime artifact size mismatch for ${target}.`);
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== descriptor.sha256) {
    throw new Error(`Runtime artifact SHA-256 mismatch for ${target}.`);
  }
  return source;
}

export async function validateReleaseRuntime({ artifactsDirectory, sdkSha }) {
  if (!/^[0-9a-f]{40}$/.test(sdkSha ?? "")) {
    throw new Error("SDK SHA must be a full lowercase commit SHA.");
  }
  const manifestPath = path.join(artifactsDirectory, "openagent-sdk-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schema_version !== 1 || manifest.sdk_sha !== sdkSha) {
    throw new Error(`Runtime candidate does not match SDK ${sdkSha}.`);
  }
  if (
    !Number.isInteger(manifest.protocol?.min) ||
    !Number.isInteger(manifest.protocol?.max) ||
    manifest.protocol.min > manifest.protocol.max
  ) {
    throw new Error("Runtime candidate has an invalid protocol range.");
  }

  const sources = {};
  for (const [target, file] of Object.entries(RELEASE_RUNTIME_ARTIFACTS)) {
    sources[target] = await verifyArtifact(
      artifactsDirectory,
      target,
      file,
      manifest.artifacts?.[target],
    );
  }
  return { manifest, manifestPath, sources };
}

export async function stageReleaseRuntime({
  artifactsDirectory,
  sdkSha,
  tauriTarget,
  outputDirectory,
  repositoryRoot = root,
}) {
  const candidate = await validateReleaseRuntime({ artifactsDirectory, sdkSha });
  if (tauriTarget) {
    const runtimeTarget = TAURI_RUNTIME_TARGETS[tauriTarget];
    if (!runtimeTarget) throw new Error(`Unsupported Tauri Runtime target: ${tauriTarget}.`);
    const extension = tauriTarget.includes("windows") ? ".exe" : "";
    const destination = path.join(
      repositoryRoot,
      "src-tauri",
      "binaries",
      `openagent-server-${tauriTarget}${extension}`,
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(candidate.sources[runtimeTarget], destination);
    if (!extension) await chmod(destination, 0o755);
  }
  if (outputDirectory) {
    await mkdir(outputDirectory, { recursive: true });
    await copyFile(
      candidate.manifestPath,
      path.join(outputDirectory, "openagent-sdk-manifest.json"),
    );
    for (const [target, file] of Object.entries(RELEASE_RUNTIME_ARTIFACTS)) {
      const destination = path.join(outputDirectory, file);
      await copyFile(candidate.sources[target], destination);
      if (!file.endsWith(".exe")) await chmod(destination, 0o755);
    }
  }
  if (!tauriTarget && !outputDirectory) {
    throw new Error("Specify --tauri-target, --output, or both.");
  }
}

function value(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const artifactsDirectory = value("--artifacts");
  const sdkSha = value("--sdk-sha");
  if (!artifactsDirectory || !sdkSha) {
    throw new Error(
      "Usage: stage-release-runtime.mjs --artifacts <dir> --sdk-sha <sha> " +
        "[--tauri-target <triple>] [--output <dir>]",
    );
  }
  await stageReleaseRuntime({
    artifactsDirectory,
    sdkSha,
    tauriTarget: value("--tauri-target"),
    outputDirectory: value("--output"),
  });
}
