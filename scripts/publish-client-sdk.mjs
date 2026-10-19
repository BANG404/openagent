// @ts-check
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readNpmPackage } from "./client-sdk-release.mjs";
import { requireArtifact, verifyArtifactBytes, verifySignedBytes } from "./signed-artifacts.mjs";

/** @param {string[]} args */
function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** @param {string} directory @param {string} [publicKey] */
export async function verifyRuntimePublication(directory, publicKey = undefined) {
  const bytes = await readFile(join(directory, "openagent-sdk-manifest.json"));
  verifySignedBytes(
    bytes,
    await readFile(join(directory, "openagent-sdk-manifest.json.sig"), "utf8"),
    publicKey,
  );
  const manifest = JSON.parse(bytes.toString());
  for (const descriptor of [
    ...Object.values(manifest.artifacts),
    ...Object.values(manifest.helpers).flatMap((helpers) => Object.values(helpers)),
  ]) {
    const artifact = requireArtifact(descriptor);
    verifyArtifactBytes(await readFile(join(directory, artifact.file)), artifact);
  }
  return bytes;
}

/** Publish the verified fixed Runtime before making its npm consumer available.
 * @param {string} directory
 * @param {{repository?: string; publicKey?: string; runGh?: (args: string[]) => string; registry?: typeof readNpmPackage; publishNpm?: (tarball: string, channel: string) => void}} [options]
 */
export async function publishClientRelease(directory, options = {}) {
  const runGh = options.runGh ?? gh;
  const plan = JSON.parse(await readFile(join(directory, "release.json"), "utf8"));
  const repository = options.repository ?? process.env.GH_REPO;
  if (
    !repository ||
    plan.runtime.manifestUrl !==
      `https://github.com/${repository}/releases/download/${plan.runtimeTag}/openagent-sdk-manifest.json`
  )
    throw new Error("Client candidate repository mismatch");
  const localBytes = await verifyRuntimePublication(join(directory, "runtime"), options.publicKey);
  const manifest = JSON.parse(localBytes.toString());
  const sha256 = (/** @type {Uint8Array} */ bytes) =>
    createHash("sha256").update(bytes).digest("hex");
  if (
    plan.schema_version !== 1 ||
    plan.name !== "@bang404/openagent-sdk" ||
    !["beta", "rc", "stable"].includes(plan.channel) ||
    sha256(localBytes) !== plan.runtime.manifestSha256 ||
    manifest.version !== plan.runtime.version ||
    manifest.sdk_sha !== plan.runtime.sdkSha ||
    plan.runtime.protocol < manifest.protocol.min ||
    plan.runtime.protocol > manifest.protocol.max ||
    plan.runtimeTag !==
      `runtime-v${manifest.version}-${plan.runtime.manifestSha256.slice(0, 16)}` ||
    sha256(await readFile(join(directory, "openagent-sdk.tgz"))) !== plan.tarballSha256
  )
    throw new Error("Qualified SDK candidate identity mismatch");
  const artifacts = [
    "openagent-sdk-manifest.json",
    "openagent-sdk-manifest.json.sig",
    ...Object.values(manifest.artifacts).map((a) => a.file),
    ...Object.values(manifest.helpers).flatMap((helpers) =>
      Object.values(helpers).map((a) => a.file),
    ),
  ];
  if (new Set(artifacts).size !== artifacts.length) throw new Error("Duplicate Runtime asset");
  let existing = null;
  try {
    existing = JSON.parse(
      runGh([
        "release",
        "view",
        plan.runtimeTag,
        "--repo",
        repository,
        "--json",
        "isDraft,isPrerelease,assets",
      ]),
    );
  } catch (error) {
    // Distinguish a missing release from an authentication/network failure.
    if (!String(error.stderr ?? "").includes("release not found")) throw error;
  }
  if (!existing) {
    runGh([
      "release",
      "create",
      plan.runtimeTag,
      "--repo",
      repository,
      "--target",
      process.env.GITHUB_SHA ?? "main",
      "--draft",
      "--title",
      `OpenAgent Runtime ${plan.runtime.version}`,
      "--notes",
      `Standalone Runtime ${plan.runtime.version}. Signed manifest binds all platform binaries and sandbox helpers.`,
      "--latest=false",
      ...(plan.channel === "stable" ? [] : ["--prerelease"]),
    ]);
    existing = { isDraft: true, assets: [] };
  }
  const downloaded = await mkdtemp(join(tmpdir(), "openagent-runtime-publication-"));
  try {
    const present = new Set(
      existing.assets.map((/** @type {{name: string}} */ asset) => asset.name),
    );
    const missing = artifacts.filter((name) => !present.has(name));
    if (missing.length && !existing.isDraft)
      throw new Error("Published immutable Runtime is incomplete");
    // Reconcile partial drafts without replacing even a single previously uploaded byte.
    for (const name of artifacts.filter((name) => present.has(name))) {
      runGh([
        "release",
        "download",
        plan.runtimeTag,
        "--repo",
        repository,
        "--dir",
        downloaded,
        "--pattern",
        name,
      ]);
      const bytes = await readFile(join(downloaded, name));
      if (name.endsWith(".sig")) verifySignedBytes(localBytes, bytes.toString(), options.publicKey);
      else if (!bytes.equals(await readFile(join(directory, "runtime", name))))
        throw new Error(`Immutable Runtime asset differs: ${name}`);
    }
    if (missing.length)
      runGh([
        "release",
        "upload",
        plan.runtimeTag,
        ...missing.map((name) => join(directory, "runtime", name)),
        "--repo",
        repository,
      ]);
    await rm(downloaded, { recursive: true, force: true });
    runGh(["release", "download", plan.runtimeTag, "--repo", repository, "--dir", downloaded]);
    const publicBytes = await verifyRuntimePublication(downloaded, options.publicKey);
    if (!localBytes.equals(publicBytes))
      throw new Error("Immutable Runtime release already contains a different manifest");
  } finally {
    await rm(downloaded, { recursive: true, force: true });
  }
  if (existing.isDraft || (plan.channel === "stable" && existing.isPrerelease))
    runGh([
      "release",
      "edit",
      plan.runtimeTag,
      "--repo",
      repository,
      "--draft=false",
      "--latest=false",
      ...(plan.channel === "stable" ? ["--prerelease=false"] : []),
    ]);
  const registry = await (options.registry ?? readNpmPackage)(plan.name);
  const published = registry.versions?.[plan.version];
  if (published) {
    if (
      published.openagent?.fingerprint !== plan.fingerprint ||
      JSON.stringify(published.openagent?.runtime) !== JSON.stringify(plan.runtime)
    )
      throw new Error("Immutable npm version already contains a different SDK candidate");
    console.log(`Reusing ${plan.name}@${plan.version}`);
    return;
  }
  if (plan.reuse)
    throw new Error("Previously published SDK version disappeared; refusing replacement");
  if (options.publishNpm)
    return options.publishNpm(join(directory, "openagent-sdk.tgz"), plan.channel);
  execFileSync(
    "npm",
    [
      "publish",
      join(directory, "openagent-sdk.tgz"),
      "--access",
      "public",
      "--tag",
      plan.channel === "stable" ? "latest" : plan.channel,
      "--provenance",
      "--registry",
      "https://registry.npmjs.org/",
    ],
    { stdio: "inherit" },
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Usage: publish-client-sdk.mjs <qualified-candidate>");
  await publishClientRelease(resolve(process.argv[2]));
}
