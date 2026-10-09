import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm, rmdir, symlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFrontendCapture } from "../scripts/fault-capture-files";
import { extractFrontendCase } from "../src/lib/replay/extract";

test("private extraction rejects interrupted journals, altered bytes and directory escapes", async () => {
  const root = await mkdtemp(join(tmpdir(), "openagent-capture-integrity-test-"));
  const alias = root + "-alias";
  const journal = '{"seq":1}\n';
  try {
    await writeFile(join(root, "manifest.json"), "{}");
    await expect(readFrontendCapture(root)).rejects.toMatchObject({
      status: "capture_incomplete",
      code: "unfinalized-capture",
    });
    await writeFile(join(root, "records.jsonl"), journal);
    await writeFile(
      join(root, "finalized.json"),
      JSON.stringify({
        journal_bytes: Buffer.byteLength(journal),
        journal_sha256: createHash("sha256").update(journal).digest("hex"),
      }),
    );
    expect((await readFrontendCapture(root)).records).toHaveLength(1);
    await writeFile(join(root, "records.jsonl"), journal.replace("1", "2"));
    await expect(readFrontendCapture(root)).rejects.toMatchObject({ code: "journal-integrity" });
    await symlink(root, alias, process.platform === "win32" ? "junction" : "dir");
    await expect(readFrontendCapture(alias)).rejects.toMatchObject({ status: "invalid_case" });
  } finally {
    if (process.platform === "win32") await rmdir(alias);
    else await rm(alias, { force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("an unfinalized or lost-watermark capture cannot become a full case", () => {
  for (const manifest of [
    { finalized: false, completeness: "incomplete", reasons: ["unfinalized"] },
    { finalized: true, completeness: "complete", reasons: [], committed_seq: 1, records: 2 },
  ]) {
    expect(() =>
      extractFrontendCase(
        { capture_version: 1, target: "frontend", target_version: 1, ...manifest } as never,
        [],
        "invalid",
        [],
      ),
    ).toThrow("unqualified-journal");
  }
});
