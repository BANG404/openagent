// @ts-check
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TERMINAL_TOOLS,
  terminalToolRelease,
  terminalToolTarget,
} from "./terminal-tool-releases.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
/** @param {Uint8Array} bytes */
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Extract only the reviewed executable and license members.
 * @param {string} archive @param {string} destination
 * @param {ReturnType<typeof terminalToolRelease>} release
 */
export function extractTerminalTool(archive, destination, release) {
  const tar =
    process.platform === "win32"
      ? path.join(process.env.SystemRoot || "C:/Windows", "System32/tar.exe")
      : "tar";
  const members = [release.executable, ...release.licenses].map(
    (name) => `${release.directory}/${name}`,
  );
  const result = spawnSync(tar, ["-xf", archive, "-C", destination, ...members], {
    windowsHide: true,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0)
    throw new Error(`${release.name} extraction failed: ${result.stderr}`, { cause: result.error });
}

/** @param {string} destination @param {string} target */
export async function preparedTerminalToolsMatch(destination, target) {
  try {
    const record = JSON.parse(await readFile(path.join(destination, "provenance.json"), "utf8"));
    if (
      record.target !== target ||
      Object.keys(record.tools).sort().join() !== Object.keys(TERMINAL_TOOLS).sort().join()
    )
      return false;
    for (const name of Object.keys(TERMINAL_TOOLS)) {
      const release = terminalToolRelease(name, target);
      const installed = record.tools[name];
      if (
        installed.version !== release.version ||
        installed.archiveSha256 !== release.sha256 ||
        installed.url !== release.url
      )
        return false;
      for (const file of [
        release.executable,
        ...release.licenses.map((license) => `licenses/${name}/${license}`),
      ]) {
        if (installed.files[file] !== digest(await readFile(path.join(destination, file))))
          return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Bundle portable tools in the shell; never install package managers or change OS PATH.
 * @param {{repositoryRoot?: string; target?: string; fetchRequest?: typeof fetch}} [options]
 */
export async function prepareTerminalTools(options = {}) {
  const repositoryRoot = options.repositoryRoot ?? root;
  const target = options.target ?? terminalToolTarget();
  const releases = Object.keys(TERMINAL_TOOLS).map((name) => terminalToolRelease(name, target));
  const destination = path.join(repositoryRoot, "src-tauri/resources/terminal-tools");
  if (await preparedTerminalToolsMatch(destination, target)) return destination;
  const staging = path.join(path.dirname(destination), `terminal-stage-${randomUUID()}`);
  const prepared = path.join(staging, "prepared");
  /** @type {Record<string, {version: string; url: string; archiveSha256: string; files: Record<string, string>}>} */
  const tools = {};
  await mkdir(prepared, { recursive: true });
  try {
    for (const release of releases) {
      const cache = path.join(repositoryRoot, ".cache/terminal-tools", release.archive);
      let bytes = await readFile(cache).catch(() => null);
      if (!bytes || digest(bytes) !== release.sha256) {
        console.log(`Preparing bundled ${release.name} ${release.version} for ${target}`);
        const response = await (options.fetchRequest ?? fetch)(release.url, {
          signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok)
          throw new Error(`${release.name} download failed: HTTP ${response.status}`);
        bytes = Buffer.from(await response.arrayBuffer());
        if (digest(bytes) !== release.sha256)
          throw new Error(`${release.name} archive SHA-256 does not match the reviewed pin`);
        await mkdir(path.dirname(cache), { recursive: true });
        await writeFile(cache, bytes);
      }
      extractTerminalTool(cache, staging, release);
      const source = path.join(staging, release.directory);
      const files = [
        [release.executable, release.executable],
        ...release.licenses.map((license) => [license, `licenses/${release.name}/${license}`]),
      ];
      /** @type {Record<string, string>} */
      const hashes = {};
      for (const [member, relative] of files) {
        const output = path.join(prepared, relative);
        await mkdir(path.dirname(output), { recursive: true });
        await copyFile(path.join(source, member), output);
        hashes[relative] = digest(await readFile(output));
      }
      if (!release.executable.endsWith(".exe"))
        await chmod(path.join(prepared, release.executable), 0o755);
      tools[release.name] = {
        version: release.version,
        url: release.url,
        archiveSha256: release.sha256,
        files: hashes,
      };
    }
    await writeFile(
      path.join(prepared, "provenance.json"),
      `${JSON.stringify({ target, tools }, null, 2)}\n`,
    );
    await rm(destination, { recursive: true, force: true });
    await rename(prepared, destination);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return destination;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf("--target");
  if (index >= 0 && !process.argv[index + 1]) throw new Error("--target requires a target triple");
  await prepareTerminalTools({ target: index >= 0 ? process.argv[index + 1] : undefined });
}
