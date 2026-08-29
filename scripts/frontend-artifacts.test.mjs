import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createFrontendManifest } from "./frontend-artifacts.mjs";

test("builds bounded metadata for a frontend archive", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "openagent-frontend-manifest-"));
  try {
    const assets = path.join(root, "build");
    await mkdir(path.join(assets, "assets"), { recursive: true });
    await writeFile(path.join(assets, "index.html"), "<main>OpenAgent</main>");
    await writeFile(path.join(assets, "assets", "app.js"), "export {};");
    const archive = path.join(root, "openagent-frontend.tar.gz");
    await writeFile(archive, "archive bytes");

    const manifest = await createFrontendManifest({
      archive,
      assets,
      version: "0.51.0-beta.2",
      protocolVersion: 1,
    });

    expect(manifest.schema_version).toBe(1);
    expect(manifest.version).toBe("0.51.0-beta.2");
    expect(manifest.protocol).toEqual({ min: 1, max: 1 });
    expect(manifest.artifact.file).toBe("openagent-frontend.tar.gz");
    expect(manifest.artifact.files).toBe(2);
    expect(manifest.artifact.unpacked_size).toBe(32);
    expect(manifest.artifact.size).toBe(13);
    expect(manifest.artifact.sha256).toHaveLength(64);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
