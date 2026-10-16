// @ts-check
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifySignedBytes } from "./signed-artifacts.mjs";

/** The lightweight installer needs only the signed distribution identity, not its payloads.
 * @param {string} source @param {string} destination @param {string} [publicKey]
 */
export async function stageReleaseIdentity(source, destination, publicKey) {
  const bytes = await readFile(path.join(source, "openagent-distribution.json"));
  const signature = await readFile(path.join(source, "openagent-distribution.json.sig"));
  verifySignedBytes(bytes, signature.toString(), publicKey);
  const manifest = JSON.parse(bytes.toString());
  if (manifest.schema_version !== 1 || !manifest.version || !manifest.shell_version)
    throw new Error("Missing packaged release identity");
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "openagent-distribution.json"), bytes);
  await writeFile(path.join(destination, "openagent-distribution.json.sig"), signature);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await stageReleaseIdentity(process.argv[2], process.argv[3]);
