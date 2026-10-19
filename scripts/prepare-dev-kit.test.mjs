import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signingFixture } from "../tests/fixtures/minisign.mjs";
import { immutableDevKitUrl, prepareDevKit, validateDevKit } from "./prepare-dev-kit.mjs";
import { usesSourceRuntime } from "./dev-with-runtime-server.mjs";

const sdkSha = "0123456789abcdef0123456789abcdef01234567";

test("prepares a signed Runtime kit without private source or any client archive", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openagent-public-kit-"));
  try {
    await mkdir(join(directory, "crates/openagent-protocol/src"), { recursive: true });
    await writeFile(
      join(directory, "crates/openagent-protocol/src/lib.rs"),
      "pub const SDK_PROTOCOL_VERSION: u32 = 3;\n",
    );
    const files = {
      "runtime.exe": Buffer.from("runtime-fixture"),
      "codex-windows-sandbox-setup.exe": Buffer.from("setup-fixture"),
      "codex-command-runner.exe": Buffer.from("runner-fixture"),
    };
    const descriptor = (file) => ({
      file,
      size: files[file].length,
      sha256: createHash("sha256").update(files[file]).digest("hex"),
    });
    const manifest = {
      schema_version: 2,
      sdk_sha: sdkSha,
      runtime: {
        sdk_sha: sdkSha,
        version: "1.0.0",
        protocol: { min: 3, max: 3 },
        artifacts: { "windows-x64": descriptor("runtime.exe") },
      },
      helpers: {
        "windows-x64": Object.fromEntries(
          ["codex-windows-sandbox-setup.exe", "codex-command-runner.exe"].map((file) => [
            file,
            descriptor(file),
          ]),
        ),
      },
    };
    const fixture = signingFixture();
    const bytes = Buffer.from(JSON.stringify(manifest));
    const fetchRequest = async (url) => {
      const name = new URL(url).pathname.split("/").at(-1);
      expect(name).not.toBe("client.tar.gz");
      return new Response(
        name === "sdk-dev-manifest.json"
          ? bytes
          : name.endsWith(".sig")
            ? fixture.sign(bytes)
            : files[name],
      );
    };
    await prepareDevKit({
      repositoryRoot: directory,
      expectedRuntimeSha: sdkSha,
      targetTriple: "x86_64-pc-windows-msvc",
      manifestUrl: "https://example.test/sdk-dev-manifest.json",
      publicKey: fixture.publicKey,
      fetchRequest,
    });
    expect(
      await readFile(
        join(directory, "src-tauri/binaries/openagent-server-x86_64-pc-windows-msvc.exe"),
        "utf8",
      ),
    ).toBe("runtime-fixture");
    await expect(
      readFile(join(directory, ".cache/openagent-dev-kit/client/src/index.ts")),
    ).rejects.toThrow();
    expect(
      JSON.parse(await readFile(join(directory, ".cache/openagent-dev-kit/lock.json"), "utf8"))
        .sdk_sha,
    ).toBe(sdkSha);
    await expect(readFile(join(directory, "runtime/Cargo.toml"))).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("admits the host Runtime protocol and rejects incompatible or malformed ranges", () => {
  const artifact = { file: "fixture", size: 1, sha256: "a".repeat(64) };
  const manifest = {
    schema_version: 2,
    sdk_sha: sdkSha,
    clients: { typescript: artifact },
    runtime: {
      sdk_sha: sdkSha,
      version: "1.0.0",
      protocol: { min: 3, max: 3 },
      artifacts: { "macos-arm64": artifact },
    },
  };
  expect(validateDevKit(manifest, sdkSha, "macos-arm64").runtime).toEqual(artifact);
  manifest.runtime.protocol = { min: 2, max: 3 };
  expect(validateDevKit(manifest, sdkSha, "macos-arm64").runtime).toEqual(artifact);
  for (const protocol of [
    { min: 2, max: 2 },
    { min: 4, max: 4 },
    { min: 4, max: 3 },
    { min: 0, max: 3 },
    { min: 2.5, max: 3 },
    { min: 3, max: 0x1_0000_0000 },
  ]) {
    manifest.runtime.protocol = protocol;
    expect(() => validateDevKit(manifest, sdkSha, "macos-arm64")).toThrow(
      "does not support desktop protocol 3",
    );
  }
});

test("client snapshot metadata never gates Runtime preparation", () => {
  const artifact = { file: "runtime", size: 1, sha256: "a".repeat(64) };
  for (const clients of [undefined, {}, { typescript: { file: "../invalid" } }]) {
    expect(
      validateDevKit(
        {
          schema_version: 2,
          sdk_sha: sdkSha,
          clients,
          runtime: {
            sdk_sha: sdkSha,
            version: "1.0.0",
            protocol: { min: 3, max: 3 },
            artifacts: { "macos-arm64": artifact },
          },
        },
        sdkSha,
        "macos-arm64",
      ),
    ).toEqual({ runtime: artifact, helpers: [] });
  }
});

test("pins public development to immutable SDK identities and never watches missing sources", () => {
  expect(immutableDevKitUrl(sdkSha)).toContain(`/runtime-dev-${sdkSha}/`);
  expect(usesSourceRuntime({})).toBe(false);
  expect(usesSourceRuntime({ OPENAGENT_DEV_RUNTIME_SOURCE: "1" })).toBe(true);
  expect(() =>
    validateDevKit({ schema_version: 2, sdk_sha: "different" }, sdkSha, "windows-x64"),
  ).toThrow("another Runtime revision is never substituted");
});
