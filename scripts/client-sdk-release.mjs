// @ts-check
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireArtifact, verifyArtifactBytes, verifySignedBytes } from "./signed-artifacts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const digest = (/** @type {string | Uint8Array} */ bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const json = async (/** @type {string} */ path) => JSON.parse(await readFile(path, "utf8"));

/** Strip desktop installation identity while retaining every execution/helper byte identity.
 * @param {Record<string, any>} manifest
 */
export function standaloneRuntimeManifest(manifest) {
  const version = manifest.version?.split("+")[0];
  if (
    manifest.schema_version !== 1 ||
    !/^\d+\.\d+\.\d+$/.test(version ?? "") ||
    !/^[0-9a-f]{40}$/.test(manifest.sdk_sha ?? "") ||
    !Number.isInteger(manifest.protocol?.min) ||
    !Number.isInteger(manifest.protocol?.max) ||
    manifest.protocol.min < 1 ||
    manifest.protocol.min > manifest.protocol.max
  )
    throw new Error("Invalid qualified Runtime manifest");
  const standalone = { ...manifest, version };
  delete standalone.release_version;
  return standalone;
}

/** @param {string} directory @returns {Promise<string[]>} */
async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? sourceFiles(join(directory, entry.name))
        : [join(directory, entry.name)],
    ),
  );
  return paths.flat().sort();
}

/** A registry read failure must not look like a never-published package.
 * @param {string} name
 */
export async function readNpmPackage(name) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404) return { versions: {} };
  if (!response.ok) throw new Error(`npm registry lookup failed: HTTP ${response.status}`);
  return response.json();
}

/** @param {string} version */
function core(version) {
  return version.split("-")[0].split(".").map(Number);
}
/** @param {string} a @param {string} b */
function compareCore(a, b) {
  const x = core(a),
    y = core(b);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/** Independent SDK ordering; reuse identical source/kit within the requested channel.
 * @param {{baseVersion: string; channel: string; fingerprint: string; versions: Record<string, any>}} options
 */
export function planClientVersion({ baseVersion, channel, fingerprint, versions }) {
  if (!/^\d+\.\d+\.\d+$/.test(baseVersion) || !["beta", "rc", "stable"].includes(channel))
    throw new Error("Invalid Client SDK release channel/version");
  const published = Object.entries(versions).filter(([version]) =>
    /^\d+\.\d+\.\d+(?:-(?:beta|rc)\.\d+)?$/.test(version),
  );
  const matching = published
    .filter(
      ([version, metadata]) =>
        metadata.openagent?.fingerprint === fingerprint &&
        (channel === "stable" ? !version.includes("-") : version.includes(`-${channel}.`)) &&
        compareCore(version, baseVersion) >= 0,
    )
    .sort(
      ([a], [b]) => compareCore(b, a) || Number(b.split(".").at(-1)) - Number(a.split(".").at(-1)),
    );
  if (matching.length) return { version: matching[0][0], reuse: true };
  let base = baseVersion;
  for (const [version] of published)
    if (compareCore(version, base) > 0) base = version.split("-")[0];
  if (versions[base]) {
    const [major, minor, patch] = core(base);
    base = `${major}.${minor}.${patch + 1}`;
  }
  if (channel === "stable") return { version: base, reuse: false };
  const prefix = `${base}-${channel}.`;
  const sequence =
    Math.max(
      0,
      ...published
        .filter(([v]) => v.startsWith(prefix))
        .map(([v]) => Number(v.slice(prefix.length))),
    ) + 1;
  return { version: `${prefix}${sequence}`, reuse: false };
}

/** Build a candidate from qualified Runtime bytes without publishing anything.
 * @param {{runtimeDirectory: string; outputDirectory: string; channel: string; repository?: string; repositoryRoot?: string; registry?: any; publicKey?: string}} options
 */
export async function prepareClientRelease({
  runtimeDirectory,
  outputDirectory,
  channel,
  repository = "BANG404/openagent",
  repositoryRoot = root,
  registry,
  publicKey,
}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("Invalid public release repository");
  const bytes = await readFile(join(runtimeDirectory, "openagent-sdk-manifest.json"));
  verifySignedBytes(
    bytes,
    await readFile(join(runtimeDirectory, "openagent-sdk-manifest.json.sig"), "utf8"),
    publicKey,
  );
  const manifest = standaloneRuntimeManifest(JSON.parse(bytes.toString()));
  for (const target of ["linux-x64", "windows-x64", "macos-arm64", "macos-x64"])
    requireArtifact(manifest.artifacts?.[target]);
  for (const [target, names] of Object.entries({
    "linux-x64": ["codex-bwrap-linux-x64"],
    "windows-x64": ["codex-command-runner.exe", "codex-windows-sandbox-setup.exe"],
  })) {
    for (const name of names) {
      if (requireArtifact(manifest.helpers?.[target]?.[name]).file !== name)
        throw new Error("Runtime helper filename mismatch");
    }
  }
  const protocolSource = await readFile(
    join(repositoryRoot, "crates/openagent-protocol/src/lib.rs"),
    "utf8",
  );
  const protocol = Number(/pub const SDK_PROTOCOL_VERSION: u32 = (\d+);/.exec(protocolSource)?.[1]);
  if (!protocol || protocol < manifest.protocol.min || protocol > manifest.protocol.max)
    throw new Error("Client SDK and Runtime protocol mismatch");
  const runtimeBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const manifestSha256 = digest(runtimeBytes);
  const tag = `runtime-v${manifest.version}-${manifestSha256.slice(0, 16)}`;
  const runtime = {
    version: manifest.version,
    sdkSha: manifest.sdk_sha,
    protocol,
    manifestSha256,
    manifestUrl: `https://github.com/${repository}/releases/download/${tag}/openagent-sdk-manifest.json`,
  };
  const runtimeOutput = join(outputDirectory, "runtime");
  await mkdir(runtimeOutput, { recursive: true });
  for (const artifact of [
    ...Object.values(manifest.artifacts),
    ...Object.values(manifest.helpers ?? {}).flatMap((helpers) => Object.values(helpers)),
  ]) {
    const descriptor = requireArtifact(artifact);
    verifyArtifactBytes(await readFile(join(runtimeDirectory, descriptor.file)), descriptor);
    await cp(join(runtimeDirectory, descriptor.file), join(runtimeOutput, descriptor.file));
  }
  await writeFile(join(runtimeOutput, "openagent-sdk-manifest.json"), runtimeBytes);
  const sdk = join(repositoryRoot, "sdk/typescript");
  const sourceManifest = await json(join(sdk, "package.json"));
  const hash = createHash("sha256")
    .update(JSON.stringify(runtime))
    .update(process.versions.bun ?? "")
    .update(await readFile(join(repositoryRoot, "scripts/client-sdk-release.mjs")));
  for (const path of [
    ...(await sourceFiles(join(sdk, "src"))),
    ...[
      "package.json",
      "README.md",
      "LICENSE",
      "tsconfig.json",
      "tsconfig.build.json",
      "bun.lock",
    ].map((name) => join(sdk, name)),
  ]) {
    hash.update(path.slice(sdk.length).replaceAll("\\", "/")).update(await readFile(path));
  }
  const fingerprint = hash.digest("hex");
  const state = registry ?? (await readNpmPackage(sourceManifest.name));
  const plan = planClientVersion({
    baseVersion: sourceManifest.version,
    channel,
    fingerprint,
    versions: state.versions ?? {},
  });
  const result = {
    schema_version: 1,
    name: sourceManifest.name,
    ...plan,
    channel,
    fingerprint,
    runtimeTag: tag,
    runtime,
  };
  const packageDirectory = join(outputDirectory, "package");
  await rm(join(packageDirectory, "dist"), { recursive: true, force: true });
  await mkdir(packageDirectory, { recursive: true });
  // Bun runs the compiler, but the emitted public artifact must run under ordinary Node ESM.
  execFileSync(
    process.execPath,
    [
      createRequire(join(sdk, "package.json")).resolve("typescript/bin/tsc"),
      "-p",
      join(sdk, "tsconfig.build.json"),
      "--outDir",
      resolve(packageDirectory, "dist"),
    ],
    { cwd: sdk, stdio: "inherit" },
  );
  for (const name of ["README.md", "LICENSE"])
    await cp(join(sdk, name), join(packageDirectory, name), { recursive: true });
  const publishedManifest = {
    ...sourceManifest,
    version: plan.version,
    openagent: { fingerprint, runtime },
  };
  delete publishedManifest.scripts;
  delete publishedManifest.devDependencies;
  await writeFile(
    join(packageDirectory, "package.json"),
    `${JSON.stringify(publishedManifest, null, 2)}\n`,
  );
  await writeFile(
    join(packageDirectory, "dist/runtimeRelease.js"),
    `export const runtimeRelease = ${JSON.stringify(runtime)};\n`,
  );
  execFileSync(
    process.execPath,
    ["pm", "pack", "--filename", resolve(outputDirectory, "openagent-sdk.tgz")],
    { cwd: packageDirectory, stdio: "inherit" },
  );
  const candidate = {
    ...result,
    tarballSha256: digest(await readFile(join(outputDirectory, "openagent-sdk.tgz"))),
  };
  await writeFile(join(outputDirectory, "release.json"), `${JSON.stringify(candidate, null, 2)}\n`);
  return candidate;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (/** @type {string} */ name) => args[args.indexOf(name) + 1];
  if (!args.includes("--runtime") || !args.includes("--output") || !args.includes("--channel"))
    throw new Error(
      "Usage: client-sdk-release.mjs --runtime <qualified-directory> --output <candidate> --channel <beta|rc|stable>",
    );
  await prepareClientRelease({
    runtimeDirectory: resolve(value("--runtime")),
    outputDirectory: resolve(value("--output")),
    channel: value("--channel"),
  });
}
