/** @typedef {{name: string, size: number, digest?: string, browser_download_url: string}} Asset */
/** @typedef {{tag_name: string, draft: boolean, published_at: string, assets: Asset[]}} Release */
export const mirrorOrigin = "https://dl-openagent.ibat.ac.cn";
export const repository = "BANG404/openagent";
export const mirrorPrefix = "releases/download/";
const desktopTag = /^v\d+\.\d+\.\d+(?:-(alpha|beta|rc)\.\d+)?$/;
const rollingTag = /^(?:(?:runtime|frontend)-)?(?:alpha|beta|rc|stable)$/;
const roots = [
  "latest.json",
  "openagent-distribution.json",
  "openagent-sdk-manifest.json",
  "openagent-frontend-manifest.json",
  "openagent-compatibility-policy.json",
];

/** @param {string} value */
export function safeSegment(value) {
  if (!/^[a-zA-Z0-9._+-]+$/.test(value) || value === "." || value === "..")
    throw new Error(`Unsafe release path: ${value}`);
  return value;
}

/** @param {string} tag @param {string} name */
export function mirrorKey(tag, name) {
  return `${mirrorPrefix}${safeSegment(tag)}/${safeSegment(name)}`;
}

/** @param {Release[]} releases @param {number} keep */
export function selectMirrorReleases(releases, keep = 2) {
  if (!Number.isSafeInteger(keep) || keep < 1) throw new Error("Invalid release retention");
  /** @type {Map<string, number>} */
  const counts = new Map();
  return releases
    .filter((release) => !release.draft)
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .filter((release) => {
      const match = desktopTag.exec(release.tag_name);
      if (!match)
        return rollingTag.test(release.tag_name) || release.tag_name === "compatibility-policy";
      if (!release.assets.some((asset) => asset.name.endsWith("_x64-full-no-webview-setup.exe")))
        return false;
      const channel = match[1] ?? "stable";
      const count = counts.get(channel) ?? 0;
      counts.set(channel, count + 1);
      return count < keep;
    });
}

/** Find actual resource dependencies, excluding unrelated build/provenance archives.
 * @param {unknown} value @returns {{files: string[], urls: string[]}}
 */
export function manifestReferences(value) {
  const files = new Set();
  const urls = new Set();
  /** @param {unknown} node */
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if ("file" in node && typeof node.file === "string") files.add(safeSegment(node.file));
    if ("url" in node && typeof node.url === "string") urls.add(node.url);
    for (const child of Object.values(node)) visit(child);
  }
  visit(value);
  return { files: [...files], urls: [...urls] };
}

/** @param {string} url */
export function githubReleasePath(url) {
  const parsed = new URL(url);
  const prefix = `/${repository}/${mirrorPrefix}`;
  if (
    parsed.origin !== "https://github.com" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !parsed.pathname.startsWith(prefix)
  )
    throw new Error(`Unsupported release URL: ${url}`);
  const segments = parsed.pathname.slice(prefix.length).split("/").map(decodeURIComponent);
  if (segments.length !== 2) throw new Error("Invalid release URL path");
  return { tag: safeSegment(segments[0]), name: safeSegment(segments[1]) };
}

/** @param {Release[]} releases @param {(asset: Asset) => Promise<unknown>} readManifest @param {Release[]} [selectedReleases] */
export async function buildMirrorPlan(
  releases,
  readManifest,
  selectedReleases = selectMirrorReleases(releases),
) {
  /** @type {Map<string, {key: string, tag: string, asset: Asset}>} */
  const selected = new Map();
  const byTag = new Map(releases.map((release) => [release.tag_name, release]));
  /** @param {string} tag @param {string} name */
  async function add(tag, name) {
    const key = mirrorKey(tag, name);
    if (selected.has(key)) return;
    const release = byTag.get(tag);
    const asset = release?.assets.find((entry) => entry.name === name);
    if (!asset || release?.draft) throw new Error(`Missing published mirror dependency: ${key}`);
    if (
      !Number.isSafeInteger(asset.size) ||
      asset.size < 1 ||
      !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? "")
    )
      throw new Error(`Missing asset size or SHA-256: ${key}`);
    const source = githubReleasePath(asset.browser_download_url);
    if (source.tag !== tag || source.name !== name)
      throw new Error("Release asset URL disagrees with identity");
    selected.set(key, { key, tag, asset });
    const signature = release.assets.find((entry) => entry.name === `${name}.sig`);
    if (signature) await add(tag, signature.name);
    if (!roots.includes(name)) return;
    if (name !== "latest.json" && !signature) throw new Error(`Missing manifest signature: ${key}`);
    const references = manifestReferences(await readManifest(asset));
    for (const file of references.files) await add(tag, file);
    for (const url of references.urls) {
      const target = githubReleasePath(url);
      await add(target.tag, target.name);
    }
  }
  for (const release of selectedReleases) {
    for (const asset of release.assets) {
      if (
        roots.includes(asset.name) ||
        (desktopTag.test(release.tag_name) && asset.name.endsWith("_x64-full-no-webview-setup.exe"))
      )
        await add(release.tag_name, asset.name);
    }
  }
  return [...selected.values()].sort(
    (a, b) =>
      Number(a.asset.name.endsWith(".json")) - Number(b.asset.name.endsWith(".json")) ||
      a.key.localeCompare(b.key),
  );
}

/** @param {{key: string, size: number}[]} existing @param {{key: string, asset: Asset}[]} plan @param {number} budget */
export function mirrorCapacity(existing, plan, budget) {
  if (!Number.isSafeInteger(budget) || budget < 1) throw new Error("Invalid mirror byte budget");
  const sizes = new Map(existing.map((entry) => [entry.key, entry.size]));
  for (const entry of plan)
    sizes.set(entry.key, Math.max(sizes.get(entry.key) ?? 0, entry.asset.size));
  const peak = [...sizes.values()].reduce((sum, size) => sum + size, 0);
  const retained = plan.reduce((sum, entry) => sum + entry.asset.size, 0);
  if (peak > budget)
    throw new Error(
      `Mirror upload would exceed byte budget (${peak} > ${budget}); keep existing downloads intact`,
    );
  return { peak, retained };
}
