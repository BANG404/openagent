import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const output = "dist-pages";
const releaseManifestPaths = {
  stable: process.env.OPENAGENT_STABLE_RELEASE_MANIFEST,
  beta: process.env.OPENAGENT_BETA_RELEASE_MANIFEST,
};
const assetSuffixes = {
  windows: "_x64-setup.exe",
  macArm: "_aarch64.dmg",
  macIntel: "_x64.dmg",
  linuxDeb: "_amd64.deb",
  linuxRpm: ".x86_64.rpm",
  linuxAppImage: "_amd64.AppImage",
};

async function buildDownloadChannel(channel, releaseManifestPath) {
  if (!releaseManifestPath) {
    return null;
  }

  const release = JSON.parse(await readFile(releaseManifestPath, "utf8"));
  if (!release) {
    return null;
  }
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const downloadAssets = Object.fromEntries(
    Object.entries(assetSuffixes).flatMap(([key, suffix]) => {
      const asset = assets.find(({ name }) => name.endsWith(suffix));
      return asset ? [[key, asset.browser_download_url]] : [];
    }),
  );

  return {
    version: release.tag_name ?? null,
    releaseUrl:
      release.html_url ??
      (channel === "stable"
        ? "https://github.com/BANG404/openagent/releases/latest"
        : "https://github.com/BANG404/openagent/releases?q=prerelease%3Atrue"),
    assets: downloadAssets,
  };
}

async function buildDownloadManifest() {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(releaseManifestPaths).map(async ([channel, manifestPath]) => [
        channel,
        await buildDownloadChannel(channel, manifestPath),
      ]),
    ),
  );
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp("website", output, { recursive: true });
await cp("assets", `${output}/assets`, { recursive: true });
const indexPath = `${output}/index.html`;
const index = await readFile(indexPath, "utf8");
await writeFile(indexPath, index.replaceAll("../assets/", "./assets/"));
await writeFile(
  `${output}/downloads.json`,
  `${JSON.stringify(await buildDownloadManifest(), null, 2)}\n`,
);
