import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ name: string; browser_download_url: string; digest: string }} ReleaseAsset */
/** @typedef {{ tag_name: string; html_url: string; body: string | null; assets: ReleaseAsset[] }} PluginRelease */
/** @typedef {{ schema_version: number; generated_at: number; repositories: Record<string, PluginRelease[]> }} ReleaseIndex */

/** @param {string} repository */
export function repositoryPath(repository) {
  const url = new URL(repository);
  const match = /^\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(url.pathname);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match
  ) {
    throw new Error(`Unsupported registry repository: ${repository}`);
  }
  return match[1].toLowerCase();
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid GitHub release object");
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/** Retain protocol metadata and verified archives, never source-branch versions.
 * @param {unknown} value
 * @param {string} repository
 * @returns {PluginRelease | null}
 */
export function projectRelease(value, repository) {
  const release = object(value);
  if (release.draft !== false || release.prerelease !== false) return null;
  const prefix = `https://github.com/${repository}/releases/`;
  if (
    typeof release.tag_name !== "string" ||
    !release.tag_name ||
    typeof release.html_url !== "string" ||
    !release.html_url.toLowerCase().startsWith(`${prefix}tag/`) ||
    !Array.isArray(release.assets)
  ) {
    throw new Error(`Invalid stable release for ${repository}`);
  }
  const assets = release.assets.flatMap((value) => {
    const asset = object(value);
    if (
      typeof asset.name !== "string" ||
      !/\.(zip|tar\.gz|tgz)$/i.test(asset.name) ||
      typeof asset.browser_download_url !== "string" ||
      !asset.browser_download_url.toLowerCase().startsWith(`${prefix}download/`) ||
      typeof asset.digest !== "string" ||
      !/^sha256:[a-f\d]{64}$/i.test(asset.digest)
    ) {
      return [];
    }
    const url = new URL(asset.browser_download_url);
    if (url.username || url.password || url.search || url.hash) return [];
    return [{ name: asset.name, browser_download_url: url.href, digest: asset.digest }];
  });
  // The updater needs the publisher's protocol range, not arbitrary release prose.
  let metadata = null;
  if (typeof release.body === "string") {
    const start = release.body.indexOf("<!-- openagent-plugin ");
    if (start !== -1) {
      const end = release.body.indexOf(" -->", start);
      metadata = release.body.slice(start, end === -1 ? start + 16_384 : end + 4);
    }
  }
  return { tag_name: release.tag_name, html_url: release.html_url, body: metadata, assets };
}

/** @param {{ plugins: { repository: string }[] }} registry
 * @param {{ token?: string; fetcher?: typeof fetch; now?: number }} [options]
 * @returns {Promise<ReleaseIndex>}
 */
export async function generateReleaseIndex(
  registry,
  { token, fetcher = fetch, now = Date.now() } = {},
) {
  /** @type {Record<string, PluginRelease[]>} */
  const repositories = {};
  for (const repository of new Set(
    registry.plugins.map((plugin) => repositoryPath(plugin.repository)),
  )) {
    const response = await fetcher(
      `https://api.github.com/repos/${repository}/releases?per_page=100`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "OpenAgent-ReleaseIndex",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok)
      throw new Error(`Release index fetch failed for ${repository}: HTTP ${response.status}`);
    const releases = /** @type {unknown} */ (await response.json());
    if (!Array.isArray(releases)) throw new Error(`Invalid release list for ${repository}`);
    repositories[repository] = releases.flatMap((value) => {
      const release = projectRelease(value, repository);
      return release ? [release] : [];
    });
  }
  return { schema_version: 1, generated_at: Math.floor(now / 1000), repositories };
}

async function main() {
  const registry = JSON.parse(await readFile("src/lib/officialPluginRegistry.json", "utf8"));
  const index = await generateReleaseIndex(registry, { token: process.env.GH_TOKEN });
  const content = `${JSON.stringify(index, null, 2)}\n`;
  if (Buffer.byteLength(content) > 4 * 1024 * 1024) {
    throw new Error("Plugin release index exceeds the Runtime's 4 MiB limit");
  }
  await writeFile("plugin-releases.json", content);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
