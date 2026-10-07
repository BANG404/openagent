import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

/** Extract the bounded public client's USTAR snapshot, rejecting links and all non-file entries.
 * @param {Uint8Array} archive
 * @param {string} destination
 */
export async function extractClientSnapshot(archive, destination) {
  const bytes = gunzipSync(archive, { maxOutputLength: 16 * 1024 * 1024 });
  const seen = new Set();
  const entries = [];
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const field = (start, length) =>
      header
        .subarray(start, start + length)
        .toString("utf8")
        .split("\0")[0];
    const checksum = header.reduce(
      (total, value, index) => total + (index >= 148 && index < 156 ? 32 : value),
      0,
    );
    if (checksum !== Number.parseInt(field(148, 8).trim(), 8)) {
      throw new Error("Client archive header checksum mismatch");
    }
    const prefix = field(345, 155);
    const name = `${prefix ? `${prefix}/` : ""}${field(0, 100)}`.replace(/\/$/, "");
    const parts = name.split("/");
    const type = field(156, 1);
    const size = Number.parseInt(field(124, 12).trim(), 8);
    if (
      parts.some((part) => !part || part === "." || part === ".." || /[\\:\x00-\x1f]/.test(part)) ||
      !["", "0", "5"].includes(type) ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      offset + 512 + size > bytes.length ||
      (type === "5" && size !== 0) ||
      seen.has(name) ||
      seen.size >= 20_000
    ) {
      throw new Error("Client archive contains an unsafe or unsupported entry");
    }
    seen.add(name);
    entries.push({
      name,
      directory: type === "5",
      content: bytes.subarray(offset + 512, offset + 512 + size),
    });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!seen.has("src/index.ts") || !seen.has("package.json")) {
    throw new Error("Client archive omitted its public entrypoint or package metadata");
  }
  for (const entry of entries) {
    const target = join(destination, entry.name);
    if (entry.directory) {
      await mkdir(target, { recursive: true });
    } else {
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, entry.content, { flag: "wx" });
    }
  }
}
