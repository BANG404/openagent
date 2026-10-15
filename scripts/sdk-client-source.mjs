import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

/** The host checkout owns the public client, regardless of Runtime source or cached kits.
 * @param {string} [repositoryRoot]
 */
export function sdkClientSource(repositoryRoot = root) {
  return resolve(repositoryRoot, "sdk/typescript/src");
}
