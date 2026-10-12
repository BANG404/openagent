import { expect, test } from "bun:test";
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { stageDevelopmentRuntime } from "./stage-development-runtime.mjs";

test("stages immutable development images and rejects corruption before publishing selection", async () => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "openagent-runtime-stage-"));
  try {
    const source = path.join(repositoryRoot, "built");
    const destination = path.join(repositoryRoot, "src-tauri/binaries/runtime");
    await writeFile(source, "first");
    const options = {
      repositoryRoot,
      targetTriple: "x86_64-unknown-linux-gnu",
      source,
      destination,
    };
    const first = await stageDevelopmentRuntime(options);
    expect(first.changed).toBe(true);
    expect((await stageDevelopmentRuntime(options)).changed).toBe(false);
    await writeFile(source, "second");
    const second = await stageDevelopmentRuntime(options);
    expect(second.developmentBinary).not.toBe(first.developmentBinary);
    expect(await readFile(first.developmentBinary, "utf8")).toBe("first");
    const selection = await readFile(`${destination}.selection.json`, "utf8");
    await writeFile(second.developmentBinary, "modified");
    await expect(stageDevelopmentRuntime(options)).rejects.toThrow("modified");
    expect(await readFile(`${destination}.selection.json`, "utf8")).toBe(selection);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("requires complete adjacent sandbox helpers before selecting a Runtime", async () => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "openagent-runtime-helper-stage-"));
  try {
    const source = path.join(repositoryRoot, "built.exe");
    const resourcesDirectory = path.join(repositoryRoot, "resources");
    const destination = path.join(repositoryRoot, "src-tauri/binaries/runtime.exe");
    await writeFile(source, "server");
    await mkdir(resourcesDirectory);
    const options = {
      repositoryRoot,
      source,
      destination,
      resourcesDirectory,
      targetTriple: "x86_64-pc-windows-msvc",
    };
    await expect(stageDevelopmentRuntime(options)).rejects.toThrow();
    expect(await readFile(`${destination}.selection.json`).catch(() => null)).toBeNull();
    for (const name of ["codex-command-runner.exe", "codex-windows-sandbox-setup.exe"])
      await writeFile(path.join(resourcesDirectory, name), name);
    const result = await stageDevelopmentRuntime(options);
    expect(
      await readFile(
        path.join(
          path.dirname(result.developmentBinary),
          "codex-resources/codex-command-runner.exe",
        ),
        "utf8",
      ),
    ).toBe("codex-command-runner.exe");
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test.skipIf(process.platform !== "win32")(
  "publishes new Runtime bytes while Windows locks the active fixed image",
  async () => {
    const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "openagent-runtime-locked-"));
    const source = path.join(repositoryRoot, "built.exe");
    const destination = path.join(repositoryRoot, "src-tauri/binaries/runtime.exe");
    const options = { repositoryRoot, targetTriple: "x86_64-pc-windows-msvc", source, destination };
    let child;
    try {
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(
        path.join(process.env.SystemRoot || "C:/Windows", "System32/ping.exe"),
        source,
      );
      const initial = await readFile(source);
      await stageDevelopmentRuntime(options);
      child = spawn(destination, ["-t", "127.0.0.1"], { stdio: "ignore", windowsHide: true });
      await new Promise((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      await appendFile(source, "new development build");
      const result = await stageDevelopmentRuntime(options);
      expect(result.changed).toBe(true);
      expect(await readFile(destination)).toEqual(initial);
      expect(await readFile(result.developmentBinary)).toEqual(await readFile(source));
    } finally {
      if (child && child.exitCode === null) {
        child.kill();
        await new Promise((resolve) => child.once("exit", resolve));
      }
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  },
);
