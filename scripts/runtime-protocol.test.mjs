import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readDesktopRuntimeProtocol,
  verifyDevelopmentRuntimeProtocol,
} from "./runtime-protocol.mjs";
import { validateDevKit } from "./prepare-dev-kit.mjs";

test("development admission follows the checked-out host protocol across version changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openagent-runtime-protocol-"));
  try {
    const hostFile = join(directory, "src-tauri/src/runtime_process.rs");
    const sdkFile = join(directory, "runtime/rust/openagent-protocol/src/lib.rs");
    await mkdir(join(directory, "src-tauri/src"), { recursive: true });
    await mkdir(join(directory, "runtime/rust/openagent-protocol/src"), { recursive: true });
    const sdkSha = "a".repeat(40);
    const artifact = { file: "fixture", size: 1, sha256: "b".repeat(64) };
    for (const version of [3, 7]) {
      await writeFile(
        hostFile,
        `pub const DESKTOP_RUNTIME_PROTOCOL_VERSION: u32 = ${version};\r\n`,
      );
      await writeFile(sdkFile, `pub const SDK_PROTOCOL_VERSION: u32 = ${version};\n`);
      expect(verifyDevelopmentRuntimeProtocol(directory)).toBe(version);
      const manifest = {
        schema_version: 2,
        sdk_sha: sdkSha,
        clients: { typescript: artifact },
        runtime: {
          sdk_sha: sdkSha,
          version: "1.0.0",
          protocol: { min: version, max: version },
          artifacts: { "macos-arm64": artifact },
        },
      };
      expect(
        validateDevKit(manifest, sdkSha, "macos-arm64", readDesktopRuntimeProtocol(directory))
          .runtime,
      ).toEqual(artifact);
    }
    await writeFile(sdkFile, "pub const SDK_PROTOCOL_VERSION: u32 = 2;\n");
    expect(() => verifyDevelopmentRuntimeProtocol(directory)).toThrow(
      "must match the desktop host",
    );
    for (const source of ["", "pub const DESKTOP_RUNTIME_PROTOCOL_VERSION: u32 = 0;\n"]) {
      await writeFile(hostFile, source);
      expect(() => readDesktopRuntimeProtocol(directory)).toThrow(
        "Missing or invalid protocol constant",
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
