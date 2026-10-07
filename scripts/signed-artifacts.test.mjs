import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signingFixture } from "../tests/fixtures/minisign.mjs";
import { downloadArtifact, fetchSignedManifest, verifySignedBytes } from "./signed-artifacts.mjs";

test("verifies the Tauri wrapper and rejects changed content, keys and trusted comments", async () => {
  const fixture = signingFixture();
  const bytes = Buffer.from('{"schema_version":2}');
  const signature = fixture.sign(bytes);
  expect(() => verifySignedBytes(bytes, signature, fixture.publicKey)).not.toThrow();
  expect(() => verifySignedBytes(Buffer.from("changed"), signature, fixture.publicKey)).toThrow(
    "signature verification failed",
  );
  expect(() => verifySignedBytes(bytes, signature, signingFixture().publicKey)).toThrow(
    "signing key",
  );
  const changedComment = Buffer.from(signature, "base64")
    .toString()
    .replace("timestamp:0", "timestamp:1");
  expect(() => verifySignedBytes(bytes, changedComment, fixture.publicKey)).toThrow(
    "signature verification failed",
  );
  const fetchRequest = async (url) =>
    new Response(String(url).endsWith(".sig") ? signature : bytes);
  const result = await fetchSignedManifest("https://example.test/manifest.json", {
    fetchRequest,
    publicKey: fixture.publicKey,
  });
  expect(result.manifest.schema_version).toBe(2);
});

test("resumes cached partial bytes and never refetches verified artifacts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openagent-download-"));
  try {
    const bytes = Buffer.from("complete-download");
    const artifact = {
      file: "runtime.exe",
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    await writeFile(join(directory, `${artifact.sha256}.partial`), bytes.subarray(0, 5));
    let requests = 0;
    const fetchRequest = async (_url, options) => {
      requests += 1;
      expect(options.headers.Range).toBe("bytes=5-");
      return new Response(bytes.subarray(5), {
        status: 206,
        headers: { "content-range": `bytes 5-${bytes.length - 1}/${bytes.length}` },
      });
    };
    const options = {
      artifact,
      manifestUrl: "https://example.test/manifest.json",
      cacheDirectory: directory,
      fetchRequest,
    };
    const output = await downloadArtifact(options);
    expect(await readFile(output)).toEqual(bytes);
    expect(await downloadArtifact(options)).toBe(output);
    expect(requests).toBe(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects corrupt artifacts before cache admission", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openagent-download-"));
  try {
    const bytes = Buffer.from("good");
    const artifact = {
      file: "runtime.exe",
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    await expect(
      downloadArtifact({
        artifact,
        manifestUrl: "https://example.test/manifest.json",
        cacheDirectory: directory,
        fetchRequest: async () => new Response("evil"),
      }),
    ).rejects.toThrow("checksum mismatch");
    await expect(readFile(join(directory, artifact.sha256))).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
