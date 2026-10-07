import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

/** A prepared public kit takes precedence; source development remains explicit and local.
 * @param {string} [repositoryRoot]
 * @param {NodeJS.ProcessEnv} [environment]
 */
export function sdkClientSource(repositoryRoot = root, environment = process.env) {
  const source = resolve(repositoryRoot, "sdk/typescript/src");
  const prepared = resolve(repositoryRoot, ".cache/openagent-dev-kit/client/src");
  if (environment.OPENAGENT_DEV_RUNTIME_SOURCE === "1") return source;
  if (existsSync(resolve(prepared, "index.ts"))) return prepared;
  return source;
}
