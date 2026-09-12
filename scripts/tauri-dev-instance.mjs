import os from "node:os";
import path from "node:path";

const DEV_INSTANCE_FLAG = "--multi-instance";

/**
 * @param {string} value
 * @returns {string}
 */
export function normalizeDevelopmentInstanceName(value) {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    throw new Error("--multi-instance requires a non-empty instance name");
  }
  return normalized;
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
    const argument = tauriArguments[index];
    if (argument === DEV_INSTANCE_FLAG) {
      if (instanceName) {
        throw new Error("--multi-instance may only be specified once");
      }
      const value = tauriArguments[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--multi-instance requires a non-empty instance name");
      }
      instanceName = normalizeDevelopmentInstanceName(value);
      index += 1;
      continue;
    }
    if (argument.startsWith(`${DEV_INSTANCE_FLAG}=`)) {
      if (instanceName) {
        throw new Error("--multi-instance may only be specified once");
      }
      instanceName = normalizeDevelopmentInstanceName(
        argument.slice(`${DEV_INSTANCE_FLAG}=`.length),
      );
      continue;
    }
    filteredArguments.push(argument);
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
