import { readFileSync } from "node:fs";
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

/** The native supervisor owns the desktop's Runtime protocol.
 * @param {string} [repositoryRoot]
 */
export function readDesktopRuntimeProtocol(repositoryRoot = root) {
  return readProtocolConstant(
    path.join(repositoryRoot, "src-tauri/src/runtime_process.rs"),
    "DESKTOP_RUNTIME_PROTOCOL_VERSION",
  );
}

/** Reject incompatible development publication before starting native builds.
 * @param {string} [repositoryRoot]
 */
export function verifyDevelopmentRuntimeProtocol(repositoryRoot = root) {
  const desktopProtocol = readDesktopRuntimeProtocol(repositoryRoot);
  const sdkProtocol = readProtocolConstant(
    path.join(repositoryRoot, "runtime/rust/openagent-protocol/src/lib.rs"),
    "SDK_PROTOCOL_VERSION",
  );
  if (desktopProtocol !== sdkProtocol) {
    throw new Error("Development Runtime protocol must match the desktop host");
  }
  return desktopProtocol;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyDevelopmentRuntimeProtocol();
  console.log("Development Runtime and desktop protocols match.");
}
