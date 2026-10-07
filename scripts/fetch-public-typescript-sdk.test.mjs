import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchPublicTypescriptSdk } from "./fetch-public-typescript-sdk.mjs";
import { signingFixture } from "../tests/fixtures/minisign.mjs";

test("downloads only the exact checksummed SDK snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openagent-public-sdk-"));
  try {
    const bytes = new TextEncoder().encode("public-sdk");
    const sdkSha = "0123456789abcdef0123456789abcdef01234567";
    const manifest = {
      schema_version: 1,
      sdk_sha: sdkSha,
      clients: {
        typescript: {
          file: "openagent-typescript-sdk.tar.gz",
          size: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      },
    };
    const fixture = signingFixture();
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    const fetchRequest = async (url) =>
      String(url).endsWith("sdk-dev-manifest.json")
        ? new Response(manifestBytes)
        : String(url).endsWith(".sig")
          ? new Response(fixture.sign(manifestBytes))
          : new Response(bytes);
    const output = join(directory, "sdk.tar.gz");
    await fetchPublicTypescriptSdk({
      expectedSdkSha: sdkSha,
      output,
      manifestUrl: "https://example.test/sdk-dev-manifest.json",
      fetchRequest,
      publicKey: fixture.publicKey,
    });
    expect(await readFile(output, "utf8")).toBe("public-sdk");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a development channel for a different SDK commit", async () => {
  const fixture = signingFixture();
  const bytes = Buffer.from(
    JSON.stringify({
      schema_version: 1,
      sdk_sha: "fedcba9876543210fedcba9876543210fedcba98",
    }),
  );
  const fetchRequest = async (url) =>
    new Response(String(url).endsWith(".sig") ? fixture.sign(bytes) : bytes);
  expect(
    fetchPublicTypescriptSdk({
      expectedSdkSha: "0123456789abcdef0123456789abcdef01234567",
      output: "unused.tar.gz",
      manifestUrl: "https://example.test/sdk-dev-manifest.json",
      fetchRequest,
      publicKey: fixture.publicKey,
    }),
  ).rejects.toThrow("expected 0123456789abcdef0123456789abcdef01234567");
});
