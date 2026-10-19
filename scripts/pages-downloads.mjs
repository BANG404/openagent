import { githubReleasePath, mirrorKey, mirrorOrigin } from "./release-mirror-plan.mjs";

const suffixes = {
  windows: "_x64-full-no-webview-setup.exe",
  macArm: "_aarch64.dmg",
  macIntel: "_x64.dmg",
  linuxDeb: "_amd64.deb",
  linuxRpm: ".x86_64.rpm",
  linuxAppImage: "_amd64.AppImage",
};

/** @param {import('./release-mirror-plan.mjs').Release & {html_url?: string}|null} release @param {string[]} [mirroredKeys] */
export function downloadChannel(release, mirroredKeys = []) {
  if (!release || release.draft) return null;
  const available = new Set(mirroredKeys);
  const assets = Object.fromEntries(
    Object.entries(suffixes).flatMap(([platform, suffix]) => {
      const asset = release.assets.find((entry) => entry.name.endsWith(suffix));
      if (!asset) return [];
      const identity = githubReleasePath(asset.browser_download_url);
      const key = mirrorKey(identity.tag, identity.name);
      return [
        [platform, available.has(key) ? `${mirrorOrigin}/${key}` : asset.browser_download_url],
      ];
    }),
  );
  return {
    version: release.tag_name,
    releaseUrl:
      release.html_url ?? `https://github.com/BANG404/openagent/releases/tag/${release.tag_name}`,
    assets,
  };
}
