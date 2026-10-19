import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSignedManifest, requireArtifact } from "./signed-artifacts.mjs";
import { immutableDevKitUrl } from "./prepare-dev-kit.mjs";

export async function fetchClientSourceSnapshot({
  expectedRuntimeSha,
  output,
  manifestUrl = immutableDevKitUrl(expectedRuntimeSha),
  fetchRequest = globalThis.fetch.bind(globalThis),
  publicKey,
}) {
  if (!/^[0-9a-f]{40}$/.test(expectedRuntimeSha)) throw new Error("Invalid expected Runtime SHA");
  const { manifest } = await fetchSignedManifest(manifestUrl, { fetchRequest, publicKey });
  if (![1, 2].includes(manifest?.schema_version) || manifest.sdk_sha !== expectedRuntimeSha) {
    throw new Error(
      `Runtime development channel is ${manifest?.sdk_sha ?? "unknown"}; expected ${expectedRuntimeSha}`,
    );
  }
  const artifact = requireArtifact(manifest.clients?.typescript);
  const response = await fetchRequest(new URL(artifact.file, manifestUrl));
  if (!response.ok)
    throw new Error(`Failed to download public Client SDK source snapshot: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== artifact.size)
    throw new Error("Public Client SDK source snapshot size mismatch");
  if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) {
    throw new Error("Public Client SDK source snapshot checksum mismatch");
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
  const expectedRuntimeSha = value("--runtime-sha");
  const output = value("--output");
  const manifestUrl = value("--manifest-url") ?? immutableDevKitUrl(expectedRuntimeSha);
  if (!expectedRuntimeSha || !output) {
    throw new Error(
      "Usage: fetch-client-source-snapshot.mjs --runtime-sha <sha> --output <archive> [--manifest-url <url>]",
    );
  }
  await fetchClientSourceSnapshot({ expectedRuntimeSha, output, manifestUrl });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
