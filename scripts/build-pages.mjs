import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { checkPages } from "./check-pages.mjs";
import { renderPluginStore } from "./pages-plugin-store.mjs";
import { downloadChannel } from "./pages-downloads.mjs";
import { mirrorOrigin } from "./release-mirror-plan.mjs";

const output = "dist-pages";
const releaseManifestPaths = {
  stable: process.env.OPENAGENT_STABLE_RELEASE_MANIFEST,
  rc: process.env.OPENAGENT_RC_RELEASE_MANIFEST,
  beta: process.env.OPENAGENT_BETA_RELEASE_MANIFEST,
};
let mirroredKeys = [];
if (Object.values(releaseManifestPaths).some(Boolean)) {
  try {
    const response = await fetch(`${mirrorOrigin}/mirror-index.json`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      const index = await response.json();
      if (index.schema_version === 1 && index.origin === mirrorOrigin && index.objects)
        mirroredKeys = Object.keys(index.objects);
    }
  } catch {
    console.log("Release mirror unavailable; using GitHub download URLs.");
  }
}

async function buildDownloadChannel(releaseManifestPath) {
  if (!releaseManifestPath) {
    return null;
  }

  return downloadChannel(JSON.parse(await readFile(releaseManifestPath, "utf8")), mirroredKeys);
}

async function buildDownloadManifest() {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(releaseManifestPaths).map(async ([channel, manifestPath]) => [
        channel,
        await buildDownloadChannel(manifestPath),
      ]),
    ),
  );
}

const docsBuild = spawnSync(process.execPath, ["run", "build"], {
  cwd: resolve("website/docs"),
  stdio: "inherit",
});
if (docsBuild.error) throw docsBuild.error;
if (docsBuild.status !== 0) throw new Error("Starlight documentation build failed.");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp("website", output, {
  recursive: true,
  filter: (source) => resolve(source) !== resolve("website/docs"),
});
await cp("website/docs/dist", `${output}/docs`, { recursive: true });
await cp("assets", `${output}/assets`, { recursive: true });
const indexPath = `${output}/index.html`;
const index = await readFile(indexPath, "utf8");
const registry = JSON.parse(await readFile("src/lib/officialPluginRegistry.json", "utf8"));
await writeFile(
  indexPath,
  index
    .replaceAll("../assets/", "./assets/")
    .replace("<!-- official-plugin-cards -->", () => renderPluginStore(registry)),
);
await writeFile(
  `${output}/downloads.json`,
  `${JSON.stringify(await buildDownloadManifest(), null, 2)}\n`,
);
await writeFile(`${output}/.nojekyll`, "");
await checkPages(output);
