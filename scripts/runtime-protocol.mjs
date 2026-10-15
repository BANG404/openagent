import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

/** @param {string} file @param {string} name */
function readProtocolConstant(file, name) {
  const source = readFileSync(file, "utf8");
  const value = Number(new RegExp(`^pub const ${name}: u32 = (\\d+);\\r?$`, "m").exec(source)?.[1]);
  if (!Number.isInteger(value) || value < 1 || value > 0xffff_ffff) {
    throw new Error(`Missing or invalid protocol constant: ${name}`);
  }
  return value;
}

/** Public contracts own the desktop's Runtime protocol.
 * @param {string} [repositoryRoot]
 */
export function readDesktopRuntimeProtocol(repositoryRoot = root) {
  return readProtocolConstant(
    path.join(repositoryRoot, "crates/openagent-protocol/src/lib.rs"),
    "SDK_PROTOCOL_VERSION",
  );
}

/** Reject incompatible development publication before starting native builds.
 * @param {string} [repositoryRoot]
 */
export function verifyDevelopmentRuntimeProtocol(repositoryRoot = root) {
  const desktopProtocol = readDesktopRuntimeProtocol(repositoryRoot);
  const sdkProtocol = readRuntimeProtocol(repositoryRoot);
  if (desktopProtocol !== sdkProtocol) {
    throw new Error("Development Runtime protocol must match the desktop host");
  }
  return desktopProtocol;
}

/** Resolve the immutable public contract consumed by this private Runtime.
 * @param {string} [repositoryRoot]
 */
export function readRuntimeProtocol(repositoryRoot = root) {
  const result = spawnSync(process.execPath, ["runtime/scripts/public-protocol.mjs", "--sdk"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout: 25_000,
  });
  if (result.error || result.status !== 0)
    throw new Error("Could not resolve the pinned public Runtime protocol");
  const value = Number(result.stdout.trim());
  if (!Number.isInteger(value) || value < 1 || value > 0xffff_ffff)
    throw new Error("Invalid pinned public Runtime protocol");
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyDevelopmentRuntimeProtocol();
  console.log("Development Runtime and desktop protocols match.");
}
