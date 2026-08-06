// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { copyFileIfChanged } from "../scripts/copy-if-changed.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("copyFileIfChanged", () => {
  test("does not touch an identical destination", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "openagent-copy-if-changed-"));
    temporaryDirectories.push(directory);
    const source = path.join(directory, "source.exe");
    const destination = path.join(directory, "destination.exe");
    await writeFile(source, "same bytes");
    await writeFile(destination, "same bytes");
    const originalModifiedTime = (await stat(destination)).mtimeMs;

    expect(await copyFileIfChanged(source, destination)).toBe(false);
    expect((await stat(destination)).mtimeMs).toBe(originalModifiedTime);
  });

  test("creates or replaces a destination whose bytes differ", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "openagent-copy-if-changed-"));
    temporaryDirectories.push(directory);
    const source = path.join(directory, "source.exe");
    const destination = path.join(directory, "destination.exe");
    await writeFile(source, "new bytes");

    expect(await copyFileIfChanged(source, destination)).toBe(true);
    expect(await readFile(destination, "utf8")).toBe("new bytes");
    await writeFile(destination, "old bytes");
    expect(await copyFileIfChanged(source, destination)).toBe(true);
    expect(await readFile(destination, "utf8")).toBe("new bytes");
  });
});
