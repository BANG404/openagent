import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { packBuildArtifacts, verifyBuildArtifacts } from "./release-build-artifacts.mjs";

/** @type {string[]} */
const directories = [];
const identity = { desktop_sha: "1".repeat(40), sdk_sha: "2".repeat(40), version: "1.2.3" };
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(kind = "frontend", target = "") {
  const root = await mkdtemp(path.join(os.tmpdir(), "openagent-build-artifacts-"));
  directories.push(root);
  const repositoryRoot = path.join(root, "source");
  const directory = path.join(root, "artifact");
  const files =
    kind === "frontend"
      ? ["build/index.html", "build/_app/app.js", ".cache/bootstrap-dist/index.html"]
      : [
          "src-tauri/target/release/openagent.exe",
          "src-tauri/target/release/webview.dll",
          "src-tauri/resources/node-runtime/provenance.json",
          "src-tauri/resources/node-runtime/node.exe",
          "src-tauri/resources/terminal-tools/provenance.json",
          "src-tauri/resources/terminal-tools/rg.exe",
        ];
  for (const file of files) {
    await mkdir(path.dirname(path.join(repositoryRoot, file)), { recursive: true });
    await writeFile(path.join(repositoryRoot, file), `original:${file}`);
  }
  const options = {
    repositoryRoot,
    directory,
    kind,
    target,
    identity,
    cacheKey: "exact-source-and-toolchain",
  };
  await packBuildArtifacts(options);
  return { ...options, root, files };
}

describe("qualified build artifact reuse", () => {
  test("restores the same frontend and bootstrap without shipping source or SDK output", async () => {
    const fixtureOptions = await fixture();
    const destination = path.join(fixtureOptions.root, "restored");
    const manifest = await verifyBuildArtifacts({
      ...fixtureOptions,
      repositoryRoot: destination,
      restore: true,
    });
    expect(manifest.files.map((/** @type {{file: string}} */ file) => file.file).sort()).toEqual(
      fixtureOptions.files.sort(),
    );
    expect(await readFile(path.join(destination, "build/index.html"), "utf8")).toBe(
      "original:build/index.html",
    );
    expect(
      await readFile(path.join(destination, ".cache/bootstrap-dist/index.html"), "utf8"),
    ).toContain("original:");
  });

  test("rejects another desktop, SDK, version, toolchain key or artifact kind", async () => {
    const options = await fixture();
    for (const replacement of [
      { identity: { ...identity, desktop_sha: "3".repeat(40) } },
      { identity: { ...identity, sdk_sha: "3".repeat(40) } },
      { identity: { ...identity, version: "1.2.4" } },
      { cacheKey: "different-toolchain" },
      { kind: "shell", target: "windows-x64" },
    ])
      await expect(verifyBuildArtifacts({ ...options, ...replacement })).rejects.toThrow(
        /identity mismatch/,
      );
  });

  test("checks every byte before writing a destination", async () => {
    const options = await fixture();
    await writeFile(path.join(options.directory, "payload/build/index.html"), "tampered");
    const destination = path.join(options.root, "destination");
    await expect(
      verifyBuildArtifacts({ ...options, repositoryRoot: destination, restore: true }),
    ).rejects.toThrow(/digest mismatch/);
    await expect(stat(destination)).rejects.toThrow();
  });

  test("rejects edits to restored assets before native compilation", async () => {
    const options = await fixture();
    await verifyBuildArtifacts({ ...options, installed: true });
    await writeFile(
      path.join(options.repositoryRoot, ".cache/bootstrap-dist/index.html"),
      "edited bootstrap",
    );
    await expect(verifyBuildArtifacts({ ...options, installed: true })).rejects.toThrow(
      /Installed build artifact digest mismatch/,
    );
  });

  test("rejects missing, undeclared, duplicate and escaping paths", async () => {
    for (const change of ["missing", "extra", "duplicate", "escape"]) {
      const options = await fixture();
      const manifestPath = path.join(options.directory, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (change === "missing")
        manifest.files = manifest.files.filter(
          (/** @type {{file: string}} */ file) => file.file !== "build/index.html",
        );
      if (change === "extra")
        await writeFile(path.join(options.directory, "payload/build/unexpected.js"), "extra");
      if (change === "duplicate") manifest.files.push(manifest.files[0]);
      if (change === "escape") manifest.files[0].file = "build/../../outside";
      await writeFile(manifestPath, JSON.stringify(manifest));
      await expect(verifyBuildArtifacts(options)).rejects.toThrow();
    }
  });

  test("hands off only the compiled shell, DLLs and portable resources", async () => {
    const options = await fixture("shell", "windows-x64");
    const destination = path.join(options.root, "restored");
    await verifyBuildArtifacts({ ...options, repositoryRoot: destination, restore: true });
    expect(
      await readFile(path.join(destination, "src-tauri/target/release/openagent.exe"), "utf8"),
    ).toContain("original:");
    await expect(verifyBuildArtifacts({ ...options, target: "linux-x64" })).rejects.toThrow(
      /identity mismatch/,
    );
  });

  test.skipIf(process.platform === "win32")(
    "rejects symlinks and restores executable permission",
    async () => {
      const options = await fixture();
      await symlink(
        path.join(options.repositoryRoot, "build/index.html"),
        path.join(options.directory, "payload/build/link"),
      );
      await expect(verifyBuildArtifacts(options)).rejects.toThrow(/symlink/);
      await rm(path.join(options.directory, "payload/build/link"));
      await chmod(path.join(options.repositoryRoot, "build/_app/app.js"), 0o755);
      await packBuildArtifacts(options);
      const destination = path.join(options.root, "restored");
      await verifyBuildArtifacts({ ...options, repositoryRoot: destination, restore: true });
      expect((await stat(path.join(destination, "build/_app/app.js"))).mode & 0o777).toBe(0o755);
    },
  );
});
