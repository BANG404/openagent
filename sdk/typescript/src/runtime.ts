import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  realpath,
  rename,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { OPENAGENT_PROTOCOL_VERSION } from "./contracts.js";
import {
  downloadArtifact,
  fetchSignedManifest,
  requireArtifact,
  verifyArtifactBytes,
  verifySignedBytes,
} from "./runtimeArtifacts.js";
import { runtimeRelease, type RuntimeRelease } from "./runtimeRelease.js";

export { runtimeRelease, type RuntimeRelease } from "./runtimeRelease.js";
export {
  startRuntime,
  connectRuntime,
  type RunningRuntime,
  type StartRuntimeOptions,
  type RuntimeConnectionOptions,
} from "./runtimeProcess.js";

export interface EnsureRuntimeOptions {
  /** Explicitly trusted executable. No download or replacement occurs. */
  binaryPath?: string;
  cacheDirectory?: string;
  release?: RuntimeRelease;
}

export interface InstalledRuntime {
  binaryPath: string;
  version?: string;
}

const targets: Record<string, string> = {
  "win32/x64": "windows-x64",
  "linux/x64": "linux-x64",
  "darwin/arm64": "macos-arm64",
  "darwin/x64": "macos-x64",
};
const helperNames: Record<string, string[]> = {
  "windows-x64": ["codex-command-runner.exe", "codex-windows-sandbox-setup.exe"],
  "linux-x64": ["codex-bwrap-linux-x64"],
};

/** Download only on explicit invocation. Cached executables are reverified before reuse. */
export async function ensureRuntime(options: EnsureRuntimeOptions = {}): Promise<InstalledRuntime> {
  if (options.binaryPath) return { binaryPath: await realpath(options.binaryPath) };
  const release = options.release ?? runtimeRelease;
  if (!release)
    throw new Error("This source SDK has no recommended Runtime; supply release or binaryPath");
  if (
    release.protocol !== OPENAGENT_PROTOCOL_VERSION ||
    !/^[0-9a-f]{40}$/.test(release.sdkSha) ||
    !/^[0-9a-f]{64}$/.test(release.manifestSha256)
  ) {
    throw new Error("Invalid SDK Runtime release metadata");
  }
  const url = new URL(release.manifestUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw new Error("Runtime manifest must use a fixed HTTPS URL");
  const target = targets[`${process.platform}/${process.arch}`];
  if (!target) throw new Error(`Unsupported Runtime platform: ${process.platform}/${process.arch}`);
  const cache = resolve(
    options.cacheDirectory ?? join(homedir(), ".cache", "openagent-sdk", "runtime"),
  );
  const directory = join(cache, release.manifestSha256, target);
  let signed;
  try {
    const bytes = await readFile(join(directory, "openagent-sdk-manifest.json"));
    const signature = await readFile(join(directory, "openagent-sdk-manifest.json.sig"), "utf8");
    verifySignedBytes(bytes, signature);
    signed = { bytes, signature, manifest: JSON.parse(bytes.toString()) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    signed = await fetchSignedManifest(release.manifestUrl);
  }
  const { manifest, bytes } = signed;
  if (
    createHash("sha256").update(bytes).digest("hex") !== release.manifestSha256 ||
    manifest.version !== release.version ||
    manifest.sdk_sha !== release.sdkSha ||
    manifest.schema_version !== 1 ||
    !Number.isInteger(manifest.protocol?.min) ||
    !Number.isInteger(manifest.protocol?.max) ||
    manifest.protocol.min > OPENAGENT_PROTOCOL_VERSION ||
    manifest.protocol.max < OPENAGENT_PROTOCOL_VERSION
  ) {
    throw new Error("Runtime manifest does not match the SDK's pinned release");
  }
  const binary = requireArtifact(manifest.artifacts?.[target]);
  const helpers = (helperNames[target] ?? []).map((name) => {
    const artifact = requireArtifact(manifest.helpers?.[target]?.[name]);
    if (artifact.file !== name) throw new Error("Unexpected Runtime helper filename");
    return artifact;
  });
  const destination = join(
    directory,
    process.platform === "win32" ? "openagent-server.exe" : "openagent-server",
  );
  const files = [binary, ...helpers].map((artifact, index) => ({
    artifact,
    destination:
      index === 0
        ? destination
        : join(
            directory,
            "codex-resources",
            artifact.file === "codex-bwrap-linux-x64" ? "bwrap" : artifact.file,
          ),
  }));
  try {
    for (const file of files) verifyArtifactBytes(await readFile(file.destination), file.artifact);
    return { binaryPath: destination, version: manifest.version };
  } catch {
    // Build a complete private staging tree before publishing the immutable installation.
  }
  await mkdir(dirname(directory), { recursive: true });
  const staging = await mkdtemp(`${directory}-`);
  try {
    const paths = await Promise.all(
      files.map(({ artifact }) =>
        downloadArtifact({
          artifact,
          manifestUrl: release.manifestUrl,
          cacheDirectory: join(staging, "downloads", artifact.file),
        }),
      ),
    );
    for (let index = 0; index < files.length; index++) {
      const name = files[index].destination.slice(directory.length + 1);
      const path = join(staging, name);
      await mkdir(dirname(path), { recursive: true });
      await copyFile(paths[index], path);
      if (process.platform !== "win32") await chmod(path, 0o755);
    }
    await rm(join(staging, "downloads"), { recursive: true, force: true });
    await writeFile(join(staging, "openagent-sdk-manifest.json"), bytes);
    await writeFile(join(staging, "openagent-sdk-manifest.json.sig"), signed.signature);
    try {
      await rename(staging, directory);
    } catch (error) {
      // A concurrent installer may have won; only accept its complete verified bytes.
      for (const file of files) {
        try {
          verifyArtifactBytes(await readFile(file.destination), file.artifact);
        } catch {
          throw error;
        }
      }
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return { binaryPath: destination, version: manifest.version };
}
