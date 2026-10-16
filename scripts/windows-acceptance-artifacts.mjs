// @ts-check
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifySignedBytes, requireArtifact, verifyArtifactBytes } from "./signed-artifacts.mjs";

export const ACCEPTANCE_IDENTIFIER = "com.iumm.openagent.acceptance";
export const ACCEPTANCE_PIPE = String.raw`\\.\pipe\tauri-pilot-com.iumm.openagent.acceptance`;

/** @param {Uint8Array} bytes */
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** @param {string} directory @param {string} file */
export async function describe(directory, file) {
  const bytes = await readFile(path.join(directory, file));
  return { file, size: bytes.length, sha256: digest(bytes) };
}

/** @param {string} name */
export function safeName(name) {
  assert(/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,180}$/.test(name), "Unsafe acceptance filename");
  assert(!/[. ]$/.test(name), "Unsafe acceptance filename suffix");
  assert(!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name), "Reserved Windows filename");
  return name;
}

/** @typedef {{schema_version: number; purpose: string; version: string; source_sha: string; sdk_sha: string; public_key: string; identifier: string; profile: string; installers: {offline: string; online: string}; assets: {file: string; size: number; sha256: string}[]}} AcceptanceCandidate */

/** @param {string} directory @param {Omit<AcceptanceCandidate, 'schema_version' | 'purpose' | 'identifier' | 'profile' | 'assets'>} identity */
export async function writeCandidate(directory, identity) {
  const assets = [];
  for (const file of (await readdir(directory)).sort()) {
    if (file === "windows-acceptance.json") continue;
    assets.push(await describe(directory, safeName(file)));
  }
  const candidate = {
    ...identity,
    schema_version: 1,
    purpose: "windows-install-acceptance",
    identifier: ACCEPTANCE_IDENTIFIER,
    profile: "release-with-pilot",
    assets,
  };
  await writeFile(
    path.join(directory, "windows-acceptance.json"),
    `${JSON.stringify(candidate, null, 2)}\n`,
  );
  return candidate;
}

/** Verify transport identity plus every signed resource before executing anything.
 * @param {string} directory
 * @returns {Promise<AcceptanceCandidate>}
 */
export async function verifyCandidate(directory) {
  const candidate = JSON.parse(
    await readFile(path.join(directory, "windows-acceptance.json"), "utf8"),
  );
  assert(
    candidate.schema_version === 1 && candidate.purpose === "windows-install-acceptance",
    "Wrong acceptance schema",
  );
  assert(
    candidate.identifier === ACCEPTANCE_IDENTIFIER && candidate.profile === "release-with-pilot",
    "Wrong acceptance build mode",
  );
  assert(
    /^[a-f0-9]{40}$/.test(candidate.source_sha) && /^[a-f0-9]{40}$/.test(candidate.sdk_sha),
    "Missing source revisions",
  );
  assert(
    /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(candidate.version),
    "Invalid acceptance version",
  );
  assert(
    Array.isArray(candidate.assets) && candidate.assets.length > 2,
    "Incomplete acceptance assets",
  );
  const names = new Set();
  for (const asset of candidate.assets) {
    safeName(asset.file);
    assert(!names.has(asset.file), "Duplicate acceptance asset");
    assert(
      Number.isSafeInteger(asset.size) && asset.size > 0 && /^[a-f0-9]{64}$/.test(asset.sha256),
      "Invalid asset descriptor",
    );
    names.add(asset.file);
    verifyArtifactBytes(await readFile(path.join(directory, asset.file)), asset);
  }
  const actual = (await readdir(directory)).filter((file) => file !== "windows-acceptance.json");
  assert(
    actual.length === names.size && actual.every((file) => names.has(file)),
    "Unexpected acceptance assets",
  );
  for (const mode of ["online", "offline"]) {
    const name = safeName(candidate.installers[mode]);
    assert(names.has(name) && name.endsWith("-setup.exe"), "Missing installer");
  }
  assert(
    candidate.installers.online !== candidate.installers.offline,
    "Installers must be distinct",
  );
  const bytes = await readFile(path.join(directory, "openagent-distribution.json"));
  verifySignedBytes(
    bytes,
    await readFile(path.join(directory, "openagent-distribution.json.sig"), "utf8"),
    candidate.public_key,
  );
  const distribution = JSON.parse(bytes.toString());
  assert(
    distribution.version === candidate.version && distribution.sdk_sha === candidate.sdk_sha,
    "Distribution identity mismatch",
  );
  const descriptors = [
    ...Object.values(distribution.manifests),
    distribution.runtime["windows-x64"],
    distribution.frontend,
    ...Object.values(distribution.embedding),
    ...Object.values(distribution.helpers["windows-x64"]),
  ];
  for (const descriptor of descriptors) {
    const asset = requireArtifact(descriptor);
    assert(names.has(asset.file), "Missing distribution resource");
    verifyArtifactBytes(await readFile(path.join(directory, asset.file)), asset);
  }
  for (const name of ["openagent-sdk-manifest.json", "openagent-frontend-manifest.json"]) {
    verifySignedBytes(
      await readFile(path.join(directory, name)),
      await readFile(path.join(directory, `${name}.sig`), "utf8"),
      candidate.public_key,
    );
  }
  return candidate;
}
