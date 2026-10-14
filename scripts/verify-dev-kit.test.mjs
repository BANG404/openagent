import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signingFixture } from "../tests/fixtures/minisign.mjs";
import { verifyDevelopmentKit } from "./verify-dev-kit.mjs";

test("admits a signed protocol-3 kit and rejects corruption, missing targets and signed disagreement", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openagent-verify-dev-kit-"));
  try {
    const sdkSha = "a".repeat(40);
    const fixture = signingFixture();
    const files = [
      "client.tar.gz",
      "runtime",
      "codex-windows-sandbox-setup.exe",
      "codex-command-runner.exe",
      "codex-bwrap-linux-x64",
    ];
    const bytes = Buffer.from("fixture-bytes");
    const describe = (file) => ({
      file,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    for (const file of files) await writeFile(join(directory, file), bytes);
    const runtime = {
      schema_version: 1,
      sdk_sha: sdkSha,
      version: "1.0.0",
      protocol: { min: 3, max: 3 },
      artifacts: Object.fromEntries(
        ["windows-x64", "linux-x64", "macos-x64", "macos-arm64"].map((target) => [
          target,
          describe("runtime"),
        ]),
      ),
    };
    const manifest = {
      schema_version: 2,
      sdk_sha: sdkSha,
      runtime,
      clients: { typescript: describe("client.tar.gz") },
      helpers: {
        "windows-x64": Object.fromEntries(files.slice(2, 4).map((file) => [file, describe(file)])),
        "linux-x64": { "codex-bwrap-linux-x64": describe("codex-bwrap-linux-x64") },
      },
    };
    const signManifest = async (file, value) => {
      const content = Buffer.from(JSON.stringify(value));
      await writeFile(join(directory, file), content);
      await writeFile(join(directory, `${file}.sig`), fixture.sign(content));
    };
    await signManifest("sdk-dev-manifest.json", manifest);
    await signManifest("openagent-sdk-manifest.json", runtime);
    const verify = () => verifyDevelopmentKit(directory, sdkSha, { publicKey: fixture.publicKey });
    await verify();
    await writeFile(join(directory, "runtime"), "corrupt-bytes");
    await expect(verify()).rejects.toThrow("checksum mismatch");
    await writeFile(join(directory, "runtime"), bytes);
    await rm(join(directory, "codex-command-runner.exe"));
    await expect(verify()).rejects.toThrow();
    await writeFile(join(directory, "codex-command-runner.exe"), bytes);
    await signManifest("openagent-sdk-manifest.json", { ...runtime, protocol: { min: 2, max: 2 } });
    await expect(verify()).rejects.toThrow("Signed Runtime manifest disagrees");
    await signManifest("openagent-sdk-manifest.json", runtime);
    await signManifest("sdk-dev-manifest.json", {
      ...manifest,
      runtime: { ...runtime, artifacts: {} },
    });
    await expect(verify()).rejects.toThrow("Invalid artifact metadata");
    await signManifest("sdk-dev-manifest.json", manifest);
    await writeFile(
      join(directory, "sdk-dev-manifest.json"),
      JSON.stringify({ ...manifest, sdk_sha: "b".repeat(40) }),
    );
    await expect(verify()).rejects.toThrow("signature verification failed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
