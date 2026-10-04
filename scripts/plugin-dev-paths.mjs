// @ts-check
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const defaultPluginEnvFile = fileURLToPath(new URL("../.env", import.meta.url));

/**
 * Read only the plugin directory index; never log or export unrelated .env values.
 * @param {{envFile?: string, environment?: NodeJS.ProcessEnv}} [options]
 * @returns {{envFile: string, directories: Record<string, string>}}
 */
export function readPluginDevIndex({
  envFile = process.env.OPENAGENT_PLUGIN_ENV_FILE || defaultPluginEnvFile,
  environment = process.env,
} = {}) {
  const file = resolve(envFile);
  const raw =
    environment.OPENAGENT_PLUGIN_DIRS ??
    (existsSync(file) ? parseEnv(readFileSync(file, "utf8")).OPENAGENT_PLUGIN_DIRS : undefined);
  if (!raw?.trim()) {
    throw new Error(
      `Configure OPENAGENT_PLUGIN_DIRS in ${file}; plugin directories are never searched automatically.`,
    );
  }
  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      "OPENAGENT_PLUGIN_DIRS must be a JSON object mapping plugin IDs to directories.",
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "OPENAGENT_PLUGIN_DIRS must be a JSON object mapping plugin IDs to directories.",
    );
  }
  /** @type {Record<string, string>} */
  const directories = {};
  for (const [id, path] of Object.entries(value)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) || typeof path !== "string" || !path.trim()) {
      throw new Error(`Invalid plugin directory mapping for ${id}.`);
    }
    directories[id] = resolve(dirname(file), path);
  }
  if (!Object.keys(directories).length) throw new Error("OPENAGENT_PLUGIN_DIRS is empty.");
  return { envFile: file, directories };
}

/** @param {{directories: Record<string, string>}} index @param {string} id */
export function resolvePluginDevPath(index, id) {
  const directory = index.directories[id];
  if (!directory)
    throw new Error(`No directory configured for plugin ${id} in OPENAGENT_PLUGIN_DIRS.`);
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`Plugin ${id} directory does not exist: ${directory}`);
  }
  /** @type {{name?: string, version?: string}} */
  const manifest = JSON.parse(readFileSync(resolve(directory, "plugin.json"), "utf8"));
  if (manifest.name !== id || typeof manifest.version !== "string" || !manifest.version.trim()) {
    throw new Error(
      `Plugin ${id} requires a matching plugin.json name and a non-empty version in ${directory}.`,
    );
  }
  return { id, directory: realpathSync(directory), version: manifest.version };
}
