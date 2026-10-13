// @ts-check
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const NODE_VERSION = "24.21.0";
const root = fileURLToPath(new URL("../", import.meta.url));
// Reviewed against https://nodejs.org/dist/v24.21.0/SHASUMS256.txt.
export const NODE_RELEASES = {
  "x86_64-pc-windows-msvc": {
    platform: "win-x64",
    sha256: "158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541",
  },
  "aarch64-pc-windows-msvc": {
    platform: "win-arm64",
    sha256: "8779b1bde1d39f8d420e3b57aa657b39891af434d3de44a919044cec06785921",
  },
  "x86_64-unknown-linux-gnu": {
    platform: "linux-x64",
    sha256: "6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff",
  },
  "aarch64-unknown-linux-gnu": {
    platform: "linux-arm64",
    sha256: "724282c3b43aec998aa9527380465b45d229e021b58035f5f4f63095eabfe5d5",
  },
  "x86_64-apple-darwin": {
    platform: "darwin-x64",
    sha256: "1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097",
  },
  "aarch64-apple-darwin": {
    platform: "darwin-arm64",
    sha256: "bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057",
  },
};
const hostTargets = {
  "win32/x64": "x86_64-pc-windows-msvc",
  "win32/arm64": "aarch64-pc-windows-msvc",
  "linux/x64": "x86_64-unknown-linux-gnu",
  "linux/arm64": "aarch64-unknown-linux-gnu",
  "darwin/x64": "x86_64-apple-darwin",
  "darwin/arm64": "aarch64-apple-darwin",
};

/** @param {string} target */
export function nodeRelease(target) {
  const pin = NODE_RELEASES[/** @type {keyof typeof NODE_RELEASES} */ (target)];
  if (!pin) throw new Error(`No bundled Node.js release for target ${target}`);
  const windows = pin.platform.startsWith("win-");
  const directory = `node-v${NODE_VERSION}-${pin.platform}`;
  return {
    ...pin,
    directory,
    executable: windows ? "node.exe" : "node",
    member: windows ? "node.exe" : "bin/node",
    archive: `${directory}.${windows ? "zip" : "tar.gz"}`,
  };
}

/** Windows must use bsdtar shipped by the OS, rather than Git's GNU tar.
 * @param {string} archive @param {string} destination @param {ReturnType<typeof nodeRelease>} release
 */
export function extractNodeArchive(archive, destination, release) {
  const tar =
    process.platform === "win32"
      ? path.join(process.env.SystemRoot || "C:/Windows", "System32", "tar.exe")
      : "tar";
  const result = spawnSync(
    tar,
    [
      "-xf",
      archive,
      "-C",
      destination,
      `${release.directory}/${release.member}`,
      `${release.directory}/LICENSE`,
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  if (result.error || result.status !== 0)
    throw new Error(`Node.js extraction failed: ${result.stderr}`, { cause: result.error });
}

/** @param {Uint8Array} bytes */
function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Prepare only the executable and its upstream license, never system-wide Node/npm.
 * @param {{ repositoryRoot?: string; target?: string; fetchRequest?: typeof fetch }} [options]
 */
export async function prepareNodeRuntime(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? root;
  const target =
    options.target ??
    process.env.OPENAGENT_NODE_TARGET ??
    process.env.TAURI_ENV_TARGET_TRIPLE ??
    hostTargets[/** @type {keyof typeof hostTargets} */ (`${process.platform}/${process.arch}`)];
  const release = nodeRelease(target);
  const destination = path.join(repositoryRoot, "src-tauri/resources/node-runtime");
  const executable = path.join(destination, release.executable);
  try {
    const record = JSON.parse(await readFile(path.join(destination, "provenance.json"), "utf8"));
    if (
      record.version === NODE_VERSION &&
      record.target === target &&
      record.archiveSha256 === release.sha256 &&
      record.executableSha256 === digest(await readFile(executable)) &&
      record.licenseSha256 === digest(await readFile(path.join(destination, "LICENSE")))
    )
      return executable;
  } catch {
    // Missing or changed preparation is repaired from the verified upstream archive.
  }

  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${release.archive}`;
  const cache = path.join(repositoryRoot, ".cache/node-runtime", release.archive);
  let bytes = await readFile(cache).catch(() => null);
  if (!bytes || digest(bytes) !== release.sha256) {
    console.log(`Preparing bundled Node.js ${NODE_VERSION} for ${target}`);
    const response = await (options.fetchRequest ?? fetch)(url, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`Node.js download failed: HTTP ${response.status} (${url})`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== release.sha256)
      throw new Error("Node.js archive SHA-256 does not match the reviewed pin");
    await mkdir(path.dirname(cache), { recursive: true });
    await writeFile(cache, bytes);
  }

  const staging = path.join(path.dirname(destination), `node-stage-${randomUUID()}`);
  await mkdir(staging, { recursive: true });
  try {
    extractNodeArchive(cache, staging, release);
    const source = path.join(staging, release.directory);
    const binary = path.join(source, release.member);
    const license = path.join(source, "LICENSE");
    const record = {
      version: NODE_VERSION,
      target,
      url,
      archiveSha256: release.sha256,
      executableSha256: digest(await readFile(binary)),
      licenseSha256: digest(await readFile(license)),
    };
    const prepared = path.join(staging, "prepared");
    await mkdir(prepared);
    await copyFile(binary, path.join(prepared, release.executable));
    await copyFile(license, path.join(prepared, "LICENSE"));
    if (release.executable === "node") await chmod(path.join(prepared, "node"), 0o755);
    await writeFile(path.join(prepared, "provenance.json"), `${JSON.stringify(record, null, 2)}\n`);
    await rm(destination, { recursive: true, force: true });
    await rename(prepared, destination);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return executable;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const targetIndex = process.argv.indexOf("--target");
  if (targetIndex >= 0 && !process.argv[targetIndex + 1])
    throw new Error("--target requires a target triple");
  await prepareNodeRuntime({
    target: targetIndex >= 0 ? process.argv[targetIndex + 1] : undefined,
  });
}
