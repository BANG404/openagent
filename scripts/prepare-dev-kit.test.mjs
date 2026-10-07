import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signingFixture } from "../tests/fixtures/minisign.mjs";
import { immutableDevKitUrl, prepareDevKit, validateDevKit } from "./prepare-dev-kit.mjs";
import { usesSourceRuntime } from "./dev-with-runtime-server.mjs";

const sdkSha = "0123456789abcdef0123456789abcdef01234567";

test("prepares a complete, signed kit in a checkout with no private SDK", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openagent-public-kit-"));
  try {
    const source = join(directory, "fixture-client");
    await mkdir(join(source, "src"), { recursive: true });
    await writeFile(join(source, "src/index.ts"), "export const fixture = true;\n");
    await writeFile(join(source, "package.json"), '{"name":"fixture"}');
    const archive = join(directory, "client.tar.gz");
    execFileSync(
      "tar",
      ["--format=ustar", "-czf", "client.tar.gz", "-C", "fixture-client", "src", "package.json"],
      { cwd: directory },
    );
    const files = {
      "client.tar.gz": await readFile(archive),
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
      clients: { typescript: descriptor("client.tar.gz") },
      runtime: {
        sdk_sha: sdkSha,
        version: "1.0.0",
        protocol: { min: 2, max: 2 },
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
      expectedSdkSha: sdkSha,
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
    expect(
      await readFile(join(directory, ".cache/openagent-dev-kit/client/src/index.ts"), "utf8"),
    ).toContain("fixture = true");
    expect(
      JSON.parse(await readFile(join(directory, ".cache/openagent-dev-kit/lock.json"), "utf8"))
        .sdk_sha,
    ).toBe(sdkSha);
    await expect(readFile(join(directory, "sdk/Cargo.toml"))).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("pins public development to immutable SDK identities and never watches missing sources", () => {
  expect(immutableDevKitUrl(sdkSha)).toContain(`/runtime-dev-${sdkSha}/`);
  expect(usesSourceRuntime({})).toBe(false);
  expect(usesSourceRuntime({ OPENAGENT_DEV_RUNTIME_SOURCE: "1" })).toBe(true);
  expect(() =>
    validateDevKit({ schema_version: 2, sdk_sha: "different" }, sdkSha, "windows-x64"),
  ).toThrow("another SDK revision is never substituted");
});
