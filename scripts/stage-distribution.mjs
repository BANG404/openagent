import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetchSignedManifest, requireArtifact, verifyArtifactBytes } from "./signed-artifacts.mjs";

/** Stage only the current platform's signed resource set for offline bundling.
 * @param {{source: string; destination: string; target: string; publicKey?: string}} options
 */
export async function stageDistribution({ source, destination, target, publicKey }) {
  const manifestUrl = pathToFileURL(path.join(source, "openagent-distribution.json")).href;
  const signed = await fetchSignedManifest(manifestUrl, {
    publicKey,
    fetchRequest: async (url) => new Response(await readFile(fileURLToPath(url))),
  });
  const manifest = signed.manifest;
  if (manifest.schema_version !== 1 || !manifest.runtime?.[target])
    throw new Error("Distribution does not support selected target");
  const artifacts = [
    ...Object.values(manifest.manifests),
    manifest.runtime[target],
    manifest.frontend,
    ...Object.values(manifest.embedding),
    ...Object.values(manifest.helpers?.[target] ?? {}),
  ];
  await mkdir(destination, { recursive: true });
  for (const descriptor of artifacts) {
    const artifact = requireArtifact(descriptor);
    const bytes = await readFile(path.join(source, artifact.file));
    verifyArtifactBytes(bytes, artifact);
    await cp(path.join(source, artifact.file), path.join(destination, artifact.file));
  }
  await writeFile(path.join(destination, "openagent-distribution.json"), signed.bytes);
  await writeFile(path.join(destination, "openagent-distribution.json.sig"), signed.signature);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (name) => args[args.indexOf(name) + 1];
  await stageDistribution({
    source: path.resolve(value("--source")),
    destination: path.resolve(value("--output")),
    target: value("--target"),
  });
}
