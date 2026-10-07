import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signingFixture } from "../tests/fixtures/minisign.mjs";
import { createDistribution } from "./distribution-artifacts.mjs";
import { stageDistribution } from "./stage-distribution.mjs";
import { bindRuntimeHelpers } from "./bind-runtime-helpers.mjs";

test("online and offline staging bind the same signed platform bytes and reject corruption", async () => {
  const root = await mkdtemp(join(tmpdir(), "openagent-distribution-test-"));
  try {
    const [
      runtimeDirectory,
      frontendDirectory,
      helperDirectory,
      modelDirectory,
      directory,
      destination,
    ] = ["runtime", "frontend", "helpers", "model", "complete", "offline"].map((name) =>
      join(root, name),
    );
    for (const path of [runtimeDirectory, frontendDirectory, helperDirectory, modelDirectory])
      await mkdir(path);
    const runtimeBytes = Buffer.from("Runtime executable fixture");
    const runtime = {
      file: "runtime.exe",
      size: runtimeBytes.length,
      sha256: createHash("sha256").update(runtimeBytes).digest("hex"),
    };
    const frontendBytes = Buffer.from("Frontend archive fixture");
    const frontend = {
      file: "frontend.tar.gz",
      size: frontendBytes.length,
      sha256: createHash("sha256").update(frontendBytes).digest("hex"),
    };
    const fixture = signingFixture();
    for (const [folder, file, manifest] of [
      [
        runtimeDirectory,
        "openagent-sdk-manifest.json",
        {
          schema_version: 1,
          sdk_sha: "1".repeat(40),
          version: "0.1.0",
          protocol: { min: 2, max: 2 },
          artifacts: { "windows-x64": runtime },
        },
      ],
      [
        frontendDirectory,
        "openagent-frontend-manifest.json",
        {
          schema_version: 2,
          version: "1.0.0",
          compatibility: { shell: { min: 1, max: 1 }, runtime: { min: 2, max: 2 } },
          artifact: frontend,
        },
      ],
    ]) {
      const bytes = Buffer.from(JSON.stringify(manifest));
      await writeFile(join(folder, file), bytes);
      await writeFile(join(folder, `${file}.sig`), fixture.sign(bytes));
    }
    await writeFile(join(runtimeDirectory, runtime.file), runtimeBytes);
    await writeFile(join(frontendDirectory, frontend.file), frontendBytes);
    for (const helper of [
      "codex-windows-sandbox-setup.exe",
      "codex-command-runner.exe",
      "codex-bwrap-linux-x64",
    ])
      await writeFile(join(helperDirectory, helper), `signed ${helper}`);
    for (const model of [
      "model_quantized.onnx",
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "special_tokens_map.json",
      "LICENSE",
    ])
      await writeFile(join(modelDirectory, model), `signed ${model}`);
    const bound = await bindRuntimeHelpers(runtimeDirectory, helperDirectory);
    expect(bound.helpers["windows-x64"]["codex-command-runner.exe"].sha256).toHaveLength(64);
    await writeFile(
      join(runtimeDirectory, "openagent-sdk-manifest.json.sig"),
      fixture.sign(await readFile(join(runtimeDirectory, "openagent-sdk-manifest.json"))),
    );
    const manifest = await createDistribution({
      directory,
      runtimeDirectory,
      frontendDirectory,
      helperDirectory,
      modelDirectory,
      version: "1.0.0",
      sdkSha: "2".repeat(40),
    });
    expect(manifest.sdk_sha).toBe("2".repeat(40));
    expect(manifest.runtime_version).toBe("0.1.0");
    const bytes = await readFile(join(directory, "openagent-distribution.json"));
    await writeFile(join(directory, "openagent-distribution.json.sig"), fixture.sign(bytes));
    await stageDistribution({
      source: directory,
      destination,
      target: "windows-x64",
      publicKey: fixture.publicKey,
    });
    expect(await readFile(join(destination, runtime.file))).toEqual(runtimeBytes);
    expect(await readdir(destination)).not.toContain("codex-bwrap-linux-x64");
    expect(await readFile(join(destination, "openagent-distribution.json"))).toEqual(bytes);
    await writeFile(join(directory, runtime.file), "corrupt executable");
    await expect(
      stageDistribution({
        source: directory,
        destination,
        target: "windows-x64",
        publicKey: fixture.publicKey,
      }),
    ).rejects.toThrow();
    await writeFile(
      join(directory, "openagent-distribution.json"),
      Buffer.from("tampered release identity"),
    );
    await expect(
      stageDistribution({
        source: directory,
        destination,
        target: "windows-x64",
        publicKey: fixture.publicKey,
      }),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
