import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

export const UPDATE_PUBLIC_KEY =
  "untrusted comment: minisign public key: C373284FCF9656A0\nRWSgVpbPTyhzw46ILL4vBbjg4XueHFxKhTk48DCGqAT/IfE5vSyBDSGl\n";

/** @param {string} value */
function base64(value) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("Invalid signature encoding");
  return Buffer.from(value, "base64");
}

/** Verify the standard Tauri Base64-wrapped Minisign signature, including its trusted comment.
 * @param {Uint8Array} bytes
 * @param {string} signature
 * @param {string} [publicKey]
 */
export function verifySignedBytes(bytes, signature, publicKey = UPDATE_PUBLIC_KEY) {
  const text = signature.trim().startsWith("untrusted comment:")
    ? signature.trim()
    : base64(signature.trim()).toString("utf8").trim();
  const lines = text.split(/\r?\n/);
  const keyLines = publicKey.trim().split(/\r?\n/);
  const key = base64(keyLines.at(-1) ?? "");
  if (
    lines.length !== 4 ||
    !lines[0].startsWith("untrusted comment:") ||
    !lines[2].startsWith("trusted comment: ") ||
    key.length !== 42 ||
    key.subarray(0, 2).toString() !== "Ed"
  ) {
    throw new Error("Invalid Minisign signature or public key");
  }
  const packet = base64(lines[1]);
  const globalSignature = base64(lines[3]);
  const algorithm = packet.subarray(0, 2).toString();
  if (
    packet.length !== 74 ||
    globalSignature.length !== 64 ||
    !["Ed", "ED"].includes(algorithm) ||
    !packet.subarray(2, 10).equals(key.subarray(2, 10))
  ) {
    throw new Error("Signature does not match the trusted signing key");
  }
  const ed25519 = createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), key.subarray(10)]),
    format: "der",
    type: "spki",
  });
  const payload = algorithm === "ED" ? createHash("blake2b512").update(bytes).digest() : bytes;
  const trustedComment = Buffer.from(lines[2].slice("trusted comment: ".length));
  if (
    !verify(null, payload, ed25519, packet.subarray(10)) ||
    !verify(null, Buffer.concat([packet.subarray(10), trustedComment]), ed25519, globalSignature)
  ) {
    throw new Error("Artifact manifest signature verification failed");
  }
}

/** @typedef {{ file: string; size: number; sha256: string }} Artifact */
/** @param {unknown} value @returns {Artifact} */
export function requireArtifact(value) {
  const artifact = /** @type {Artifact} */ (value);
  if (
    !artifact ||
    typeof artifact.file !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(artifact.file) ||
    !/^[0-9a-f]{64}$/.test(artifact.sha256 ?? "") ||
    !Number.isSafeInteger(artifact.size) ||
    artifact.size <= 0 ||
    artifact.size > 512 * 1024 * 1024
  ) {
    throw new Error("Invalid artifact metadata");
  }
  return artifact;
}

/** @param {Uint8Array} bytes @param {Artifact} artifact */
export function verifyArtifactBytes(bytes, artifact) {
  if (bytes.byteLength !== artifact.size) throw new Error("Artifact size mismatch");
  if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) {
    throw new Error("Artifact checksum mismatch");
  }
}

/** @param {string | URL} url @param {typeof fetch} fetchRequest @param {number} maximum */
async function boundedResponse(url, fetchRequest, maximum) {
  const response = await fetchRequest(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Manifest download failed: HTTP ${response.status}`);
  if (!response.body) throw new Error("Manifest response has no body");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error("Manifest exceeds its size limit");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel();
  }
}

/** @param {string} url @param {{ fetchRequest?: typeof fetch; publicKey?: string }} [options] */
export async function fetchSignedManifest(url, options = {}) {
  const fetchRequest = options.fetchRequest ?? globalThis.fetch.bind(globalThis);
  const [bytes, signatureBytes] = await Promise.all([
    boundedResponse(url, fetchRequest, 1024 * 1024),
    boundedResponse(`${url}.sig`, fetchRequest, 16 * 1024),
  ]);
  const signature = signatureBytes.toString("utf8");
  verifySignedBytes(bytes, signature, options.publicKey);
  return { manifest: JSON.parse(bytes.toString("utf8")), bytes, signature };
}

/** Download immutable, checksummed bytes with persistent partials and HTTP Range recovery.
 * @param {{ artifact: Artifact; manifestUrl: string; cacheDirectory: string; fetchRequest?: typeof fetch }} options
 */
export async function downloadArtifact({
  artifact: input,
  manifestUrl,
  cacheDirectory,
  fetchRequest = globalThis.fetch.bind(globalThis),
}) {
  const artifact = requireArtifact(input);
  await mkdir(cacheDirectory, { recursive: true });
  const destination = join(cacheDirectory, artifact.sha256);
  try {
    verifyArtifactBytes(await readFile(destination), artifact);
    return destination;
  } catch {
    await rm(destination, { force: true });
  }
  const partial = `${destination}.partial`;
  let offset = (await stat(partial).catch(() => null))?.size ?? 0;
  if (offset >= artifact.size) {
    if (offset === artifact.size) {
      try {
        verifyArtifactBytes(await readFile(partial), artifact);
        await rename(partial, destination);
        return destination;
      } catch {
        // A complete but unverified partial is never admitted to the cache.
      }
    }
    await rm(partial, { force: true });
    offset = 0;
  }
  const response = await fetchRequest(new URL(artifact.file, manifestUrl), {
    headers: offset ? { Range: `bytes=${offset}-`, "Accept-Encoding": "identity" } : {},
    signal: AbortSignal.timeout(15 * 60_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Artifact download failed: HTTP ${response.status}`);
  }
  if (response.status === 206) {
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
    if (
      !range ||
      Number(range[1]) !== offset ||
      Number(range[2]) !== artifact.size - 1 ||
      Number(range[3]) !== artifact.size
    ) {
      await response.body.cancel();
      throw new Error("Artifact resume response has an invalid byte range");
    }
  } else if (response.status === 200) {
    offset = 0;
  } else {
    await response.body.cancel();
    throw new Error("Unexpected artifact download response");
  }
  const handle = await open(partial, offset ? "a" : "w");
  const reader = response.body.getReader();
  let downloaded = offset;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.byteLength;
      if (downloaded > artifact.size) throw new Error("Artifact exceeds its declared size");
      await handle.writeFile(value);
    }
    await handle.sync();
  } finally {
    await handle.close();
    await reader.cancel();
  }
  try {
    verifyArtifactBytes(await readFile(partial), artifact);
  } catch (error) {
    // Interrupted transfers remain resumable; completed corrupt bytes do not.
    if (downloaded >= artifact.size) await rm(partial, { force: true });
    throw error;
  }
  await rename(partial, destination);
  return destination;
}
