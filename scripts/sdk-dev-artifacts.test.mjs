import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSdkDevelopmentManifest } from "./sdk-dev-artifacts.mjs";

test("describes immutable public SDK development artifacts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openagent-sdk-dev-"));
  try {
    await writeFile(join(directory, "openagent-typescript-sdk.tar.gz"), "typescript");
    const sdkSha = "0123456789abcdef0123456789abcdef01234567";
    await writeFile(
      join(directory, "openagent-sdk-manifest.json"),
      JSON.stringify({
        schema_version: 1,
        sdk_sha: sdkSha,
        version: "0.1.1-dev.0123456",
        protocol: { min: 2, max: 2 },
        artifacts: {},
      }),
    );
    for (const file of [
      "codex-windows-sandbox-setup.exe",
      "codex-command-runner.exe",
      "codex-bwrap-linux-x64",
    ])
      await writeFile(join(directory, file), "helper");
    const manifest = await createSdkDevelopmentManifest({
      directory,
      sdkSha,
      version: "0.1.1-dev.0123456",
    });
    expect(manifest.sdk_sha).toBe(sdkSha);
    expect(manifest.schema_version).toBe(2);
    expect(manifest.runtime.sdk_sha).toBe(sdkSha);
    expect(manifest.runtime_manifest.signature).toBe("openagent-sdk-manifest.json.sig");
    expect(manifest.clients.typescript.name).toBe("@bang404/openagent-sdk");
    expect(manifest.clients.typescript.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(manifest.clients)).toEqual(["typescript"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
