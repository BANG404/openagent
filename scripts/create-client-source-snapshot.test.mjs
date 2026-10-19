import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClientSourceSnapshot } from "./create-client-source-snapshot.mjs";

test("both distribution paths produce a complete, buildable client source snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openagent-client-snapshot-"));
  try {
    await createClientSourceSnapshot(join(directory, "client.tar.gz"));
    const entries = execFileSync("tar", ["-tzf", "client.tar.gz"], {
      cwd: directory,
      encoding: "utf8",
    }).split(/\r?\n/);
    for (const entry of [
      "src/index.ts",
      "src/protocol.generated.ts",
      "package.json",
      "bun.lock",
      "tsconfig.json",
      "tsconfig.build.json",
      "README.md",
      "LICENSE",
    ]) {
      expect(entries).toContain(entry);
    }
    expect(entries.some((entry) => entry.startsWith("dist/"))).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
