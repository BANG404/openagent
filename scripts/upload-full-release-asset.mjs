import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const tagIndex = process.argv.indexOf("--tag");
const tag = tagIndex >= 0 ? process.argv[tagIndex + 1] : "";
if (!tag) throw new Error("--tag is required");

const bundleRoot = path.resolve("src-tauri", "target");
const { version } = JSON.parse(
  await readFile(path.resolve("src-tauri", "tauri.conf.json"), "utf8"),
);
const expectedBundleDirectory =
  process.platform === "win32" ? "nsis" : process.platform === "darwin" ? "dmg" : "appimage";
const expectedExtension =
  process.platform === "win32" ? ".exe" : process.platform === "darwin" ? ".dmg" : ".AppImage";

/**
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(absolute) : [absolute];
    }),
  );
  return nested.flat();
}

const candidates = (await collectFiles(bundleRoot)).filter(
  (file) =>
    path.basename(file).includes(version) &&
    path.basename(path.dirname(file)) === expectedBundleDirectory &&
    file.endsWith(expectedExtension),
);
if (candidates.length !== 1) {
  throw new Error(
    `Expected one ${expectedBundleDirectory} ${expectedExtension} full installer, found ${candidates.length}: ${candidates.join(", ")}`,
  );
}

const source = candidates[0];
const sourceName = path.basename(source);
const fullName =
  process.platform === "win32" && sourceName.endsWith("-setup.exe")
    ? sourceName.replace(/-setup\.exe$/, "-full-setup.exe")
    : `${sourceName.slice(0, -expectedExtension.length)}-full${expectedExtension}`;
const staging = path.join(os.tmpdir(), "openagent-full-release");
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
const upload = path.join(staging, fullName);
await copyFile(source, upload);

const result = spawnSync("gh", ["release", "upload", tag, upload, "--clobber"], {
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
