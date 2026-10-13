import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  extractTerminalTool,
  preparedTerminalToolsMatch,
  prepareTerminalTools,
} from "./prepare-terminal-tools.mjs";
import { TERMINAL_TOOLS, terminalToolRelease } from "./terminal-tool-releases.mjs";

describe("bundled terminal tools", () => {
  test("selects all tools for the requested shell target, using portable Linux binaries", () => {
    for (const target of [
      "x86_64-pc-windows-msvc",
      "x86_64-unknown-linux-gnu",
      "x86_64-apple-darwin",
      "aarch64-apple-darwin",
    ]) {
      for (const name of Object.keys(TERMINAL_TOOLS)) {
        const release = terminalToolRelease(name, target);
        expect(release.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(release.licenses.length).toBeGreaterThan(0);
        expect(release.archive).toContain(target.replace("linux-gnu", "linux-musl"));
      }
    }
    expect(() => terminalToolRelease("rg", "unreviewed-target")).toThrow(
      "No bundled terminal tool",
    );
  });

  test("rejects corrupted downloads and preserves the previous tool set on failure", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "openagent-tool-digest-"));
    const destination = path.join(root, "src-tauri/resources/terminal-tools");
    try {
      await mkdir(destination, { recursive: true });
      await writeFile(path.join(destination, "rg.exe"), "previous installation");
      await expect(
        prepareTerminalTools({
          repositoryRoot: root,
          target: "x86_64-pc-windows-msvc",
          fetchRequest: /** @type {typeof fetch} */ (async () => new Response("corrupt archive")),
        }),
      ).rejects.toThrow("SHA-256 does not match");
      expect(await readFile(path.join(destination, "rg.exe"), "utf8")).toBe(
        "previous installation",
      );
      await expect(readFile(path.join(destination, "fd.exe"))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rechecks cached executables and licenses, target and version pins", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "openagent-tool-cache-"));
    const target = "x86_64-pc-windows-msvc";
    const hash = createHash("sha256").update("fixture").digest("hex");
    /** @type {Record<string, {version: string; url: string; archiveSha256: string; files: Record<string, string>}>} */
    const tools = {};
    try {
      for (const name of Object.keys(TERMINAL_TOOLS)) {
        const release = terminalToolRelease(name, target);
        /** @type {Record<string, string>} */
        const files = {};
        for (const file of [
          release.executable,
          ...release.licenses.map((license) => `licenses/${name}/${license}`),
        ]) {
          const output = path.join(root, file);
          await mkdir(path.dirname(output), { recursive: true });
          await writeFile(output, "fixture");
          files[file] = hash;
        }
        tools[name] = {
          version: release.version,
          url: release.url,
          archiveSha256: release.sha256,
          files,
        };
      }
      const provenance = path.join(root, "provenance.json");
      await writeFile(provenance, JSON.stringify({ target, tools }));
      expect(await preparedTerminalToolsMatch(root, target)).toBe(true);
      expect(await preparedTerminalToolsMatch(root, "x86_64-apple-darwin")).toBe(false);
      await writeFile(path.join(root, "sd.exe"), "modified");
      expect(await preparedTerminalToolsMatch(root, target)).toBe(false);
      await writeFile(path.join(root, "sd.exe"), "fixture");
      await rm(path.join(root, "licenses/sd/LICENSE"));
      expect(await preparedTerminalToolsMatch(root, target)).toBe(false);
      await writeFile(path.join(root, "licenses/sd/LICENSE"), "fixture");
      tools.rg.archiveSha256 = "outdated pin";
      await writeFile(provenance, JSON.stringify({ target, tools }));
      expect(await preparedTerminalToolsMatch(root, target)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("extracts only the executable and license notices", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "openagent-tool-extract-"));
    const release = terminalToolRelease("sd", "x86_64-apple-darwin");
    const source = path.join(root, "source", release.directory);
    const destination = path.join(root, "destination");
    try {
      await mkdir(source, { recursive: true });
      await mkdir(destination);
      for (const file of [release.executable, ...release.licenses, "excluded-file"])
        await writeFile(path.join(source, file), file);
      const tar =
        process.platform === "win32"
          ? path.join(process.env.SystemRoot || "C:/Windows", "System32/tar.exe")
          : "tar";
      const archive = path.join(root, "fixture.tar");
      expect(
        spawnSync(tar, ["-cf", archive, "-C", path.dirname(source), release.directory]).status,
      ).toBe(0);
      extractTerminalTool(archive, destination, release);
      for (const file of [release.executable, ...release.licenses])
        expect(await readFile(path.join(destination, release.directory, file), "utf8")).toBe(file);
      await expect(
        readFile(path.join(destination, release.directory, "excluded-file")),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
