import { stat, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replayCase } from "../src/lib/replay/runner";
import { validateReplayCase } from "../src/lib/replay/validate";
import { createChatReplayTarget } from "../src/lib/replay/chatTarget";
import { ReplayError } from "../src/lib/replay/types";

const [verb, flag, path, ...extra] = process.argv.slice(2);
if (!["validate", "replay"].includes(verb) || flag !== "--case" || !path || extra.length) {
  process.stderr.write("Usage: bun scripts/fault-replay.ts validate|replay --case <case.json>\n");
  process.exit(2);
}
try {
  const file = resolve(path);
  if ((await stat(file)).size > 16 * 1024 * 1024)
    throw new ReplayError("invalid_case", "case-byte-limit");
  const bytes = await readFile(file);
  if (bytes.length > 16 * 1024 * 1024) throw new ReplayError("invalid_case", "case-byte-limit");
  const input: unknown = JSON.parse(bytes.toString("utf8"));
  const fixture = validateReplayCase(input);
  const report =
    verb === "validate"
      ? { case_id: fixture.id, target: fixture.target, status: "valid" }
      : await replayCase(fixture, createChatReplayTarget);
  const root = fileURLToPath(new URL("../", import.meta.url));
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const dirty = !!execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  process.stdout.write(
    `${JSON.stringify({ ...report, host_revision: revision, host_dirty: dirty })}\n`,
  );
  process.exitCode = report.status === "passed" || report.status === "valid" ? 0 : 1;
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({
      status: error instanceof ReplayError ? error.status : "invalid_case",
      code: error instanceof ReplayError ? error.code : "unreadable-case",
    })}\n`,
  );
  process.exitCode = 1;
}
