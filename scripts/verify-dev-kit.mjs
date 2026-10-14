import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { validateDevKit } from "./prepare-dev-kit.mjs";
import { readDesktopRuntimeProtocol } from "./runtime-protocol.mjs";
import { verifyArtifactBytes, verifySignedBytes } from "./signed-artifacts.mjs";

/** Admit new candidates and existing immutable kits through the same checks.
 * @param {string} directory
 * @param {string} sdkSha
 * @param {{ publicKey?: string; protocolVersion?: number }} [options]
 */
export async function verifyDevelopmentKit(directory, sdkSha, options = {}) {
  const protocolVersion = options.protocolVersion ?? readDesktopRuntimeProtocol();
  const bytes = await readFile(join(directory, "sdk-dev-manifest.json"));
  verifySignedBytes(
    bytes,
    await readFile(join(directory, "sdk-dev-manifest.json.sig"), "utf8"),
    options.publicKey,
  );
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (manifest.runtime?.sdk_sha !== sdkSha) {
    throw new Error("Immutable source kit Runtime revision mismatch");
  }
  for (const target of ["windows-x64", "linux-x64", "macos-x64", "macos-arm64"]) {
    const kit = validateDevKit(manifest, sdkSha, target, protocolVersion);
    for (const artifact of [kit.client, kit.runtime, ...kit.helpers]) {
      verifyArtifactBytes(await readFile(join(directory, artifact.file)), artifact);
    }
  }
  const runtimeBytes = await readFile(join(directory, "openagent-sdk-manifest.json"));
  verifySignedBytes(
    runtimeBytes,
    await readFile(join(directory, "openagent-sdk-manifest.json.sig"), "utf8"),
    options.publicKey,
  );
  const runtime = JSON.parse(runtimeBytes.toString("utf8"));
  if (
    runtime.schema_version !== 1 ||
    runtime.sdk_sha !== sdkSha ||
    runtime.version !== manifest.runtime.version ||
    !isDeepStrictEqual(runtime.protocol, manifest.runtime.protocol) ||
    !isDeepStrictEqual(runtime.artifacts, manifest.runtime.artifacts)
  ) {
    throw new Error("Signed Runtime manifest disagrees with its development kit");
  }
}
