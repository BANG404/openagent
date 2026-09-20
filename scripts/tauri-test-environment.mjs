import os from "node:os";

import {
  DEFAULT_BLACKBOX_INSTANCE,
  developmentInstanceHome,
  normalizeDevelopmentInstanceName,
} from "./tauri-dev-instance.mjs";

/**
 * Resolve the persistent home shared by the black-box app and its runner.
 * An explicit OPENAGENT_HOME always wins, including CI fixtures.
 *
 * @param {NodeJS.ProcessEnv} [environment]
 * @param {{ homeDirectory?: string; instanceName?: string }} [options]
 */
export function resolveBlackboxHome(
  environment = process.env,
  { homeDirectory = os.homedir(), instanceName = DEFAULT_BLACKBOX_INSTANCE } = {},
) {
  const explicit = environment.OPENAGENT_HOME?.trim();
  if (explicit) return explicit;
  const configuredInstance = environment.OPENAGENT_DEV_INSTANCE?.trim() || instanceName;
  return developmentInstanceHome(configuredInstance, { homeDirectory });
}

/**
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {string}
 */
export function blackboxInstanceName(environment = process.env) {
  return normalizeDevelopmentInstanceName(
    environment.OPENAGENT_DEV_INSTANCE?.trim() || DEFAULT_BLACKBOX_INSTANCE,
  );
}
