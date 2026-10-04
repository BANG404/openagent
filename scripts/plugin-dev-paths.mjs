// @ts-check
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
export const defaultPluginIndexFile = fileURLToPath(
  new URL("../plugins/dev-index.json", import.meta.url),
);

/** @param {string} root @param {string} directory */
function isInside(root, directory) {
  const path = relative(root, directory);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

/**
 * Read the tracked source index without consulting .env or process overrides.
 * Paths stay inside the index's plugin directory, including through junctions.
 * @param {{indexFile?: string}} [options]
 * @returns {{indexFile: string, directories: Record<string, string>}}
 */
export function readPluginDevIndex({ indexFile = defaultPluginIndexFile } = {}) {
  const file = resolve(indexFile);
  if (!existsSync(file)) throw new Error(`Plugin development index does not exist: ${file}`);
  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`Plugin development index must contain valid JSON: ${file}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Plugin development index must map plugin IDs to relative directories.");
  }
  /** @type {Record<string, string>} */
  const directories = {};
  for (const [id, path] of Object.entries(value)) {
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) ||
      typeof path !== "string" ||
      !path.trim() ||
      isAbsolute(path) ||
      !isInside(dirname(file), resolve(dirname(file), path))
    ) {
      throw new Error(`Invalid plugin directory mapping for ${id}; use a path inside plugins.`);
    }
    directories[id] = resolve(dirname(file), path);
  }
  if (!Object.keys(directories).length) throw new Error("Plugin development index is empty.");
  return { indexFile: file, directories };
}

/** @param {{indexFile: string, directories: Record<string, string>}} index @param {string} id */
export function resolvePluginDevPath(index, id) {
  const directory = Object.hasOwn(index.directories, id) ? index.directories[id] : undefined;
  if (!directory)
    throw new Error(`No directory configured for plugin ${id} in ${index.indexFile}.`);
  const initialize = `Run git submodule update --init --recursive -- plugins/${id}.`;
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`Plugin ${id} directory does not exist: ${directory}. ${initialize}`);
  }
  const root = realpathSync(dirname(index.indexFile));
  const resolved = realpathSync(directory);
  if (!isInside(root, resolved))
    throw new Error(`Plugin ${id} directory escapes plugins: ${directory}`);
  const manifestPath = resolve(resolved, "plugin.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Plugin ${id} has no plugin.json in ${directory}. ${initialize}`);
  }
  /** @type {{name?: string, version?: string}} */
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.name !== id || typeof manifest.version !== "string" || !manifest.version.trim()) {
    throw new Error(
      `Plugin ${id} requires a matching plugin.json name and a non-empty version in ${directory}.`,
    );
  }
  return { id, directory: resolved, version: manifest.version };
}
