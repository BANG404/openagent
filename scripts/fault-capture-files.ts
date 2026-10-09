import { lstat, readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import type { CaptureManifest } from "../src/lib/replay/captureTypes";
import type { ReplayRecord } from "../src/lib/replay/types";
import { ReplayError } from "../src/lib/replay/types";

async function containedFile(root: string, name: string, limit: number) {
  const path = join(root, name);
  const metadata = await lstat(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.size > limit ||
    (await realpath(path)) !== path
  )
    throw new ReplayError("invalid_case", "capture-file-boundary");
  const bytes = await readFile(path);
  if (bytes.length > limit) throw new ReplayError("invalid_case", "capture-byte-limit");
  return bytes;
}

/** Fixed local filenames only; finalized watermark and exact journal bytes must agree. */
export async function readFrontendCapture(directory: string) {
  const root = resolve(directory);
  if ((await lstat(root)).isSymbolicLink() || (await realpath(root)) !== root)
    throw new ReplayError("invalid_case", "capture-directory-boundary");
  let manifestBytes: Buffer;
  try {
    manifestBytes = await containedFile(root, "finalized.json", 16 * 1024 * 1024);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      throw new ReplayError("capture_incomplete", "unfinalized-capture");
    throw error;
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as CaptureManifest;
  const journal = await containedFile(root, "records.jsonl", 128 * 1024 * 1024);
  if (
    journal.length !== manifest.journal_bytes ||
    createHash("sha256").update(journal).digest("hex") !== manifest.journal_sha256
  )
    throw new ReplayError("capture_incomplete", "journal-integrity");
  const lines = journal.toString("utf8").split("\n");
  if (lines.pop() !== "" || lines.length > 10000)
    throw new ReplayError("capture_incomplete", "journal-tail-or-count");
  const records = lines.map((line) => JSON.parse(line)) as ReplayRecord[];
  return { manifest, records };
}
