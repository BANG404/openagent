// @ts-check
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Validate the exact npm tarball from an ordinary Node consumer, including real Runtime startup.
 * @param {string} candidate
 */
export async function verifyClientPackage(candidate) {
  const directory = await mkdtemp(join(tmpdir(), "openagent-npm-consumer-"));
  try {
    await writeConsumer(directory, candidate);
    execFileSync(process.execPath, ["install", "--ignore-scripts"], {
      cwd: directory,
      stdio: "inherit",
    });
    execFileSync(
      process.execPath,
      ["build", "--target", "browser", "browser.mjs", "--outfile", "browser.js"],
      { cwd: directory, stdio: "inherit" },
    );
    execFileSync("node", ["consumer.mjs"], { cwd: directory, stdio: "inherit", timeout: 120000 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** @param {string} directory @param {string} candidate */
async function writeConsumer(directory, candidate) {
  const { writeFile } = await import("node:fs/promises");
  const target = {
    "win32/x64": "windows-x64",
    "linux/x64": "linux-x64",
    "darwin/x64": "macos-x64",
    "darwin/arm64": "macos-arm64",
  }[`${process.platform}/${process.arch}`];
  assert(target, "Unsupported Runtime qualification platform");
  const manifest = JSON.parse(
    await readFile(join(candidate, "runtime/openagent-sdk-manifest.json"), "utf8"),
  );
  assert.ok(manifest.artifacts[target]);
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: {
        "@bang404/openagent-sdk": `file:${join(candidate, "openagent-sdk.tgz").replaceAll("\\", "/")}`,
      },
    }),
  );
  await writeFile(
    join(directory, "consumer.mjs"),
    `
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OpenAgentClient } from '@bang404/openagent-sdk';
import { HttpTransport } from '@bang404/openagent-sdk/httpTransport';
import { ensureRuntime, startRuntime, runtimeRelease } from '@bang404/openagent-sdk/runtime';
assert.equal(typeof OpenAgentClient, 'function');
assert.equal(typeof HttpTransport, 'function');
assert.ok(runtimeRelease?.manifestSha256);
const originalFetch = globalThis.fetch;
const base = new URL('.', runtimeRelease.manifestUrl).href;
let offline = false;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith(base)) return originalFetch(input, init);
  if (offline) throw new Error('Offline cache must not download');
  return new Response(await readFile(join(${JSON.stringify(join(candidate, "runtime"))}, new URL(url).pathname.split('/').at(-1))));
};
const cacheDirectory = ${JSON.stringify(join(directory, "cache"))};
const installed = await ensureRuntime({ cacheDirectory });
offline = true;
assert.deepEqual(await ensureRuntime({ cacheDirectory }), installed);
const runtime = await startRuntime({ cacheDirectory, workspace: process.cwd(), home: ${JSON.stringify(join(directory, "data"))} });
try {
  assert.equal(runtime.version, runtimeRelease.version.split(/[+-]/)[0]);
  const settings = await runtime.client.invokeProduct('get_settings', {});
  assert.equal(typeof settings, 'object');
} finally { await runtime.stop(); }
console.log('Packed npm SDK: Node imports, Runtime admission, authenticated requests and shutdown passed');
`,
  );
  await writeFile(
    join(directory, "browser.mjs"),
    "import { OpenAgentClient } from '@bang404/openagent-sdk'; import { HttpTransport } from '@bang404/openagent-sdk/httpTransport'; console.log(new OpenAgentClient(new HttpTransport()));\n",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Usage: verify-client-sdk-package.mjs <candidate>");
  await verifyClientPackage(resolve(process.argv[2]));
}
