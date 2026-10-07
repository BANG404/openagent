import { createHash } from "node:crypto";
import { cp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Bind the exact SDK's executable helpers into its signed Runtime manifest.
 * @param {string} directory @param {string} helperDirectory
 */
export async function bindRuntimeHelpers(directory, helperDirectory) {
  const file = path.join(directory, "openagent-sdk-manifest.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  const helpers = {};
  for (const [target, names] of Object.entries({
    "windows-x64": ["codex-windows-sandbox-setup.exe", "codex-command-runner.exe"],
    "linux-x64": ["codex-bwrap-linux-x64"],
  })) {
    helpers[target] = {};
    for (const name of names) {
      const source = path.join(helperDirectory, name);
      const bytes = await readFile(source);
      if (path.resolve(source) !== path.resolve(directory, name))
        await cp(source, path.join(directory, name));
      helpers[target][name] = {
        file: name,
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    }
  }
  manifest.helpers = helpers;
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await bindRuntimeHelpers(process.argv[2], process.argv[3]);
}
