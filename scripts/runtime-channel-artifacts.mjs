import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireArtifact, verifySignedBytes } from "./signed-artifacts.mjs";

const MANIFEST_FILES = ["openagent-sdk-manifest.json", "openagent-sdk-manifest.json.sig"];

/** @typedef {{file: string; size: number; sha256: string}} Artifact */
/**
 * @param {{schema_version: number; artifacts: Record<string, Artifact>; helpers: Record<string, Record<string, Artifact>>}} manifest
 * @returns {Artifact[]}
 */
export function runtimeChannelArtifacts(manifest) {
  if (manifest.schema_version !== 1) throw new Error("Unsupported Runtime manifest schema");
  const artifacts = [
    ...Object.values(manifest.artifacts),
    ...Object.values(manifest.helpers).flatMap((helpers) => Object.values(helpers)),
  ];
  if (artifacts.length === 0) throw new Error("Runtime manifest has no artifacts");
  const names = new Set(MANIFEST_FILES);
  for (const artifact of artifacts) {
    requireArtifact(artifact);
    if (names.has(artifact.file)) throw new Error(`Duplicate Runtime artifact: ${artifact.file}`);
    names.add(artifact.file);
  }
  return artifacts;
}

/** @param {string} directory @param {Artifact[]} artifacts */
export async function verifyRuntimeChannelArtifacts(directory, artifacts) {
  for (const artifact of artifacts) {
    const source = path.join(directory, artifact.file);
    if ((await stat(source)).size !== artifact.size) {
      throw new Error(`Runtime artifact size mismatch: ${artifact.file}`);
    }
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(source)) hash.update(chunk);
    if (hash.digest("hex") !== artifact.sha256) {
      throw new Error(`Runtime artifact SHA-256 mismatch: ${artifact.file}`);
    }
  }
}

/** @param {string} release @param {string} directory @param {string[]} files */
function downloadReleaseFiles(release, directory, files) {
  const result = spawnSync(
    "gh",
    [
      "release",
      "download",
      release,
      "--dir",
      directory,
      ...files.flatMap((file) => ["--pattern", file]),
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Runtime release download failed: ${release}`);
}

/**
 * Stage only the complete, verified asset set from the qualified immutable release.
 * @param {{release: string; directory: string; publicKey?: string; download?: (release: string, directory: string, files: string[]) => void | Promise<void>}} options
 */
export async function stageRuntimeChannel({
  release,
  directory,
  publicKey,
  download = downloadReleaseFiles,
}) {
  await mkdir(directory, { recursive: true });
  await download(release, directory, MANIFEST_FILES);
  const bytes = await readFile(path.join(directory, MANIFEST_FILES[0]));
  const signature = await readFile(path.join(directory, MANIFEST_FILES[1]), "utf8");
  verifySignedBytes(bytes, signature, publicKey);
  const artifacts = runtimeChannelArtifacts(JSON.parse(bytes.toString("utf8")));
  await download(
    release,
    directory,
    artifacts.map((artifact) => artifact.file),
  );
  await verifyRuntimeChannelArtifacts(directory, artifacts);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [release, directory] = process.argv.slice(2);
  if (!release || !directory) {
    throw new Error("Usage: runtime-channel-artifacts.mjs <immutable-release-tag> <directory>");
  }
  await stageRuntimeChannel({ release, directory });
}
