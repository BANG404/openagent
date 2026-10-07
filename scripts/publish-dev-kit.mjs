import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifySignedBytes, verifyArtifactBytes } from "./signed-artifacts.mjs";
import { validateDevKit } from "./prepare-dev-kit.mjs";

/** @param {string[]} args */
function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const directory = value("--artifacts");
const sdkSha = value("--sdk-sha");
const repository = process.env.GH_REPO;
if (!directory || !/^[0-9a-f]{40}$/.test(sdkSha ?? "") || !repository) {
  throw new Error(
    "Usage: publish-dev-kit.mjs --artifacts <directory> --sdk-sha <sha>, with GH_REPO set",
  );
}
const immutableTag = `runtime-dev-${sdkSha}`;
const files = (await readdir(directory)).sort();
let exists = false;
try {
  gh(["release", "view", immutableTag, "--repo", repository]);
  exists = true;
} catch (error) {
  if (
    !String(error.stderr).includes("release not found") &&
    !String(error.stderr).includes("Not Found")
  )
    throw error;
}
if (exists) {
  const previous = await mkdtemp(join(tmpdir(), "openagent-published-kit-"));
  try {
    gh(["release", "download", immutableTag, "--repo", repository, "--dir", previous]);
    const bytes = await readFile(join(previous, "sdk-dev-manifest.json"));
    verifySignedBytes(bytes, await readFile(join(previous, "sdk-dev-manifest.json.sig"), "utf8"));
    const manifest = JSON.parse(bytes.toString("utf8"));
    if (manifest.runtime?.sdk_sha !== sdkSha)
      throw new Error("Immutable source kit Runtime revision mismatch");
    for (const target of ["windows-x64", "linux-x64", "macos-x64", "macos-arm64"]) {
      const kit = validateDevKit(manifest, sdkSha, target);
      for (const artifact of [kit.client, kit.runtime, ...kit.helpers]) {
        verifyArtifactBytes(await readFile(join(previous, artifact.file)), artifact);
      }
    }
    const runtimeBytes = await readFile(join(previous, "openagent-sdk-manifest.json"));
    verifySignedBytes(
      runtimeBytes,
      await readFile(join(previous, "openagent-sdk-manifest.json.sig"), "utf8"),
    );
    const runtime = JSON.parse(runtimeBytes.toString("utf8"));
    if (
      runtime.sdk_sha !== sdkSha ||
      runtime.version !== manifest.runtime.version ||
      JSON.stringify(runtime.artifacts) !== JSON.stringify(manifest.runtime.artifacts)
    )
      throw new Error("Published Runtime manifest disagrees with its development kit");
    // A compiler rerun need not reproduce timestamp-bearing binaries. Reuse
    // the already signed exact-SHA kit as the canonical moving-channel input.
    for (const file of files) await rm(join(directory, file));
    await cp(previous, directory, { recursive: true });
  } finally {
    await rm(previous, { recursive: true, force: true });
  }
} else {
  gh([
    "release",
    "create",
    immutableTag,
    ...files.map((file) => join(directory, file)),
    "--repo",
    repository,
    "--target",
    process.env.GITHUB_SHA ?? "master",
    "--prerelease",
    "--title",
    `Development kit ${sdkSha.slice(0, 12)}`,
    "--notes",
    `Verified Runtime, public typed client and platform helpers for SDK ${sdkSha}. Immutable source kit.`,
  ]);
}
console.log(`Published or verified immutable SDK kit ${immutableTag}`);
