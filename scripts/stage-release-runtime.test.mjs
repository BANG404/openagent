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

async function fixture(version = "1.1.1") {
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
      version,
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
    if (process.platform !== "win32") {
      expect((await stat(destination)).mode & 0o111).not.toBe(0);
    }
  });

  test("stamps the product release identity into the Runtime manifest", async () => {
    const artifactsDirectory = await fixture();
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "openagent-runtime-output-"));
    await stageReleaseRuntime({
      artifactsDirectory,
      sdkSha,
      releaseVersion: "0.63.0",
      outputDirectory,
    });
    const manifest = JSON.parse(
      await readFile(path.join(outputDirectory, "openagent-sdk-manifest.json"), "utf8"),
    );
    expect(manifest.release_version).toBe("0.63.0");
    expect(manifest.version).toBe("1.1.1+desktop.0.63.0");
  });

  test("isolates product releases that reuse one SDK without changing its source manifest", async () => {
    const artifactsDirectory = await fixture();
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "openagent-runtime-output-"));
    const versions = [];
    for (const releaseVersion of ["0.78.2-beta.1", "0.78.3-beta.1"]) {
      await stageReleaseRuntime({ artifactsDirectory, sdkSha, releaseVersion, outputDirectory });
      const manifest = JSON.parse(
        await readFile(path.join(outputDirectory, "openagent-sdk-manifest.json"), "utf8"),
      );
      versions.push(manifest.version);
      expect(manifest.artifacts).toEqual(
        JSON.parse(
          await readFile(path.join(artifactsDirectory, "openagent-sdk-manifest.json"), "utf8"),
        ).artifacts,
      );
    }
    expect(versions).toEqual(["1.1.1+desktop.0.78.2-beta.1", "1.1.1+desktop.0.78.3-beta.1"]);
    expect(
      JSON.parse(
        await readFile(path.join(artifactsDirectory, "openagent-sdk-manifest.json"), "utf8"),
      ).version,
    ).toBe("1.1.1");
  });

  test("rejects a binary whose bytes do not match the manifest", async () => {
    const artifactsDirectory = await fixture();
    await writeFile(path.join(artifactsDirectory, RELEASE_RUNTIME_ARTIFACTS["macos-x64"]), "bad");

    expect(validateReleaseRuntime({ artifactsDirectory, sdkSha })).rejects.toThrow(
      /mismatch for macos-x64/,
    );
  });

  test("preserves existing SDK build metadata in the installation identity", async () => {
    const artifactsDirectory = await fixture("1.1.1+sdk.abcd");
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "openagent-runtime-output-"));
    await stageReleaseRuntime({
      artifactsDirectory,
      sdkSha,
      releaseVersion: "0.78.3-beta.1",
      outputDirectory,
    });
    const manifest = JSON.parse(
      await readFile(path.join(outputDirectory, "openagent-sdk-manifest.json"), "utf8"),
    );
    expect(manifest.version).toBe("1.1.1+sdk.abcd.desktop.0.78.3-beta.1");
  });

  test("rejects a candidate from another SDK revision", async () => {
    const artifactsDirectory = await fixture();

    expect(validateReleaseRuntime({ artifactsDirectory, sdkSha: "b".repeat(40) })).rejects.toThrow(
      /does not match SDK/,
    );
  });
});
