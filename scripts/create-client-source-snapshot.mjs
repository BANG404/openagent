import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

/** A buildable source snapshot, not an npm package or a Runtime prerequisite.
 * @param {string} output
 * @param {string} [repositoryRoot]
 */
export async function createClientSourceSnapshot(output, repositoryRoot = root) {
  const archive = resolve(output);
  await mkdir(dirname(archive), { recursive: true });
  // Use a relative archive name: GNU tar treats Windows drive letters as hosts.
  execFileSync(
    "tar",
    [
      "--format=ustar",
      "-czf",
      basename(archive),
      "-C",
      resolve(repositoryRoot, "sdk/typescript"),
      "src",
      "package.json",
      "bun.lock",
      "tsconfig.json",
      "tsconfig.build.json",
      "README.md",
      "LICENSE",
    ],
    { cwd: dirname(archive), stdio: "inherit" },
  );
  return archive;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf("--output");
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error("Usage: create-client-source-snapshot.mjs --output <archive>");
  }
  await createClientSourceSnapshot(process.argv[index + 1]);
}
