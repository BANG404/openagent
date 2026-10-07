import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { extractClientSnapshot } from "./extract-client-snapshot.mjs";

/** @param {string} name @param {string} type */
function archiveEntry(name, type) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100);
  header.write("0000000\0", 124, 8);
  header.fill(32, 148, 156);
  header.write(type, 156, 1);
  const checksum = header.reduce((total, byte) => total + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return gzipSync(Buffer.concat([header, Buffer.alloc(1024)]));
}

test("public client extraction rejects traversal, links, and decompression overflow", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openagent-client-extraction-"));
  try {
    for (const [name, type] of [
      ["../escape.ts", "0"],
      ["src/link.ts", "2"],
      ["C:/escape.ts", "0"],
    ]) {
      await expect(extractClientSnapshot(archiveEntry(name, type), directory)).rejects.toThrow(
        "unsafe",
      );
    }
    await expect(
      extractClientSnapshot(gzipSync(Buffer.alloc(16 * 1024 * 1024 + 1)), directory),
    ).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
