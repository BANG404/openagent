import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { copyFileIfChanged } from "./copy-if-changed.mjs";
import {
  cleanDevelopmentRuntimeImages,
  withDevelopmentRuntimeCache,
} from "./development-cache.mjs";

/**
 * Keep running images immutable; publish the selection only after complete staging.
 * @param {{repositoryRoot: string, targetTriple: string, source: string, destination: string, resourcesDirectory?: string}} options
 */
export async function stageDevelopmentRuntime(options) {
  const result = await withDevelopmentRuntimeCache(
    options.repositoryRoot,
    options.targetTriple,
    () => stageDevelopmentRuntimeUnlocked(options),
  );
  await cleanDevelopmentRuntimeImages({ ...options, apply: true }).catch((error) => {
    console.warn(`Development Runtime cache cleanup skipped: ${error.message}`);
  });
  return result;
}

/** @param {{repositoryRoot: string, targetTriple: string, source: string, destination: string, resourcesDirectory?: string}} options */
async function stageDevelopmentRuntimeUnlocked({
  repositoryRoot,
  targetTriple,
  source,
  destination,
  resourcesDirectory,
}) {
  const bytes = await readFile(source);
  if (!bytes.length) throw new Error("Development Runtime candidate is empty");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const selection = `${destination}.selection.json`;
  const previous = await readFile(selection, "utf8").catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  const directory = path.join(
    repositoryRoot,
    ".cache",
    "development-runtime",
    targetTriple,
    sha256,
  );
  const binary = path.join(
    directory,
    targetTriple.includes("windows") ? "openagent-server.exe" : "openagent-server",
  );
  await mkdir(directory, { recursive: true });
  const existing = await readFile(binary).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (existing && !existing.equals(bytes))
    throw new Error("Immutable development Runtime bytes were modified");
  if (!existing) {
    await writeFile(binary, bytes, { flag: "wx" });
    if (!targetTriple.includes("windows")) await chmod(binary, 0o755);
  }
  // Native sandbox lookup is relative to the running server image, including
  // when its wrapper re-enters the server from this immutable directory.
  if (resourcesDirectory) {
    const helpers = targetTriple.includes("windows")
      ? ["codex-command-runner.exe", "codex-windows-sandbox-setup.exe"]
      : targetTriple.includes("linux")
        ? ["bwrap"]
        : [];
    for (const name of helpers) {
      const helper = await readFile(path.join(resourcesDirectory, name));
      if (!helper.length) throw new Error(`Development Runtime helper is empty: ${name}`);
      const output = path.join(directory, "codex-resources", name);
      await mkdir(path.dirname(output), { recursive: true });
      const previousHelper = await readFile(output).catch((error) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      });
      if (previousHelper && !previousHelper.equals(helper))
        throw new Error(`Immutable development Runtime helper was modified: ${name}`);
      if (!previousHelper) {
        await writeFile(output, helper, { flag: "wx" });
        if (!targetTriple.includes("windows")) await chmod(output, 0o755);
      }
    }
  }
  // The initial desktop may still run the old fixed sidecar. Windows refuses
  // replacing that image, but the immutable candidate is ready for the barrier.
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await copyFileIfChanged(source, destination);
  } catch (error) {
    if (!targetTriple.includes("windows") || !["EACCES", "EPERM", "EBUSY"].includes(error.code))
      throw error;
  }
  const contents = `${JSON.stringify({ schema_version: 1, sha256 })}\n`;
  if (previous === contents) return { changed: false, developmentBinary: binary };
  const temporary = `${selection}.${process.pid}.tmp`;
  await writeFile(temporary, contents);
  await rename(temporary, selection);
  return { changed: true, developmentBinary: binary };
}
