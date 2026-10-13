import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyAlphaCandidate } from "./alpha-artifacts.mjs";
import { listAlphaReleaseIdentities } from "./alpha-release-plan.mjs";

/** @param {string[]} args */
function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", windowsHide: true }).trim();
}

/** Only run after the exact installed Windows candidate passed its smoke test.
 * @param {{directory: string; version: string; sourceSha: string; sdkSha: string; repository: string}} options
 */
export async function publishAlpha({ directory, version, sourceSha, sdkSha, repository }) {
  if (repository !== "BANG404/openagent")
    throw new Error("Alpha publication is restricted to the product repository");
  const candidate = await verifyAlphaCandidate({ directory, version, sourceSha, sdkSha });
  const tag = `v${version}`;
  const scratch = await mkdtemp(path.join(tmpdir(), "openagent-alpha-publication-"));
  try {
    const release = listAlphaReleaseIdentities(repository);
    if (release.some((entry) => entry.tag_name === tag))
      throw new Error("Alpha release identity already exists; create a new Alpha candidate");
    const full = candidate.assets.find((artifact) => artifact.file.endsWith("-full-setup.exe"));
    if (!full) throw new Error("Missing complete Windows installer");
    const body = path.join(scratch, "release.md");
    await writeFile(
      body,
      `Windows Alpha preview. Built with reduced qualification for manual testing.\n\n` +
        `[Download the complete Windows installer](https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(full.file)})\n\n` +
        `Source: ${sourceSha}\nSDK: ${sdkSha}\nUpgrade baseline: ${candidate.baseline_tag}\n\n` +
        `Installs as OpenAgent Alpha and defaults to ~/.openagent-alpha. Production update channels are unchanged.\n`,
    );
    gh([
      "release",
      "create",
      tag,
      "--repo",
      repository,
      "--target",
      sourceSha,
      "--title",
      `OpenAgent ${version}`,
      "--notes-file",
      body,
      "--draft",
      "--prerelease",
      "--latest=false",
    ]);
    gh([
      "release",
      "upload",
      tag,
      "--repo",
      repository,
      ...candidate.assets.map((asset) => path.join(directory, asset.file)),
      path.join(directory, "alpha-candidate.json"),
      path.join(directory, "alpha-candidate.json.sig"),
    ]);
    gh([
      "release",
      "edit",
      tag,
      "--repo",
      repository,
      "--draft=false",
      "--prerelease",
      "--latest=false",
    ]);
    const channels = {
      alpha: ["latest.json"],
      "frontend-alpha": [
        "openagent-frontend-manifest.json",
        "openagent-frontend-manifest.json.sig",
        "openagent-frontend.tar.gz",
      ],
      "runtime-alpha": [
        "openagent-sdk-manifest.json",
        "openagent-sdk-manifest.json.sig",
        "openagent-server-windows-x64.exe",
        "codex-windows-sandbox-setup.exe",
        "codex-command-runner.exe",
      ],
    };
    for (const [channel, files] of Object.entries(channels)) {
      const existing = release.find((entry) => entry.tag_name === channel);
      if (existing?.immutable) throw new Error(`Alpha channel is immutable: ${channel}`);
      if (!existing) {
        gh([
          "release",
          "create",
          channel,
          "--repo",
          repository,
          "--target",
          sourceSha,
          "--title",
          `OpenAgent ${channel}`,
          "--notes",
          "Rolling Windows Alpha preview channel",
          "--prerelease",
          "--latest=false",
          "--draft",
        ]);
      }
      // Publish payloads before their manifests; clients continue to verify exact digests.
      const ordered = [...files].sort(
        (a, b) => Number(a.includes("manifest")) - Number(b.includes("manifest")),
      );
      gh([
        "release",
        "upload",
        channel,
        "--repo",
        repository,
        "--clobber",
        ...ordered.map((file) => path.join(directory, file)),
      ]);
      gh([
        "release",
        "edit",
        channel,
        "--repo",
        repository,
        "--draft=false",
        "--prerelease",
        "--latest=false",
      ]);
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = path.resolve(process.argv[2]);
  const candidate = JSON.parse(
    await readFile(path.join(directory, "alpha-candidate.json"), "utf8"),
  );
  await publishAlpha({
    directory,
    version: process.env.ALPHA_VERSION ?? candidate.version,
    sourceSha: process.env.ALPHA_SOURCE_SHA ?? candidate.source_sha,
    sdkSha: process.env.ALPHA_SDK_SHA ?? candidate.sdk_sha,
    repository: process.env.GH_REPO ?? "",
  });
}
