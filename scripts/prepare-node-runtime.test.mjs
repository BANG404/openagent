import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  extractNodeArchive,
  nodeRelease,
  NODE_RELEASES,
  prepareNodeRuntime,
} from "./prepare-node-runtime.mjs";

describe("bundled plugin Node.js", () => {
  test("selects the requested target rather than the build runner's architecture", () => {
    expect(nodeRelease("x86_64-apple-darwin").archive).toContain("darwin-x64.tar.gz");
    expect(nodeRelease("aarch64-apple-darwin").archive).toContain("darwin-arm64.tar.gz");
    expect(nodeRelease("x86_64-pc-windows-msvc").member).toBe("node.exe");
    expect(() => nodeRelease("unreviewed-target")).toThrow("No bundled Node.js release");
    for (const release of Object.values(NODE_RELEASES))
      expect(release.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test("rejects altered downloads before extraction or installation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "openagent-node-digest-"));
    try {
      await expect(
        prepareNodeRuntime({
          repositoryRoot: root,
          target: "x86_64-pc-windows-msvc",
          fetchRequest: /** @type {typeof fetch} */ (async () => new Response("corrupt archive")),
        }),
      ).rejects.toThrow("SHA-256 does not match");
      await expect(
        readFile(path.join(root, "src-tauri/resources/node-runtime/node.exe")),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("reports a failed upstream download without a partial interpreter", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "openagent-node-network-"));
    try {
      await expect(
        prepareNodeRuntime({
          repositoryRoot: root,
          target: "x86_64-pc-windows-msvc",
          fetchRequest: /** @type {typeof fetch} */ (
            async () => new Response("unavailable", { status: 503 })
          ),
        }),
      ).rejects.toThrow("HTTP 503");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("extracts the interpreter and license without npm or other archive members", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "openagent-node-extract-"));
    const release = nodeRelease("x86_64-unknown-linux-gnu");
    const source = path.join(root, "source", release.directory);
    const destination = path.join(root, "destination");
    try {
      await mkdir(path.join(source, "bin"), { recursive: true });
      await mkdir(destination);
      await writeFile(path.join(source, "bin/node"), "fixture interpreter");
      await writeFile(path.join(source, "LICENSE"), "fixture license");
      await writeFile(path.join(source, "bin/npm"), "excluded package manager");
      const tar =
        process.platform === "win32"
          ? path.join(process.env.SystemRoot || "C:/Windows", "System32/tar.exe")
          : "tar";
      const archive = path.join(root, "fixture.tar");
      const result = spawnSync(tar, [
        "-cf",
        archive,
        "-C",
        path.dirname(source),
        release.directory,
      ]);
      expect(result.status).toBe(0);
      extractNodeArchive(archive, destination, release);
      expect(await readFile(path.join(destination, release.directory, "bin/node"), "utf8")).toBe(
        "fixture interpreter",
      );
      expect(await readFile(path.join(destination, release.directory, "LICENSE"), "utf8")).toBe(
        "fixture license",
      );
      await expect(
        readFile(path.join(destination, release.directory, "bin/npm")),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
