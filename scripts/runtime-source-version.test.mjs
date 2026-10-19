import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRuntimeSourceVersion } from "./runtime-source-version.mjs";

test("source qualification reads inherited versions and historical standalone packages", async () => {
  const root = await mkdtemp(join(tmpdir(), "runtime-source-version-"));
  try {
    await mkdir(join(root, "rust/openagent-server"), { recursive: true });
    await writeFile(join(root, "Cargo.toml"), "[workspace]\nmembers = []\n");
    await writeFile(
      join(root, "rust/openagent-server/Cargo.toml"),
      '[package]\nversion = "0.1.1"\n',
    );
    expect(await readRuntimeSourceVersion(root)).toBe("0.1.1");
    await writeFile(join(root, "Cargo.toml"), '[workspace.package]\nversion = "4.1.0"\n');
    await writeFile(
      join(root, "rust/openagent-server/Cargo.toml"),
      "[package]\nversion.workspace = true\n",
    );
    expect(await readRuntimeSourceVersion(root)).toBe("4.1.0");
    await writeFile(join(root, "Cargo.toml"), '[workspace.package]\nversion = "invalid"\n');
    await expect(readRuntimeSourceVersion(root)).rejects.toThrow(
      "Missing declared Runtime release version",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
