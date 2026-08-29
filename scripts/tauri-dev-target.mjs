import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

/**
 * @param {string} value
 * @param {NodeJS.Platform} platform
 * @returns {string}
 */
function normalizeIdentityPath(value, platform) {
  const normalized = path.resolve(value);
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

/**
 * @param {string} value
 * @returns {string}
 */
function safeDirectoryName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "openagent";
}

/**
 * @param {{
 *   environment?: NodeJS.ProcessEnv;
 *   platform?: NodeJS.Platform;
 *   homeDirectory?: string;
 * }} [options]
 * @returns {string}
 */
export function defaultTauriDevTargetRoot({
  environment = process.env,
  platform = process.platform,
  homeDirectory = os.homedir(),
} = {}) {
  if (environment.OPENAGENT_DEV_TARGET_ROOT) {
    return path.resolve(environment.OPENAGENT_DEV_TARGET_ROOT);
  }
  if (platform === "win32" && environment.LOCALAPPDATA) {
    return path.join(environment.LOCALAPPDATA, "OpenAgent", "dev-targets");
  }
  if (platform === "darwin") {
    return path.join(homeDirectory, "Library", "Caches", "OpenAgent", "dev-targets");
  }
  return path.join(
    environment.XDG_CACHE_HOME ?? path.join(homeDirectory, ".cache"),
    "openagent",
    "dev-targets",
  );
}

/**
 * Derives a stable Cargo target directory for one worktree and durable-data fixture.
 * Routine runs reuse their incremental cache, while another worktree or an explicit
 * OPENAGENT_HOME fixture cannot lock the same desktop executable on Windows.
 *
 * @param {string} repositoryRoot
 * @param {{
 *   environment?: NodeJS.ProcessEnv;
 *   platform?: NodeJS.Platform;
 *   homeDirectory?: string;
 * }} [options]
 * @returns {string}
 */
export function resolveTauriDevTargetDirectory(
  repositoryRoot,
  { environment = process.env, platform = process.platform, homeDirectory = os.homedir() } = {},
) {
  const repositoryIdentity = normalizeIdentityPath(repositoryRoot, platform);
  const homeIdentity = environment.OPENAGENT_HOME
    ? normalizeIdentityPath(environment.OPENAGENT_HOME, platform)
    : "default-openagent-home";
  const digest = createHash("sha256")
    .update(`${repositoryIdentity}\0${homeIdentity}`)
    .digest("hex")
    .slice(0, 16);
  const worktreeName = safeDirectoryName(path.basename(repositoryIdentity));
  return path.join(
    defaultTauriDevTargetRoot({ environment, platform, homeDirectory }),
    `${worktreeName}-${digest}`,
  );
}

/**
 * Adds Cargo's target directory to the Tauri runner arguments. It belongs after
 * the Tauri CLI delimiter and before the optional application-argument delimiter.
 *
 * @param {string[]} arguments_
 * @param {string} targetDirectory
 * @returns {string[]}
 */
export function addCargoTargetDirectoryArgument(arguments_, targetDirectory) {
  const runnerDelimiter = arguments_.indexOf("--");
  if (runnerDelimiter !== -1) {
    const runnerArguments = arguments_.slice(runnerDelimiter + 1);
    const applicationDelimiter = runnerArguments.indexOf("--");
    const cargoArguments =
      applicationDelimiter === -1
        ? runnerArguments
        : runnerArguments.slice(0, applicationDelimiter);
    if (
      cargoArguments.some(
        (argument) => argument === "--target-dir" || argument.startsWith("--target-dir="),
      )
    ) {
      return [...arguments_];
    }
    return [
      ...arguments_.slice(0, runnerDelimiter + 1),
      "--target-dir",
      targetDirectory,
      ...runnerArguments,
    ];
  }
  return [...arguments_, "--", "--target-dir", targetDirectory];
}
