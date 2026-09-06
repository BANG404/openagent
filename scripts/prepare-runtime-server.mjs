import { chmod, mkdir, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { copyFileIfChanged } from "./copy-if-changed.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const supportedTargets = new Set([
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "x86_64-pc-windows-msvc",
  "x86_64-unknown-linux-gnu",
]);

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}\n${result.stderr ?? ""}`,
    );
  }
  return result.stdout ?? "";
}

export function parseRustHost(verboseVersion) {
  const host = verboseVersion.match(/^host:\s+([^\s]+)$/m)?.[1];
  if (!host) throw new Error("rustc -vV did not report a host target.");
  return host;
}

export function tauriTarget(platform, architecture) {
  const key = `${platform ?? ""}/${architecture ?? ""}`;
  const targets = {
    "linux/x86_64": "x86_64-unknown-linux-gnu",
    "macos/aarch64": "aarch64-apple-darwin",
    "macos/x86_64": "x86_64-apple-darwin",
    "windows/x86_64": "x86_64-pc-windows-msvc",
  };
  return targets[key];
}

export function runtimeServerPaths({ repositoryRoot, targetTriple, profile }) {
  if (!supportedTargets.has(targetTriple)) {
    throw new Error(`OpenAgent has no packaged runtime server for ${targetTriple}.`);
  }
  if (profile !== "dev" && profile !== "release") {
    throw new Error(`Unsupported Cargo profile: ${profile}`);
  }
  const profileDirectory = profile === "dev" ? "debug" : "release";
  const executable = targetTriple.includes("windows") ? "openagent-server.exe" : "openagent-server";
  const extension = targetTriple.includes("windows") ? ".exe" : "";
  return {
    source: path.join(repositoryRoot, "sdk", "target", targetTriple, profileDirectory, executable),
    destination: path.join(
      repositoryRoot,
      "src-tauri",
      "binaries",
      `openagent-server-${targetTriple}${extension}`,
    ),
  };
}

export async function requirePreparedRuntimeServer(paths) {
  const metadata = await stat(paths.destination).catch(() => null);
  if (!metadata?.isFile() || metadata.size === 0) {
    throw new Error(`Release-qualified Runtime sidecar is missing: ${paths.destination}`);
  }
  console.log(`Reused release-qualified Runtime server for ${paths.targetTriple}.`);
  return { ...paths, changed: false };
}

export async function prepareRuntimeServer({ profile = "dev", targetTriple } = {}) {
  const cargo = process.env.CARGO ?? "cargo";
  const resolvedTarget =
    targetTriple ??
    process.env.OPENAGENT_RUNTIME_TARGET ??
    tauriTarget(process.env.TAURI_ENV_PLATFORM, process.env.TAURI_ENV_ARCH) ??
    parseRustHost(run(process.env.RUSTC ?? "rustc", ["-vV"]));
  const paths = runtimeServerPaths({
    repositoryRoot: root,
    targetTriple: resolvedTarget,
    profile,
  });
  if (process.env.OPENAGENT_RUNTIME_SERVER_PREBUILT === "1") {
    return requirePreparedRuntimeServer({ ...paths, targetTriple: resolvedTarget });
  }
  const cargoArguments = [
    "build",
    "--locked",
    "--manifest-path",
    path.join("sdk", "Cargo.toml"),
    "-p",
    "openagent-server",
    "--target",
    resolvedTarget,
  ];
  if (profile === "release") cargoArguments.push("--release");
  run(cargo, cargoArguments, { stdio: "inherit" });
  await mkdir(path.dirname(paths.destination), { recursive: true });
  const changed = await copyFileIfChanged(paths.source, paths.destination);
  if (!resolvedTarget.includes("windows")) await chmod(paths.destination, 0o755);
  console.log(`${changed ? "Prepared" : "Reused"} fallback runtime server for ${resolvedTarget}.`);
  return { ...paths, targetTriple: resolvedTarget, changed };
}

export async function materializeRuntimeServerPlaceholder({
  repositoryRoot = root,
  targetTriple,
} = {}) {
  const resolvedTarget = targetTriple ?? parseRustHost(run(process.env.RUSTC ?? "rustc", ["-vV"]));
  const paths = runtimeServerPaths({
    repositoryRoot,
    targetTriple: resolvedTarget,
    profile: "dev",
  });
  await mkdir(path.dirname(paths.destination), { recursive: true });
  try {
    await writeFile(paths.destination, "", { flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  if (!resolvedTarget.includes("windows")) await chmod(paths.destination, 0o755);
  console.log(`Materialized Runtime server placeholder for ${resolvedTarget}.`);
  return { ...paths, targetTriple: resolvedTarget };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const options = { targetTriple: argument("--target", undefined) };
  if (process.argv.includes("--placeholder")) {
    await materializeRuntimeServerPlaceholder(options);
  } else {
    await prepareRuntimeServer({
      ...options,
      profile: argument("--profile", "dev"),
    });
  }
}
