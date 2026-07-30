import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import process from "node:process";

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

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function requireManifestEntry(manifest, key) {
  const entry = manifest[key];
  if (!entry?.file) throw new Error(`Missing Vite manifest entry: ${key}`);
  return entry;
}

const [clientManifest, serverManifest, clientApp] = await Promise.all([
  readJson(path.join(clientRoot, ".vite", "manifest.json")),
  readJson(path.join(serverRoot, ".vite", "manifest.json")),
  readFile(path.join(workspace, ".svelte-kit", "generated", "client-optimized", "app.js"), "utf8"),
]);

const remoteRouteMatch = clientApp.match(/["']\/remote["']\s*:\s*\[(\d+)\]/);
if (!remoteRouteMatch) throw new Error("Could not resolve the /remote client route node");

const budgets = [
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
    rawLimit: 160 * 1024,
    gzipLimit: 64 * 1024,
  },
];

let failed = false;
for (const budget of budgets) {
  const size = await assetSize(budget.root, budget.entry.file);
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
