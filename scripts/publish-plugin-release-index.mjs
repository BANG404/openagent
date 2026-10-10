import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const tag = "plugin-index";
const assetName = "plugin-releases.json";
const maxBytes = 4 * 1024 * 1024;

/** @typedef {{ id: number; name: string; size: number }} Asset */
/** @typedef {{ id: number; immutable: boolean; draft: boolean; prerelease: boolean; assets: Asset[] }} Release */

/** Publish only a complete snapshot; restore the previous bytes on an upload failure.
 * @param {{ repository: string; target: string; token: string; content: string; fetcher?: typeof fetch }} options
 */
export async function publishReleaseIndex({ repository, target, token, content, fetcher = fetch }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^[a-f\d]{40}$/.test(target) || !token) {
    throw new Error("Repository, exact source commit and server token are required");
  }
  const index = JSON.parse(content);
  if (
    Buffer.byteLength(content) > maxBytes ||
    index?.schema_version !== 1 ||
    !Number.isInteger(index.generated_at) ||
    Math.abs(Date.now() / 1000 - index.generated_at) > 3600 ||
    !index.repositories ||
    Array.isArray(index.repositories) ||
    typeof index.repositories !== "object"
  ) {
    throw new Error("Refusing to publish an invalid or expired plugin index");
  }
  const api = `https://api.github.com/repos/${repository}/releases`;
  const uploads = `https://uploads.github.com/repos/${repository}/releases`;
  /** @param {string} url @param {RequestInit} [options] */
  const request = async (url, options = {}) => {
    const response = await fetcher(url, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...options.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Plugin index publication failed: HTTP ${response.status}`);
    return response;
  };
  const existing = await fetcher(`${api}/tags/${tag}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  /** @type {Release} */
  let release;
  if (existing.status === 404) {
    const created = await request(api, {
      method: "POST",
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: target,
        name: "OpenAgent plugin release index",
        body: "Rolling plugin update metadata, refreshed every 30 minutes. This is not an application release.",
        draft: true,
        prerelease: true,
        make_latest: "false",
      }),
    });
    release = await created.json();
  } else {
    if (!existing.ok) throw new Error(`Cannot inspect index Release: HTTP ${existing.status}`);
    release = await existing.json();
  }
  if (release.immutable)
    throw new Error("The plugin-index Release must allow rolling asset updates");
  if (!Number.isInteger(release.id) || !Array.isArray(release.assets)) {
    throw new Error("Invalid index Release response");
  }
  // Ensure an existing channel cannot become the latest application release.
  if (!release.prerelease && !release.draft) {
    await request(`${api}/${release.id}`, {
      method: "PATCH",
      body: JSON.stringify({ prerelease: true, make_latest: "false" }),
    });
  }
  const previous = release.assets.find((asset) => asset.name === assetName);
  /** @type {Uint8Array | undefined} */
  let backup;
  if (previous) {
    if (!Number.isInteger(previous.id) || previous.size > maxBytes) {
      throw new Error("Invalid previous index asset");
    }
    const response = await request(`${api}/assets/${previous.id}`, {
      headers: { Accept: "application/octet-stream" },
    });
    backup = new Uint8Array(await response.arrayBuffer());
    if (backup.byteLength > maxBytes) throw new Error("Previous index exceeds the size limit");
    await request(`${api}/assets/${previous.id}`, { method: "DELETE" });
  }
  /** @param {string | Uint8Array} bytes */
  const upload = (bytes) =>
    request(`${uploads}/${release.id}/assets?name=${assetName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bytes,
    });
  try {
    await upload(content);
  } catch (error) {
    if (backup) {
      try {
        // GitHub can leave a zero-byte starter asset after a failed upload.
        const current = /** @type {Asset[]} */ (
          await (await request(`${api}/${release.id}/assets?per_page=100`)).json()
        );
        for (const asset of current.filter((candidate) => candidate.name === assetName)) {
          await request(`${api}/assets/${asset.id}`, { method: "DELETE" });
        }
        await upload(backup);
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          "Index upload and restoration both failed",
          {
            cause: restoreError,
          },
        );
      }
    }
    throw error;
  }
  if (release.draft) {
    await request(`${api}/${release.id}`, {
      method: "PATCH",
      body: JSON.stringify({ draft: false, prerelease: true, make_latest: "false" }),
    });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await publishReleaseIndex({
    repository: process.env.GH_REPO ?? "",
    target: process.env.RELEASE_TARGET ?? "",
    token: process.env.GH_TOKEN ?? "",
    content: await readFile("plugin-releases.json", "utf8"),
  });
}
