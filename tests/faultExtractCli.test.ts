import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("extraction requires independent assertions and preserves source and incident directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "openagent-extraction-cli-"));
  const capture = join(root, "capture");
  const checkout = join(root, "checkout");
  const assertions = join(root, "assertions.json");
  const output = join(root, "case.json");
  try {
    await mkdir(capture);
    await mkdir(checkout);
    await writeFile(join(checkout, ".git"), "gitdir: synthetic-checkout\n");
    const manifest = {
      capture_version: 1,
      target: "frontend",
      target_version: 1,
      session_id: "cli-fixture",
      anchor: {
        initial: {
          active_conversation: "A",
          conversations: [
            {
              id: "A",
              title: "Synthetic",
              messages: [{ id: "user", role: "user", content: "fixture", timestamp: 1 }],
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          streams: [],
        },
        conversations: ["A"],
        subscriptions: ["chat-chunk"],
        scope: "consumer-observed",
        idle: true,
      },
      finalized: true,
      completeness: "complete",
      reasons: [],
      records: 0,
      committed_seq: 0,
      journal_bytes: 0,
      journal_sha256: createHash("sha256").update("").digest("hex"),
    };
    for (const name of ["manifest.json", "finalized.json"])
      await writeFile(join(capture, name), JSON.stringify(manifest));
    await writeFile(join(capture, "records.jsonl"), "");
    const invoke = async (destination: string) => {
      const child = Bun.spawn(
        [
          process.execPath,
          "scripts/fault-extract.ts",
          "--capture",
          capture,
          "--assertions",
          assertions,
          "--out",
          destination,
          "--id",
          "cli-regression",
          "--private-reviewed",
        ],
        { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
      );
      const report = JSON.parse(await new Response(child.stdout).text()) as {
        status: string;
        code?: string;
      };
      return { report, exit: await child.exited };
    };
    await writeFile(
      assertions,
      JSON.stringify([
        { id: "user", path: ["conversations", "A", "message_ids"], equals: ["wrong"] },
      ]),
    );
    expect((await invoke(output)).report.status).toBe("assertion_failed");
    expect(await Bun.file(output).exists()).toBe(false);
    await writeFile(
      assertions,
      JSON.stringify([
        { id: "user", path: ["conversations", "A", "message_ids"], equals: ["user"] },
      ]),
    );
    for (const directory of [checkout, capture]) {
      const destination = join(directory, "case.json");
      expect((await invoke(destination)).report.code).toBe("private-output-boundary");
      expect(await Bun.file(destination).exists()).toBe(false);
    }
    expect(await invoke(output)).toMatchObject({ exit: 0, report: { status: "extracted" } });
    const original = await readFile(output, "utf8");
    expect((await invoke(output)).exit).not.toBe(0);
    expect(await readFile(output, "utf8")).toBe(original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
