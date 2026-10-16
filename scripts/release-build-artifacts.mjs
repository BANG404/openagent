// @ts-check
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { chmod, copyFile, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const frontendPaths = ["build", ".cache/bootstrap-dist"];
const shellTargets = {
  "windows-x64": "src-tauri/target/release/openagent.exe",
  "linux-x64": "src-tauri/target/release/openagent",
  "macos-arm64": "src-tauri/target/aarch64-apple-darwin/release/openagent",
  "macos-x64": "src-tauri/target/x86_64-apple-darwin/release/openagent",
};
/** @param {Uint8Array | string} bytes */
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** @param {string} repositoryRoot */
export function buildSourceIdentity(repositoryRoot = root) {
  const git = (/** @type {string} */ ref) =>
    execFileSync("git", ["rev-parse", ref], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  return {
    desktop_sha: git("HEAD"),
    sdk_sha: git("HEAD:runtime"),
    version: JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8")).version,
  };
}

/** @param {string} directory @param {string} relative @returns {Promise<string[]>} */
async function filesUnder(directory, relative) {
  const absolute = path.join(directory, relative);
  const info = await lstat(absolute);
  if (info.isSymbolicLink()) throw new Error(`Build artifact contains a symlink: ${relative}`);
  if (info.isFile()) return [relative];
  if (!info.isDirectory()) throw new Error(`Unsupported build artifact: ${relative}`);
  const entries = await readdir(absolute);
  const nested = await Promise.all(
    entries.sort().map((name) => filesUnder(directory, `${relative}/${name}`)),
  );
  return nested.flat();
}

/** @param {string} kind @param {string} target */
function requiredPaths(kind, target) {
  if (kind === "frontend") return ["build/index.html", ".cache/bootstrap-dist/index.html"];
  const executable = shellTargets[/** @type {keyof typeof shellTargets} */ (target)];
  if (kind !== "shell" || !executable)
    throw new Error(`Unsupported build artifact ${kind}/${target}`);
  return [
    executable,
    "src-tauri/resources/node-runtime/provenance.json",
    "src-tauri/resources/terminal-tools/provenance.json",
  ];
}

/** @param {string} file @param {string} kind @param {string} target */
function allowedPath(file, kind, target) {
  if (file.includes("\\") || file.split("/").some((part) => !part || part === "." || part === ".."))
    return false;
  if (kind === "frontend") return frontendPaths.some((prefix) => file.startsWith(`${prefix}/`));
  const executable = requiredPaths(kind, target)[0];
  return (
    file === executable ||
    (path.posix.dirname(file) === path.posix.dirname(executable) && file.endsWith(".dll")) ||
    ["src-tauri/resources/node-runtime/", "src-tauri/resources/terminal-tools/"].some((prefix) =>
      file.startsWith(prefix),
    )
  );
}

/** @typedef {{desktop_sha: string, sdk_sha: string, version: string}} BuildIdentity */
/** @param {{directory: string, repositoryRoot: string, kind: string, target?: string, identity: BuildIdentity, cacheKey?: string}} options */
export async function packBuildArtifacts({
  directory,
  repositoryRoot,
  kind,
  target = "",
  identity,
  cacheKey = "",
}) {
  const required = requiredPaths(kind, target);
  let files;
  if (kind === "frontend") {
    files = (
      await Promise.all(frontendPaths.map((prefix) => filesUnder(repositoryRoot, prefix)))
    ).flat();
  } else {
    const executable = required[0];
    const binaries = await readdir(path.join(repositoryRoot, path.posix.dirname(executable)));
    files = [
      executable,
      ...binaries
        .filter((name) => name.endsWith(".dll"))
        .map((name) => `${path.posix.dirname(executable)}/${name}`),
      ...(await filesUnder(repositoryRoot, "src-tauri/resources/node-runtime")),
      ...(await filesUnder(repositoryRoot, "src-tauri/resources/terminal-tools")),
    ];
  }
  for (const file of required)
    if (!files.includes(file)) throw new Error(`Missing build artifact: ${file}`);
  const descriptors = [];
  for (const file of files.sort()) {
    const source = path.join(repositoryRoot, file);
    const bytes = await readFile(source);
    const mode = (await lstat(source)).mode & 0o777;
    const destination = path.join(directory, "payload", file);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
    descriptors.push({ file, size: bytes.byteLength, sha256: digest(bytes), mode });
  }
  await writeFile(
    path.join(directory, "manifest.json"),
    `${JSON.stringify({ schema_version: 1, kind, target, ...identity, cache_key: cacheKey, files: descriptors }, null, 2)}\n`,
  );
}

/** @param {{directory: string, repositoryRoot: string, kind: string, target?: string, identity: BuildIdentity, cacheKey?: string, restore?: boolean, installed?: boolean}} options */
export async function verifyBuildArtifacts({
  directory,
  repositoryRoot,
  kind,
  target = "",
  identity,
  cacheKey,
  restore = false,
  installed = false,
}) {
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  if (
    manifest.schema_version !== 1 ||
    manifest.kind !== kind ||
    manifest.target !== target ||
    Object.entries(identity).some(([key, value]) => manifest[key] !== value) ||
    (cacheKey !== undefined && manifest.cache_key !== cacheKey)
  )
    throw new Error("Build artifact source identity mismatch");
  if (!Array.isArray(manifest.files) || manifest.files.length === 0)
    throw new Error("Empty build artifact manifest");
  const names = new Set();
  for (const descriptor of manifest.files) {
    if (
      typeof descriptor.file !== "string" ||
      !allowedPath(descriptor.file, kind, target) ||
      names.has(descriptor.file) ||
      !Number.isSafeInteger(descriptor.size) ||
      descriptor.size < 0 ||
      !/^[0-9a-f]{64}$/.test(descriptor.sha256) ||
      !Number.isInteger(descriptor.mode) ||
      descriptor.mode < 0 ||
      descriptor.mode > 0o777
    )
      throw new Error("Invalid build artifact descriptor");
    names.add(descriptor.file);
  }
  for (const file of requiredPaths(kind, target))
    if (!names.has(file)) throw new Error(`Missing build artifact: ${file}`);
  const actual = (await filesUnder(directory, "payload")).map((file) =>
    file.slice("payload/".length),
  );
  if (actual.length !== names.size || actual.some((file) => !names.has(file)))
    throw new Error("Unexpected build artifact files");
  // Validate every byte before installing any file.
  for (const descriptor of manifest.files) {
    const bytes = await readFile(path.join(directory, "payload", descriptor.file));
    if (bytes.byteLength !== descriptor.size || digest(bytes) !== descriptor.sha256)
      throw new Error(`Build artifact digest mismatch: ${descriptor.file}`);
    if (installed) {
      const workingBytes = await readFile(path.join(repositoryRoot, descriptor.file));
      if (digest(workingBytes) !== descriptor.sha256)
        throw new Error(`Installed build artifact digest mismatch: ${descriptor.file}`);
    }
  }
  if (restore)
    for (const descriptor of manifest.files) {
      const destination = path.join(repositoryRoot, descriptor.file);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(path.join(directory, "payload", descriptor.file), destination);
      if (process.platform !== "win32") await chmod(destination, descriptor.mode);
    }
  return manifest;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const option = (/** @type {string} */ name) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  let identity = buildSourceIdentity();
  if (process.env.OPENAGENT_COMPONENT_PLAN) {
    const plan = JSON.parse(
      await readFile(path.resolve(process.env.OPENAGENT_COMPONENT_PLAN), "utf8"),
    );
    const component = command?.startsWith("shell-") ? "shell" : "frontend";
    if (plan.schema_version !== 1 || plan.source_sha !== identity.desktop_sha)
      throw new Error("Component plan source mismatch");
    identity = plan.components[component].identity;
  }
  if (command === "key") {
    const bunVersion = execFileSync("bun", ["--version"], { encoding: "utf8" }).trim();
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    if (manifest.packageManager !== `bun@${bunVersion}`)
      throw new Error("Bun version does not match the pinned package manager");
    console.log(
      `key=frontend-v1-${digest(JSON.stringify({ ...identity, node: process.version, bun: bunVersion }))}`,
    );
    return;
  }
  const [kind, operation] = (command ?? "").split("-");
  const directory = option("--directory");
  if (!directory || !["pack", "restore", "verify"].includes(operation))
    throw new Error(
      "Usage: release-build-artifacts.mjs <frontend|shell>-<pack|restore|verify> --directory <path> [--target <target>] [--cache-key <key>]",
    );
  const options = {
    directory,
    repositoryRoot: root,
    kind,
    target: option("--target") ?? "",
    identity,
    cacheKey: args.includes("--cache-key") ? option("--cache-key") : undefined,
  };
  if (operation === "pack") await packBuildArtifacts(options);
  else
    await verifyBuildArtifacts({
      ...options,
      restore: operation === "restore",
      installed: args.includes("--installed"),
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
