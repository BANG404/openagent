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

export const CUA_DRIVER_VERSION = "0.30.1";
const releaseTag = `cua-driver-rs-v${CUA_DRIVER_VERSION}`;
const releaseRoot = `https://github.com/trycua/cua/releases/download/${releaseTag}`;

const releaseAssets = {
  "aarch64-apple-darwin": {
    name: `cua-driver-rs-${CUA_DRIVER_VERSION}-darwin-arm64.tar.gz`,
    sha256: "5dabcd3fd2bd66eee0f1acf046735830ea61f66c8935175ef454a54d01ecd0f0",
  },
  "x86_64-apple-darwin": {
    name: `cua-driver-rs-${CUA_DRIVER_VERSION}-darwin-x86_64.tar.gz`,
    sha256: "7bc12e21e00e2d78d480a985f6793d9238f9ee3a29176a39b9bd13fe0da2d6c3",
  },
  "aarch64-unknown-linux-gnu": {
    name: `cua-driver-rs-${CUA_DRIVER_VERSION}-linux-arm64-binary.tar.gz`,
    sha256: "4dd8c42aaad592b8bd5ab825b5cd576bb2569e3ef14a99f63b445637dd8a0d2d",
  },
  "x86_64-unknown-linux-gnu": {
    name: `cua-driver-rs-${CUA_DRIVER_VERSION}-linux-x86_64-binary.tar.gz`,
    sha256: "82411700ae43fa34f6263eb603866c77d4e25e5556ffa03d92cd79cbab9472a2",
  },
  "aarch64-pc-windows-msvc": {
    name: `cua-driver-rs-${CUA_DRIVER_VERSION}-windows-arm64-binary.zip`,
    sha256: "d82a6c1523e909dbffdf28a41a6be64de31874b6f671c8cb344d857553708a85",
  },
  "x86_64-pc-windows-msvc": {
    name: `cua-driver-rs-${CUA_DRIVER_VERSION}-windows-x86_64-binary.zip`,
    sha256: "96ebb5996c0e25adf40ed648a46959723d31df5d90f24ffe2fb2d3cc2ee780be",
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
  const host = /^host:\s+([^\s]+)$/m.exec(result.stdout)?.[1];
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
