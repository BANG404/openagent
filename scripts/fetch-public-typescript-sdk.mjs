import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_SDK_DEV_MANIFEST =
  "https://github.com/BANG404/openagent/releases/download/runtime-dev/sdk-dev-manifest.json";

function requireSafeArtifact(value) {
  const artifact = value ?? {};
  if (
    typeof artifact.file !== "string" ||
    artifact.file.includes("/") ||
    artifact.file.includes("\\") ||
    !/^[0-9a-f]{64}$/.test(artifact.sha256 ?? "") ||
    !Number.isSafeInteger(artifact.size) ||
    artifact.size <= 0
  ) {
    throw new Error("Invalid public TypeScript SDK artifact metadata");
  }
  return artifact;
}

export async function fetchPublicTypescriptSdk({
  expectedSdkSha,
  output,
  manifestUrl = DEFAULT_SDK_DEV_MANIFEST,
  fetchRequest = globalThis.fetch.bind(globalThis),
}) {
  if (!/^[0-9a-f]{40}$/.test(expectedSdkSha)) throw new Error("Invalid expected SDK SHA");
  const manifestResponse = await fetchRequest(manifestUrl);
  if (!manifestResponse.ok) {
    throw new Error(
      `Failed to download public SDK development manifest: ${manifestResponse.status}`,
    );
  }
  const manifest = await manifestResponse.json();
  if (manifest?.schema_version !== 1 || manifest.sdk_sha !== expectedSdkSha) {
    throw new Error(
      `Public SDK development channel is ${manifest?.sdk_sha ?? "unknown"}; expected ${expectedSdkSha}`,
    );
  }
  const artifact = requireSafeArtifact(manifest.clients?.typescript);
  const response = await fetchRequest(new URL(artifact.file, manifestUrl));
  if (!response.ok) throw new Error(`Failed to download public TypeScript SDK: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== artifact.size) throw new Error("Public TypeScript SDK size mismatch");
  if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) {
    throw new Error("Public TypeScript SDK checksum mismatch");
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes);
  return { manifest, artifact, output };
}

async function main() {
  const arguments_ = process.argv.slice(2);
  const value = (name) => {
    const index = arguments_.indexOf(name);
    return index >= 0 ? arguments_[index + 1] : undefined;
  };
  const expectedSdkSha = value("--sdk-sha");
  const output = value("--output");
  const manifestUrl = value("--manifest-url") ?? DEFAULT_SDK_DEV_MANIFEST;
  if (!expectedSdkSha || !output) {
    throw new Error(
      "Usage: fetch-public-typescript-sdk.mjs --sdk-sha <sha> --output <archive> [--manifest-url <url>]",
    );
  }
  await fetchPublicTypescriptSdk({ expectedSdkSha, output, manifestUrl });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
