import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import process from "node:process";
import { requireManifestEntry } from "./bundle-manifest.mjs";

const workspace = process.cwd();
const clientRoot = path.join(workspace, ".svelte-kit", "output", "client");
const serverRoot = path.join(workspace, ".svelte-kit", "output", "server");

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function assetSize(root, file) {
  const absolutePath = path.join(root, file);
  const [metadata, source] = await Promise.all([stat(absolutePath), readFile(absolutePath)]);
  return { raw: metadata.size, gzip: gzipSync(source).byteLength };
}

/**
 * Measure every JavaScript chunk needed by an entry, counting each shared
 * chunk once. This keeps route budgets from missing transitive imports.
 *
 * @param {string} root
 * @param {Record<string, { file?: string; imports?: string[] }>} manifest
 * @param {string} entryKey
 */
async function entryGraphSize(root, manifest, entryKey) {
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key)) return;
    const entry = manifest[key];
    if (!entry?.file) return;
    seen.add(key);
    for (const imported of entry.imports ?? []) visit(imported);
  };
  visit(entryKey);

  let raw = 0;
  let gzip = 0;
  for (const key of seen) {
    const size = await assetSize(root, manifest[key].file);
    raw += size.raw;
    gzip += size.gzip;
  }
  return { raw, gzip };
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

const [clientManifest, serverManifest, clientApp] = await Promise.all([
  readJson(path.join(clientRoot, ".vite", "manifest.json")),
  readJson(path.join(serverRoot, ".vite", "manifest.json")),
  readFile(path.join(workspace, ".svelte-kit", "generated", "client-optimized", "app.js"), "utf8"),
]);

const remoteRouteMatch = clientApp.match(/["']\/remote["']\s*:\s*\[(\d+)\]/);
if (!remoteRouteMatch) throw new Error("Could not resolve the /remote client route node");
const mainRouteMatch = clientApp.match(/["']\/["']\s*:\s*\[(\d+)\]/);
if (!mainRouteMatch) throw new Error("Could not resolve the main client route node");

const budgets = [
  {
    label: "main client route",
    root: clientRoot,
    graph: `.svelte-kit/generated/client-optimized/nodes/${mainRouteMatch[1]}.js`,
    rawLimit: 1400 * 1024,
    gzipLimit: 448 * 1024,
  },
  {
    label: "remote client route",
    root: clientRoot,
    entry: requireManifestEntry(
      clientManifest,
      `.svelte-kit/generated/client-optimized/nodes/${remoteRouteMatch[1]}.js`,
    ),
    rawLimit: 256 * 1024,
    gzipLimit: 96 * 1024,
  },
  {
    label: "remote server route",
    root: serverRoot,
    entry: requireManifestEntry(serverManifest, "src/routes/remote/+page.svelte"),
    rawLimit: 256 * 1024,
    gzipLimit: 96 * 1024,
  },
  {
    label: "ECharts runtime",
    root: clientRoot,
    entry: requireManifestEntry(clientManifest, "src/lib/streamdown/echartsRuntime.ts"),
    rawLimit: 640 * 1024,
    gzipLimit: 230 * 1024,
  },
  {
    label: "settings view",
    root: clientRoot,
    entry: requireManifestEntry(clientManifest, "src/lib/components/SettingsView.svelte"),
    // The MCP server categorization task added roughly 3 KiB to this view.
    rawLimit: 164 * 1024,
    gzipLimit: 64 * 1024,
  },
];

let failed = false;
for (const budget of budgets) {
  const size = budget.graph
    ? await entryGraphSize(budget.root, clientManifest, budget.graph)
    : await assetSize(budget.root, budget.entry.file);
  const rawPassed = size.raw <= budget.rawLimit;
  const gzipPassed = size.gzip <= budget.gzipLimit;
  const status = rawPassed && gzipPassed ? "PASS" : "FAIL";
  console.log(
    `${status} ${budget.label}: ${formatKiB(size.raw)} raw / ${formatKiB(size.gzip)} gzip ` +
      `(limits ${formatKiB(budget.rawLimit)} / ${formatKiB(budget.gzipLimit)})`,
  );
  failed ||= !rawPassed || !gzipPassed;
}

if (failed) process.exitCode = 1;
