import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");

export const CUA_DRIVER_VERSION = "0.28.2";
const releaseTag = `cua-driver-rs-v${CUA_DRIVER_VERSION}`;
const releaseRoot = `https://github.com/trycua/cua/releases/download/${releaseTag}`;

const releaseAssets = {
  "aarch64-apple-darwin": {
    name: `cua-driver-rs-${CUA_DRIVER_VERSION}-darwin-arm64.tar.gz`,
    sha256: "818ddefa0fa8ba2ec9cba837c7aa634a4b064221c748752cf49c5b08e2c94e8c",
  },
  "x86_64-apple-darwin": {
    name: `cua-driver-rs-${CUA_DRIVER_VERSION}-darwin-x86_64.tar.gz`,
    sha256: "9e00cc92480a8f3d32bbcb7cb45cbc42293b7bd13c1808f5047f1f73a8b64f24",
  },
  "aarch64-unknown-linux-gnu": {
    name: `cua-driver-rs-${CUA_DRIVER_VERSION}-linux-arm64-binary.tar.gz`,
    sha256: "55e8a32839a4ac369a773df4dac87b345bd4567779221ade4a5e39223a45a2e8",
  },
  "x86_64-unknown-linux-gnu": {
    name: `cua-driver-rs-${CUA_DRIVER_VERSION}-linux-x86_64-binary.tar.gz`,
    sha256: "a1d99fd04bb4927ef5ffdbe60eb91ed8b51a2bab60e10fc604a75bd59ce69c3e",
  },
  "aarch64-pc-windows-msvc": {
    name: `cua-driver-rs-${CUA_DRIVER_VERSION}-windows-arm64-binary.zip`,
    sha256: "578b88ff2dd56f06eb7e984d73aaf5e76f59c6fde9542c967d6a30d00213c680",
  },
  "x86_64-pc-windows-msvc": {
    name: `cua-driver-rs-${CUA_DRIVER_VERSION}-windows-x86_64-binary.zip`,
    sha256: "1f4bfceeab64cb7f56be7aad774c3dc2d2910d1427e4be1d79939c706e8029ba",
  },
};

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function rustHost() {
  const result = spawnSync(process.env.RUSTC ?? "rustc", ["-vV"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("rustc -vV failed while resolving the Cua target");
  const host = result.stdout.match(/^host:\s+([^\s]+)$/m)?.[1];
  if (!host) throw new Error("rustc -vV did not report a host target");
  return host;
}

export function tauriTarget(platform, architecture) {
  const targets = {
    "linux/aarch64": "aarch64-unknown-linux-gnu",
    "linux/x86_64": "x86_64-unknown-linux-gnu",
    "macos/aarch64": "aarch64-apple-darwin",
    "macos/x86_64": "x86_64-apple-darwin",
    "windows/aarch64": "aarch64-pc-windows-msvc",
    "windows/x86_64": "x86_64-pc-windows-msvc",
  };
  return targets[`${platform ?? ""}/${architecture ?? ""}`];
}

export function cuaDriverAsset(targetTriple) {
  const asset = releaseAssets[targetTriple];
  if (!asset) throw new Error(`Cua Driver has no pinned release asset for ${targetTriple}.`);
  return {
    ...asset,
    targetTriple,
    url: `${releaseRoot}/${asset.name}`,
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function existingResourceMatches(destination, asset) {
  const marker = await readFile(path.join(destination, "openagent-resource.json"), "utf8").catch(
    () => null,
  );
  if (!marker) return false;
  try {
    const metadata = JSON.parse(marker);
    const binary = path.join(
      destination,
      asset.targetTriple.includes("windows") ? "cua-driver.exe" : "cua-driver",
    );
    return (
      metadata.version === CUA_DRIVER_VERSION &&
      metadata.asset === asset.name &&
      metadata.sha256 === asset.sha256 &&
      (await stat(binary)).isFile()
    );
  } catch {
    return false;
  }
}

async function downloadAsset(asset, archivePath) {
  const response = await fetch(asset.url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Cua Driver download failed with HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = sha256(bytes);
  if (digest !== asset.sha256) {
    throw new Error(`Cua Driver checksum mismatch: expected ${asset.sha256}, received ${digest}`);
  }
  await writeFile(archivePath, bytes);
}

async function findFile(directory, filename) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === filename) return candidate;
    if (entry.isDirectory()) {
      const match = await findFile(candidate, filename);
      if (match) return match;
    }
  }
  return null;
}

export async function prepareCuaDriver({ repositoryRoot = root, targetTriple } = {}) {
  const resolvedTarget =
    targetTriple ??
    process.env.OPENAGENT_CUA_DRIVER_TARGET ??
    process.env.OPENAGENT_RUNTIME_TARGET ??
    tauriTarget(process.env.TAURI_ENV_PLATFORM, process.env.TAURI_ENV_ARCH) ??
    rustHost();
  const asset = cuaDriverAsset(resolvedTarget);
  const resourceDirectory = path.join(repositoryRoot, "src-tauri", "resources");
  const destination = path.join(resourceDirectory, "cua-driver");
  if (await existingResourceMatches(destination, asset)) {
    console.log(`Reused Cua Driver ${CUA_DRIVER_VERSION} for ${resolvedTarget}.`);
    return { ...asset, destination, changed: false };
  }

  await mkdir(resourceDirectory, { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(resourceDirectory, ".cua-driver-"));
  const archivePath = path.join(temporaryRoot, asset.name);
  const extracted = path.join(temporaryRoot, "extracted");
  try {
    await mkdir(extracted, { recursive: true });
    await downloadAsset(asset, archivePath);
    if (asset.name.endsWith(".zip") && process.platform !== "win32") {
      run("unzip", ["-q", archivePath, "-d", extracted]);
    } else {
      run("tar", ["-xf", archivePath, "-C", extracted]);
    }

    const binaryName = resolvedTarget.includes("windows") ? "cua-driver.exe" : "cua-driver";
    const binary = await findFile(extracted, binaryName);
    if (!binary) {
      throw new Error(`Cua Driver release asset does not contain ${binaryName}`);
    }
    const bundleRoot = path.dirname(binary);
    if (!resolvedTarget.includes("windows")) await chmod(binary, 0o755);

    await rm(destination, { recursive: true, force: true });
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(
      path.join(bundleRoot, "openagent-resource.json"),
      `${JSON.stringify(
        {
          repository: "https://github.com/trycua/cua",
          version: CUA_DRIVER_VERSION,
          target: resolvedTarget,
          asset: asset.name,
          sha256: asset.sha256,
        },
        null,
        2,
      )}\n`,
    );
    await rename(bundleRoot, destination);
    console.log(`Prepared Cua Driver ${CUA_DRIVER_VERSION} for ${resolvedTarget}.`);
    return { ...asset, destination, changed: true };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath)) {
  await prepareCuaDriver({ targetTriple: argument("--target", undefined) });
}
