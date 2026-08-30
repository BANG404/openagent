import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function value(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

export function validateSdkManifest(manifest, plan) {
  if (manifest.version !== plan.version) {
    throw new Error(`SDK manifest version ${manifest.version} does not match ${plan.version}`);
  }
  if (manifest.sdk_sha !== plan.releaseSha) {
    throw new Error(`SDK manifest SHA ${manifest.sdk_sha} does not match ${plan.releaseSha}`);
  }
  const minimum = manifest.protocol?.min;
  const maximum = manifest.protocol?.max;
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum > maximum) {
    throw new Error("SDK manifest contains an invalid protocol range");
  }
  return { protocolMin: minimum, protocolMax: maximum };
}

async function publishedRelease(repository, plan) {
  let isDraft;
  try {
    isDraft = run("gh", [
      "release",
      "view",
      plan.tag,
      "--repo",
      repository,
      "--json",
      "isDraft",
      "--jq",
      ".isDraft",
    ]);
  } catch (error) {
    if (error?.status === 1) return null;
    throw error;
  }
  if (isDraft !== "false") return null;

  const tagReference = JSON.parse(
    run("gh", ["api", `repos/${repository}/git/ref/tags/${plan.tag}`]),
  );
  let taggedSha = tagReference.object.sha;
  if (tagReference.object.type === "tag") {
    const tagObject = JSON.parse(run("gh", ["api", `repos/${repository}/git/tags/${taggedSha}`]));
    taggedSha = tagObject.object.sha;
  } else if (tagReference.object.type !== "commit") {
    throw new Error(`Unsupported SDK tag object type: ${tagReference.object.type}`);
  }
  if (taggedSha !== plan.releaseSha) {
    throw new Error(`${plan.tag} points to ${taggedSha}, not ${plan.releaseSha}`);
  }

  const directory = await mkdtemp(join(tmpdir(), "openagent-sdk-release-"));
  try {
    run("gh", [
      "release",
      "download",
      plan.tag,
      "--repo",
      repository,
      "--pattern",
      "openagent-sdk-manifest.json",
      "--dir",
      directory,
    ]);
    const manifest = JSON.parse(
      await readFile(join(directory, "openagent-sdk-manifest.json"), "utf8"),
    );
    return validateSdkManifest(manifest, plan);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  const sdkDirectory = value("--sdk-dir");
  const sdkSha = value("--sdk-sha");
  const hostVersion = value("--host-version");
  const repository = value("--repository");
  const output = value("--output");
  if (!sdkDirectory || !sdkSha || !hostVersion || !repository || !output) {
    throw new Error(
      "Usage: ensure-sdk-release.mjs --sdk-dir <dir> --sdk-sha <sha> " +
        "--host-version <version> --repository <owner/repo> --output <github-output>",
    );
  }

  const plan = JSON.parse(
    run(process.execPath, [join(sdkDirectory, "scripts/release-version.mjs"), "--sha", sdkSha], {
      cwd: sdkDirectory,
    }),
  );
  let manifest = await publishedRelease(repository, plan);
  if (!manifest && !plan.releaseRequired) {
    throw new Error(`Reusable SDK release ${plan.tag} is not published with a valid manifest`);
  }
  if (!manifest) {
    run("gh", [
      "workflow",
      "run",
      "prepare-release.yml",
      "--repo",
      repository,
      "--ref",
      "main",
      "-f",
      `sdk_sha=${sdkSha}`,
    ]);
    for (let attempt = 0; attempt < 60 && !manifest; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      manifest = await publishedRelease(repository, plan);
    }
  }
  if (!manifest) throw new Error(`Timed out waiting for qualified SDK release ${plan.tag}`);

  await writeFile(
    output,
    [
      `sdk_tag=${plan.tag}`,
      `sdk_version=${plan.version}`,
      `sdk_sha=${sdkSha}`,
      `sdk_release_sha=${plan.releaseSha}`,
      `protocol_min=${manifest.protocolMin}`,
      `protocol_max=${manifest.protocolMax}`,
      `host_compatibility=openagent-desktop = ${hostVersion}`,
      "",
    ].join("\n"),
    { flag: "a" },
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
