import os from "node:os";
import path from "node:path";

const DEV_INSTANCE_FLAG = "--multi-instance";
export const DEFAULT_BLACKBOX_INSTANCE = "blackbox";

/** @param {string} value */
function trimHyphens(value) {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "-") start += 1;
  while (end > start && value[end - 1] === "-") end -= 1;
  return value.slice(start, end);
}

/**
 * @param {string} value
 * @returns {string}
 */
export function normalizeDevelopmentInstanceName(value) {
  const normalized = trimHyphens(value.trim().replace(/[^a-zA-Z0-9._-]/g, "-"));
  if (!normalized) {
    throw new Error("--multi-instance requires a non-empty instance name");
  }
  return normalized;
}

/**
 * @param {string[]} arguments_
 * @param {number} index
 * @param {string | undefined} instanceName
 */
function parseInstanceArgument(arguments_, index, instanceName) {
  const argument = arguments_[index];
  if (argument === DEV_INSTANCE_FLAG) {
    if (instanceName) throw new Error("--multi-instance may only be specified once");
    const value = arguments_[index + 1];
    if (!value || value.startsWith("-")) {
      throw new Error("--multi-instance requires a non-empty instance name");
    }
    return { handled: true, instanceName: normalizeDevelopmentInstanceName(value), consumed: 1 };
  }
  if (argument.startsWith(`${DEV_INSTANCE_FLAG}=`)) {
    if (instanceName) throw new Error("--multi-instance may only be specified once");
    return {
      handled: true,
      instanceName: normalizeDevelopmentInstanceName(
        argument.slice(`${DEV_INSTANCE_FLAG}=`.length),
      ),
      consumed: 0,
    };
  }
  return { handled: false, instanceName, consumed: 0 };
}

/**
 * Extracts the OpenAgent-only multi-instance option before Tauri's runner
 * delimiter. Arguments after that delimiter belong to Cargo or the app.
 *
 * @param {string[]} arguments_
 * @returns {{ arguments_: string[]; instanceName?: string }}
 */
export function parseDevelopmentInstanceArguments(arguments_) {
  const delimiterIndex = arguments_.indexOf("--");
  const tauriArguments =
    delimiterIndex === -1 ? [...arguments_] : arguments_.slice(0, delimiterIndex);
  const runnerArguments = delimiterIndex === -1 ? [] : arguments_.slice(delimiterIndex);
  let instanceName;
  const filteredArguments = [];

  for (let index = 0; index < tauriArguments.length; index += 1) {
    const parsed = parseInstanceArgument(tauriArguments, index, instanceName);
    if (parsed.handled) {
      instanceName = parsed.instanceName;
      index += parsed.consumed;
    } else {
      filteredArguments.push(tauriArguments[index]);
    }
  }

  return {
    arguments_: [...filteredArguments, ...runnerArguments],
    ...(instanceName ? { instanceName } : {}),
  };
}

/**
 * @param {NodeJS.ProcessEnv} environment
 * @param {string} instanceName
 * @param {{ homeDirectory?: string }} [options]
 * @returns {NodeJS.ProcessEnv}
 */
export function applyDevelopmentInstanceEnvironment(
  environment,
  instanceName,
  { homeDirectory = os.homedir() } = {},
) {
  const normalizedName = normalizeDevelopmentInstanceName(instanceName);
  return {
    ...environment,
    OPENAGENT_DEV_MULTI_INSTANCE: "1",
    OPENAGENT_DEV_INSTANCE: normalizedName,
    ...(environment.OPENAGENT_HOME?.trim()
      ? {}
      : {
          OPENAGENT_HOME: path.join(homeDirectory, ".openagent-dev", "instances", normalizedName),
        }),
  };
}

/**
 * Returns the durable development home used by a named debug instance.
 * Black-box automation uses this same derivation so restarting the app does
 * not discard provider and model configuration between runs.
 *
 * @param {string} instanceName
 * @param {{ homeDirectory?: string }} [options]
 */
export function developmentInstanceHome(instanceName, { homeDirectory = os.homedir() } = {}) {
  return path.join(
    homeDirectory,
    ".openagent-dev",
    "instances",
    normalizeDevelopmentInstanceName(instanceName),
  );
}
