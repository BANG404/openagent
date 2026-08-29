import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSdkDevelopmentManifest } from "./sdk-dev-artifacts.mjs";

test("describes immutable public SDK development artifacts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openagent-sdk-dev-"));
  try {
    await writeFile(join(directory, "openagent-typescript-sdk.tar.gz"), "typescript");
    await writeFile(join(directory, "openagent-harness.tgz"), "harness");
    const sdkSha = "0123456789abcdef0123456789abcdef01234567";
    const manifest = await createSdkDevelopmentManifest({
      directory,
      sdkSha,
      version: "0.1.1-dev.0123456",
    });
    expect(manifest.sdk_sha).toBe(sdkSha);
    expect(manifest.runtime_manifest.signature).toBe("openagent-sdk-manifest.json.sig");
    expect(manifest.clients.typescript.name).toBe("@bang404/openagent-sdk");
    expect(manifest.clients.typescript.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.clients.harness.size).toBeGreaterThan(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
