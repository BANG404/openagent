import { S3Client, file } from "bun";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildMirrorPlan,
  mirrorCapacity,
  mirrorOrigin,
  mirrorPrefix,
  matchesAssetBytes,
  repository,
  selectMirrorReleases,
} from "./release-mirror-plan.mjs";

const dryRun = process.argv.includes("--dry-run");
const keep = Number(process.env.OPENAGENT_MIRROR_KEEP ?? 2);
const budget = Number(process.env.OPENAGENT_MIRROR_MAX_BYTES ?? 8_000_000_000);
const scratch = await mkdtemp(join(tmpdir(), "openagent-release-mirror-"));
const downloaded = new Map();
/** Download only public release URLs; no GitHub credential is sent to redirects.
 * @param {import('./release-mirror-plan.mjs').Asset} asset
 */
async function download(asset) {
  if (downloaded.has(asset.browser_download_url)) return downloaded.get(asset.browser_download_url);
  console.log(`Verifying source ${asset.browser_download_url}`);
  const destination = join(scratch, String(downloaded.size));
  execFileSync(
    process.platform === "win32" ? "curl.exe" : "curl",
    [
      "--fail",
      "--location",
      "--silent",
      "--show-error",
      "--retry",
      "3",
      "--connect-timeout",
      "20",
      "--max-time",
      "300",
      "--output",
      destination,
      asset.browser_download_url,
    ],
    { windowsHide: true, timeout: 1_300_000 },
  );
  const digest = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(destination)) {
    digest.update(chunk);
    size += chunk.length;
  }
  if (size !== asset.size || `sha256:${digest.digest("hex")}` !== asset.digest)
    throw new Error(`Release integrity check failed: ${asset.name}`);
  downloaded.set(asset.browser_download_url, destination);
  return destination;
}

try {
  /** @type {import('./release-mirror-plan.mjs').Release[]} */
  const releases = JSON.parse(
    execFileSync(
      "gh",
      ["api", "--paginate", "--slurp", `repos/${repository}/releases?per_page=100`],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true },
    ),
  ).flat();
  const selected = selectMirrorReleases(releases, keep);
  console.log(`Planning ${selected.length} published releases and channels`);
  const plan = await buildMirrorPlan(
    releases,
    async (asset) => file(await download(asset)).json(),
    selected,
  );
  if (!plan.some((entry) => entry.asset.name.endsWith("_x64-full-no-webview-setup.exe")))
    throw new Error("No published complete Windows installer; refusing an empty mirror");
  const retained = plan.reduce((sum, entry) => sum + entry.asset.size, 0);
  console.log(
    JSON.stringify({
      dryRun,
      releases: selected.map((entry) => entry.tag_name),
      files: plan.length,
      retainedBytes: retained,
      budgetBytes: budget,
    }),
  );
  if (retained > budget) throw new Error("Selected releases exceed mirror budget");
  if (!dryRun) {
    for (const name of [
      "OPENAGENT_R2_ENDPOINT",
      "OPENAGENT_R2_ACCESS_KEY_ID",
      "OPENAGENT_R2_SECRET_ACCESS_KEY",
    ])
      if (!process.env[name]) throw new Error(`Missing ${name}`);
    const bucket = new S3Client({
      endpoint: process.env.OPENAGENT_R2_ENDPOINT,
      accessKeyId: process.env.OPENAGENT_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.OPENAGENT_R2_SECRET_ACCESS_KEY,
      bucket: "openagent-releases",
      region: "auto",
    });
    /** @type {{key: string, size: number}[]} */
    const existing = [];
    /** @type {string | undefined} */
    let continuationToken;
    do {
      const page = await bucket.list({ continuationToken, maxKeys: 1000 });
      for (const entry of page.contents ?? [])
        existing.push({ key: entry.key, size: entry.size ?? 0 });
      continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
      if (page.isTruncated && !continuationToken) throw new Error("Incomplete R2 listing");
    } while (continuationToken);
    // Account for overlap with the still-live mirror and reserve space for its index.
    mirrorCapacity(existing, plan, budget - 1_000_000);
    const indexFile = bucket.file("mirror-index.json");
    const previous = (await indexFile.exists()) ? await indexFile.json() : { objects: {} };
    for (const entry of plan) {
      const current = previous.objects?.[entry.key];
      if (
        current?.digest === entry.asset.digest &&
        existing.some((object) => object.key === entry.key && object.size === entry.asset.size)
      )
        continue;
      const remote = bucket.file(entry.key);
      // Resume an interrupted initial sync even before its index was published.
      if (
        existing.some((object) => object.key === entry.key) &&
        matchesAssetBytes(entry.asset, await remote.arrayBuffer())
      ) {
        console.log(`Verified existing ${entry.key}`);
        continue;
      }
      const local = await download(entry.asset);
      await remote.write(file(local), {
        type: entry.asset.name.endsWith(".json") ? "application/json" : "application/octet-stream",
      });
      if (!matchesAssetBytes(entry.asset, await remote.arrayBuffer()))
        throw new Error(`R2 upload integrity mismatch: ${entry.key}`);
      console.log(`Mirrored ${entry.key}`);
    }
    const objects = Object.fromEntries(
      plan.map((entry) => [entry.key, { size: entry.asset.size, digest: entry.asset.digest }]),
    );
    const index = {
      schema_version: 1,
      origin: mirrorOrigin,
      updated_at: new Date().toISOString(),
      objects,
    };
    // Publish availability only once every dependency has been verified and uploaded.
    await indexFile.write(`${JSON.stringify(index)}\n`, { type: "application/json" });
    for (const entry of existing) {
      if (entry.key.startsWith(mirrorPrefix) && !Object.hasOwn(objects, entry.key)) {
        await bucket.delete(entry.key);
        console.log(`Removed retired mirror object ${entry.key}`);
      }
    }
    console.log(`Mirror ready: ${plan.length} files, ${retained} bytes at ${mirrorOrigin}`);
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
