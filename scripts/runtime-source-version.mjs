import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Read the declared Runtime version, including older source qualification inputs.
 * @param {string} directory
 */
export async function readRuntimeSourceVersion(directory) {
  const workspace = await readFile(path.join(directory, "Cargo.toml"), "utf8");
  let version = /\[workspace\.package\]\s*\r?\nversion = "([^"]+)"/.exec(workspace)?.[1];
  if (!version) {
    // Current public CI can be dispatched to historical immutable Runtime tags.
    const legacy = await readFile(path.join(directory, "rust/openagent-server/Cargo.toml"), "utf8");
    version = /^version = "([^"]+)"/m.exec(legacy)?.[1];
  }
  if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("Missing declared Runtime release version");
  }
  return version;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await readRuntimeSourceVersion(path.resolve(process.argv[2] ?? "runtime")));
}
