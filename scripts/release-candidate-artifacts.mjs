import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const TARGETS = new Set(["macos-arm64", "macos-x64", "linux-x64", "windows-x64"]);

/** @param {string} file */
async function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/** @param {string} directory @returns {Promise<string[]>} */
async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(absolute) : [absolute];
    }),
  );
  return nested.flat();
}

/** @param {string} target */
function requireTarget(target) {
  if (!TARGETS.has(target)) throw new Error(`Unsupported release target: ${target}`);
}

/** @param {string[]} names @param {RegExp} pattern @param {string} label */
function requireOne(names, pattern, label) {
  const matches = names.filter((name) => pattern.test(name));
  if (matches.length !== 1) {
    throw new Error(`Expected one ${label}, found ${matches.length}: ${matches.join(", ")}`);
  }
  return matches[0];
}

/** @param {string} target @param {string[]} names @param {boolean} includeFull */
function validateAssetNames(target, names, includeFull) {
  requireTarget(target);
  if (target.startsWith("macos-")) {
    requireOne(names, /(?<!-full)\.dmg$/, "lightweight DMG");
    requireOne(names, /\.app\.tar\.gz$/, "macOS updater archive");
    requireOne(names, /\.app\.tar\.gz\.sig$/, "macOS updater signature");
    if (includeFull) requireOne(names, /-full\.dmg$/, "full DMG");
    return;
  }
  if (target === "linux-x64") {
    requireOne(names, /(?<!-full)\.AppImage$/, "lightweight AppImage");
    requireOne(names, /(?<!-full)\.AppImage\.sig$/, "AppImage updater signature");
    requireOne(names, /\.deb$/, "Debian package");
    requireOne(names, /\.deb\.sig$/, "Debian package signature");
    requireOne(names, /\.rpm$/, "RPM package");
    requireOne(names, /\.rpm\.sig$/, "RPM package signature");
    if (includeFull) requireOne(names, /-full\.AppImage$/, "full AppImage");
    return;
  }
  requireOne(names, /(?<!-full)-setup\.exe$/, "lightweight NSIS installer");
  requireOne(names, /(?<!-full)-setup\.exe\.sig$/, "NSIS updater signature");
  if (includeFull) requireOne(names, /-full-setup\.exe$/, "full NSIS installer");
}

/**
 * @param {{ artifactPaths: string[], outputDirectory: string, target: string }} options
 */
export async function stageTauriArtifacts({ artifactPaths, outputDirectory, target }) {
  requireTarget(target);
  const files = [];
  for (const artifact of artifactPaths) {
    const info = await stat(artifact);
    if (info.isFile()) files.push(artifact);
  }
  const selected = files.filter((file) => {
    const name = path.basename(file);
    if (target.startsWith("macos-")) {
      return (
        name.endsWith(".dmg") || name.endsWith(".app.tar.gz") || name.endsWith(".app.tar.gz.sig")
      );
    }
    if (target === "linux-x64") {
      return [".AppImage", ".AppImage.sig", ".deb", ".deb.sig", ".rpm", ".rpm.sig"].some((suffix) =>
        name.endsWith(suffix),
      );
    }
    return name.endsWith("-setup.exe") || name.endsWith("-setup.exe.sig");
  });
  const names = selected.map((file) => path.basename(file));
  if (new Set(names).size !== names.length) {
    throw new Error(`Duplicate Tauri release asset names for ${target}: ${names.join(", ")}`);
  }
  validateAssetNames(target, names, false);
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    selected.map((file) => copyFile(file, path.join(outputDirectory, path.basename(file)))),
  );
  return names.sort();
}

/**
 * @param {{ bundleRoot: string, outputDirectory: string, target: string, version: string }} options
 */
export async function stageFullInstaller({ bundleRoot, outputDirectory, target, version }) {
  requireTarget(target);
  const directory =
    target === "windows-x64" ? "nsis" : target.startsWith("macos-") ? "dmg" : "appimage";
  const extension =
    target === "windows-x64" ? ".exe" : target.startsWith("macos-") ? ".dmg" : ".AppImage";
  const candidates = (await collectFiles(bundleRoot)).filter(
    (file) =>
      path.basename(file).includes(version) &&
      path.basename(path.dirname(file)) === directory &&
      file.endsWith(extension),
  );
  if (candidates.length !== 1) {
    throw new Error(
      `Expected one ${directory} ${extension} full installer, found ${candidates.length}: ${candidates.join(", ")}`,
    );
  }
  const sourceName = path.basename(candidates[0]);
  const outputName =
    target === "windows-x64" && sourceName.endsWith("-setup.exe")
      ? sourceName.replace(/-setup\.exe$/, "-full-setup.exe")
      : `${sourceName.slice(0, -extension.length)}-full${extension}`;
  await mkdir(outputDirectory, { recursive: true });
  await copyFile(candidates[0], path.join(outputDirectory, outputName));
  return outputName;
}

/**
 * @param {{ outputDirectory: string, target: string, desktopSha: string, sdkSha: string }} options
 */
export async function writeCandidateManifest({ outputDirectory, target, desktopSha, sdkSha }) {
  requireTarget(target);
  const files = (await collectFiles(outputDirectory)).filter(
    (file) =>
      !path.basename(file).startsWith("candidate-") && path.basename(file) !== "latest.json",
  );
  const names = files.map((file) => path.basename(file));
  validateAssetNames(target, names, true);
  const assets = await Promise.all(
    files.map(async (file) => ({
      name: path.basename(file),
      size: (await stat(file)).size,
      sha256: await sha256(file),
    })),
  );
  assets.sort((left, right) => left.name.localeCompare(right.name));
  const manifest = { schema_version: 1, desktop_sha: desktopSha, sdk_sha: sdkSha, target, assets };
  await writeFile(
    path.join(outputDirectory, `candidate-${target}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

/** @param {string} directory */
async function filesByName(directory) {
  const entries = new Map();
  for (const file of await collectFiles(directory)) {
    const name = path.basename(file);
    if (entries.has(name)) throw new Error(`Duplicate candidate file name: ${name}`);
    entries.set(name, file);
  }
  return entries;
}

/**
 * @param {{ candidateDirectory: string, expectedTargets: string[], desktopSha: string, sdkSha: string }} options
 */
export async function verifyCandidateSet({
  candidateDirectory,
  expectedTargets,
  desktopSha,
  sdkSha,
}) {
  expectedTargets.forEach(requireTarget);
  const entries = await filesByName(candidateDirectory);
  const manifestNames = [...entries.keys()].filter((name) => /^candidate-.+\.json$/.test(name));
  const expectedManifestNames = expectedTargets.map((target) => `candidate-${target}.json`).sort();
  if (manifestNames.sort().join("\n") !== expectedManifestNames.join("\n")) {
    throw new Error(
      `Candidate manifests do not match expected targets. Expected ${expectedManifestNames.join(", ")}; found ${manifestNames.join(", ")}`,
    );
  }

  const declaredAssets = new Set();
  for (const target of expectedTargets) {
    const manifestPath = entries.get(`candidate-${target}.json`);
    if (!manifestPath) throw new Error(`Missing candidate manifest for ${target}`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (
      manifest.schema_version !== 1 ||
      manifest.target !== target ||
      manifest.desktop_sha !== desktopSha ||
      manifest.sdk_sha !== sdkSha ||
      !Array.isArray(manifest.assets)
    ) {
      throw new Error(`Candidate manifest identity mismatch for ${target}`);
    }
    const names = manifest.assets.map((asset) => asset.name);
    validateAssetNames(target, names, true);
    for (const asset of manifest.assets) {
      if (declaredAssets.has(asset.name))
        throw new Error(`Candidate asset declared twice: ${asset.name}`);
      declaredAssets.add(asset.name);
      const file = entries.get(asset.name);
      if (!file) throw new Error(`Candidate asset is missing: ${asset.name}`);
      const info = await stat(file);
      if (info.size !== asset.size || (await sha256(file)) !== asset.sha256) {
        throw new Error(`Candidate asset integrity mismatch: ${asset.name}`);
      }
    }
  }

  const unexpected = [...entries.keys()].filter(
    (name) => !manifestNames.includes(name) && !declaredAssets.has(name),
  );
  if (unexpected.length > 0)
    throw new Error(`Unexpected candidate files: ${unexpected.join(", ")}`);
  return [...declaredAssets].sort();
}

/**
 * @param {{ candidateDirectory: string, expectedTargets: string[], releaseTag: string, repository: string, version: string, notes: string, pubDate?: string }} options
 */
export async function createUpdaterManifest({
  candidateDirectory,
  expectedTargets,
  releaseTag,
  repository,
  version,
  notes,
  pubDate = new Date().toISOString(),
}) {
  const entries = await filesByName(candidateDirectory);
  /** @type {Record<string, { signature: string, url: string }>} */
  const platforms = {};
  const assetUrl = (name) =>
    `https://github.com/${repository}/releases/download/${releaseTag}/${name}`;

  const add = async (target, keys, signaturePattern, bundlePattern) => {
    const manifestPath = entries.get(`candidate-${target}.json`);
    if (!manifestPath) throw new Error(`Missing candidate manifest for ${target}`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const names = manifest.assets.map((asset) => asset.name);
    const signatureName = requireOne(names, signaturePattern, `${target} updater signature`);
    const bundleName = requireOne(names, bundlePattern, `${target} updater bundle`);
    const signaturePath = entries.get(signatureName);
    if (!signaturePath) throw new Error(`Missing updater signature file: ${signatureName}`);
    const value = { signature: await readFile(signaturePath, "utf8"), url: assetUrl(bundleName) };
    for (const key of keys) platforms[key] = value;
  };

  if (expectedTargets.includes("macos-x64")) {
    await add(
      "macos-x64",
      ["darwin-x86_64", "darwin-x86_64-app"],
      /\.app\.tar\.gz\.sig$/,
      /\.app\.tar\.gz$/,
    );
  }
  if (expectedTargets.includes("linux-x64")) {
    await add(
      "linux-x64",
      ["linux-x86_64", "linux-x86_64-appimage"],
      /(?<!-full)\.AppImage\.sig$/,
      /(?<!-full)\.AppImage$/,
    );
    await add("linux-x64", ["linux-x86_64-deb"], /\.deb\.sig$/, /\.deb$/);
    await add("linux-x64", ["linux-x86_64-rpm"], /\.rpm\.sig$/, /\.rpm$/);
  }
  if (expectedTargets.includes("windows-x64")) {
    await add(
      "windows-x64",
      ["windows-x86_64", "windows-x86_64-nsis"],
      /(?<!-full)-setup\.exe\.sig$/,
      /(?<!-full)-setup\.exe$/,
    );
  }
  if (expectedTargets.includes("macos-arm64")) {
    await add(
      "macos-arm64",
      ["darwin-aarch64", "darwin-aarch64-app"],
      /\.app\.tar\.gz\.sig$/,
      /\.app\.tar\.gz$/,
    );
  }

  return { version, notes, pub_date: pubDate, platforms };
}

/**
 * @param {{ candidateDirectory: string, outputDirectory: string, expectedTargets: string[], desktopSha: string, sdkSha: string, releaseTag: string, repository: string, version: string, notes: string }} options
 */
export async function prepareNativePublication(options) {
  const assetNames = await verifyCandidateSet(options);
  const updater = await createUpdaterManifest(options);
  const entries = await filesByName(options.candidateDirectory);
  await mkdir(options.outputDirectory, { recursive: true });
  await Promise.all(
    assetNames.map((name) => copyFile(entries.get(name), path.join(options.outputDirectory, name))),
  );
  await writeFile(
    path.join(options.outputDirectory, "latest.json"),
    `${JSON.stringify(updater, null, 2)}\n`,
  );
  return updater;
}

/** @param {string[]} args @param {string} name */
function option(args, name) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : "";
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "stage-tauri") {
    const raw = process.env.TAURI_ARTIFACT_PATHS;
    if (!raw) throw new Error("TAURI_ARTIFACT_PATHS is required");
    await stageTauriArtifacts({
      artifactPaths: JSON.parse(raw),
      outputDirectory: path.resolve(option(args, "--output")),
      target: option(args, "--target"),
    });
  } else if (command === "stage-full") {
    await stageFullInstaller({
      bundleRoot: path.resolve(option(args, "--bundle-root")),
      outputDirectory: path.resolve(option(args, "--output")),
      target: option(args, "--target"),
      version: option(args, "--version"),
    });
  } else if (command === "manifest") {
    await writeCandidateManifest({
      outputDirectory: path.resolve(option(args, "--output")),
      target: option(args, "--target"),
      desktopSha: option(args, "--desktop-sha"),
      sdkSha: option(args, "--sdk-sha"),
    });
  } else if (command === "publish") {
    await prepareNativePublication({
      candidateDirectory: path.resolve(option(args, "--candidates")),
      outputDirectory: path.resolve(option(args, "--output")),
      expectedTargets: option(args, "--targets").split(","),
      desktopSha: option(args, "--desktop-sha"),
      sdkSha: option(args, "--sdk-sha"),
      releaseTag: option(args, "--tag"),
      repository: option(args, "--repository"),
      version: option(args, "--version"),
      notes: option(args, "--notes"),
    });
  } else {
    throw new Error(`Unknown release candidate command: ${command ?? ""}`);
  }
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
