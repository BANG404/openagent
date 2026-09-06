import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  RELEASE_RUNTIME_ARTIFACTS,
  stageReleaseRuntime,
  validateReleaseRuntime,
} from "./stage-release-runtime.mjs";

const sdkSha = "a".repeat(40);

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "openagent-release-runtime-"));
  const artifacts = {};
  for (const [target, file] of Object.entries(RELEASE_RUNTIME_ARTIFACTS)) {
    const bytes = Buffer.from(`runtime:${target}`);
    await writeFile(path.join(directory, file), bytes);
    artifacts[target] = {
      file,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
  await writeFile(
    path.join(directory, "openagent-sdk-manifest.json"),
    JSON.stringify({
      schema_version: 1,
      sdk_sha: sdkSha,
      protocol: { min: 7, max: 7 },
      artifacts,
    }),
  );
  return directory;
}

describe("release Runtime staging", () => {
  test("validates and stages the exact SDK binary for Tauri", async () => {
    const artifactsDirectory = await fixture();
    const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "openagent-tauri-runtime-"));
    await stageReleaseRuntime({
      artifactsDirectory,
      sdkSha,
      tauriTarget: "x86_64-unknown-linux-gnu",
      repositoryRoot,
    });

    const destination = path.join(
      repositoryRoot,
      "src-tauri/binaries/openagent-server-x86_64-unknown-linux-gnu",
    );
    expect(await readFile(destination, "utf8")).toBe("runtime:linux-x64");
    expect((await stat(destination)).mode & 0o111).not.toBe(0);
  });

  test("rejects a binary whose bytes do not match the manifest", async () => {
    const artifactsDirectory = await fixture();
    await writeFile(path.join(artifactsDirectory, RELEASE_RUNTIME_ARTIFACTS["macos-x64"]), "bad");

    expect(validateReleaseRuntime({ artifactsDirectory, sdkSha })).rejects.toThrow(
      /mismatch for macos-x64/,
    );
  });

  test("rejects a candidate from another SDK revision", async () => {
    const artifactsDirectory = await fixture();

    expect(validateReleaseRuntime({ artifactsDirectory, sdkSha: "b".repeat(40) })).rejects.toThrow(
      /does not match SDK/,
    );
  });
});
