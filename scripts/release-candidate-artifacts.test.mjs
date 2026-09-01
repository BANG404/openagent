import { afterEach, describe, expect, test } from "bun:test";
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  prepareNativePublication,
  stageFullInstaller,
  stageTauriArtifacts,
  verifyCandidateSet,
  writeCandidateManifest,
} from "./release-candidate-artifacts.mjs";

const temporaryDirectories = [];
const desktopSha = "1".repeat(40);
const sdkSha = "2".repeat(40);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "openagent-release-candidate-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeAssets(directory, names) {
  await mkdir(directory, { recursive: true });
  await Promise.all(names.map((name) => writeFile(path.join(directory, name), `bytes:${name}`)));
}

describe("release candidate artifacts", () => {
  test("stages lightweight and full Windows installers with source identity", async () => {
    const root = await temporaryDirectory();
    const generated = path.join(root, "generated");
    const output = path.join(root, "candidate");
    const light = "openagent_1.2.3_x64-setup.exe";
    const signature = `${light}.sig`;
    await writeAssets(generated, [light, signature]);

    await stageTauriArtifacts({
      artifactPaths: [path.join(generated, light), path.join(generated, signature)],
      outputDirectory: output,
      target: "windows-x64",
    });
    const fullDirectory = path.join(root, "target", "release", "bundle", "nsis");
    await writeAssets(fullDirectory, [light]);
    expect(
      await stageFullInstaller({
        bundleRoot: path.join(root, "target"),
        outputDirectory: output,
        target: "windows-x64",
        version: "1.2.3",
      }),
    ).toBe("openagent_1.2.3_x64-full-setup.exe");

    const manifest = await writeCandidateManifest({
      outputDirectory: output,
      target: "windows-x64",
      desktopSha,
      sdkSha,
    });
    expect(manifest.assets).toHaveLength(3);
    expect(manifest.desktop_sha).toBe(desktopSha);
    expect(manifest.sdk_sha).toBe(sdkSha);
  });

  test("names macOS updater archives per architecture before artifact merging", async () => {
    const root = await temporaryDirectory();
    const generated = path.join(root, "generated");
    const output = path.join(root, "candidate");
    await writeAssets(generated, [
      "openagent_1.2.3_aarch64.dmg",
      "openagent.app.tar.gz",
      "openagent.app.tar.gz.sig",
    ]);

    expect(
      await stageTauriArtifacts({
        artifactPaths: (await readdir(generated)).map((name) => path.join(generated, name)),
        outputDirectory: output,
        target: "macos-arm64",
      }),
    ).toEqual([
      "openagent_1.2.3_aarch64.dmg",
      "openagent_aarch64.app.tar.gz",
      "openagent_aarch64.app.tar.gz.sig",
    ]);
  });

  test("verifies every platform and generates one updater manifest", async () => {
    const root = await temporaryDirectory();
    const candidates = path.join(root, "candidates");
    const publication = path.join(root, "publication");
    const assetsByTarget = {
      "macos-arm64": [
        "openagent_1.2.3_aarch64.dmg",
        "openagent_aarch64.app.tar.gz",
        "openagent_aarch64.app.tar.gz.sig",
        "openagent_1.2.3_aarch64-full.dmg",
      ],
      "macos-x64": [
        "openagent_1.2.3_x64.dmg",
        "openagent_x64.app.tar.gz",
        "openagent_x64.app.tar.gz.sig",
        "openagent_1.2.3_x64-full.dmg",
      ],
      "linux-x64": [
        "openagent_1.2.3_amd64.AppImage",
        "openagent_1.2.3_amd64.AppImage.sig",
        "openagent_1.2.3_amd64.deb",
        "openagent_1.2.3_amd64.deb.sig",
        "openagent-1.2.3-1.x86_64.rpm",
        "openagent-1.2.3-1.x86_64.rpm.sig",
        "openagent_1.2.3_amd64-full.AppImage",
      ],
      "windows-x64": [
        "openagent_1.2.3_x64-setup.exe",
        "openagent_1.2.3_x64-setup.exe.sig",
        "openagent_1.2.3_x64-full-setup.exe",
      ],
    };
    const targets = Object.keys(assetsByTarget);
    for (const target of targets) {
      const targetDirectory = path.join(root, target);
      await writeAssets(targetDirectory, assetsByTarget[target]);
      await writeCandidateManifest({
        outputDirectory: targetDirectory,
        target,
        desktopSha,
        sdkSha,
      });
      await mkdir(candidates, { recursive: true });
      for (const name of await readdir(targetDirectory)) {
        await copyFile(path.join(targetDirectory, name), path.join(candidates, name));
      }
    }

    const updater = await prepareNativePublication({
      candidateDirectory: candidates,
      outputDirectory: publication,
      expectedTargets: targets,
      desktopSha,
      sdkSha,
      releaseTag: "v1.2.3-beta.1",
      repository: "BANG404/openagent",
      version: "1.2.3-beta.1",
      notes: "See the CHANGELOG for details.",
    });
    expect(Object.keys(updater.platforms)).toHaveLength(10);
    expect(updater.platforms["windows-x86_64"].url).toEndWith(
      "/v1.2.3-beta.1/openagent_1.2.3_x64-setup.exe",
    );
    expect(JSON.parse(await readFile(path.join(publication, "latest.json"), "utf8"))).toEqual(
      updater,
    );

    await writeFile(path.join(candidates, "openagent_1.2.3_x64-setup.exe"), "tampered");
    await expect(
      verifyCandidateSet({
        candidateDirectory: candidates,
        expectedTargets: targets,
        desktopSha,
        sdkSha,
      }),
    ).rejects.toThrow("integrity mismatch");
  });
});
