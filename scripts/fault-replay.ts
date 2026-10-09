import { lstat, readFile, realpath } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { validateReplayCase } from "../src/lib/replay/validate";
import { ReplayError } from "../src/lib/replay/types";

/** Metadata and source digest only; never print private patches or source. */
async function sdkSource(root: string) {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const patch = execFileSync("git", ["diff", "--binary", "HEAD"], {
    cwd: root,
    maxBuffer: 128 * 1024 * 1024,
  });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .sort();
  const hash = createHash("sha256");
  const add = (label: string, bytes: Uint8Array) => {
    hash
      .update(JSON.stringify([label, bytes.length]))
      .update("\0")
      .update(bytes);
  };
  add("revision", Buffer.from(revision));
  add("patch", patch);
  for (const name of untracked) {
    const file = resolve(root, name);
    const metadata = await lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 128 * 1024 * 1024)
      throw new ReplayError("runner_failed", "sdk-source-boundary");
    const bytes = await readFile(file);
    if (bytes.length > 128 * 1024 * 1024)
      throw new ReplayError("runner_failed", "sdk-source-boundary");
    add(name, bytes);
  }
  const dirty = !!execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return { revision, dirty, digest: hash.digest("hex") };
}

const [verb, flag, path, ...extra] = process.argv.slice(2);
if (!["validate", "replay"].includes(verb) || flag !== "--case" || !path || extra.length) {
  process.stderr.write("Usage: bun scripts/fault-replay.ts validate|replay --case <case.json>\n");
  process.exit(2);
}
try {
  const file = resolve(path);
  const metadata = await lstat(file);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (await realpath(file)) !== file)
    throw new ReplayError("invalid_case", "case-file-boundary");
  if (metadata.size > 16 * 1024 * 1024) throw new ReplayError("invalid_case", "case-byte-limit");
  const bytes = await readFile(file);
  if (bytes.length > 16 * 1024 * 1024) throw new ReplayError("invalid_case", "case-byte-limit");
  const input: unknown = JSON.parse(bytes.toString("utf8"));
  const root = fileURLToPath(new URL("../", import.meta.url));
  let report: { status: string; [key: string]: unknown };
  if (input && typeof input === "object" && "target" in input && input.target === "runtime") {
    const sdkRoot = resolve(root, "sdk");
    try {
      await lstat(resolve(sdkRoot, "Cargo.toml"));
    } catch {
      throw new ReplayError("unsupported", "sdk-replay-unavailable");
    }
    // Cargo rebuilds the current private checkout. Never launch an installed
    // server, prepared sidecar or fallback provider for an offline case.
    const before = await sdkSource(sdkRoot);
    const child = Bun.spawn(
      [
        "cargo",
        "run",
        "--quiet",
        "--manifest-path",
        resolve(sdkRoot, "Cargo.toml"),
        "--target-dir",
        resolve(sdkRoot, "target", "fault-replay", before.digest),
        "-p",
        "openagent-runtime",
        "--bin",
        "openagent-replay",
        "--",
        verb,
        "--case",
        file,
      ],
      { cwd: sdkRoot, stdout: "pipe", stderr: "ignore" },
    );
    const output = await new Response(child.stdout).text();
    const exit = await child.exited;
    if (output.length > 1024 * 1024) throw new ReplayError("runner_failed", "sdk-report-budget");
    let sdkReport: unknown;
    try {
      sdkReport = JSON.parse(output.trim());
    } catch {
      throw new ReplayError("runner_failed", "sdk-replay-command-failed");
    }
    if (
      !sdkReport ||
      typeof sdkReport !== "object" ||
      !("status" in sdkReport) ||
      typeof sdkReport.status !== "string" ||
      ![
        "passed",
        "invalid_case",
        "unsupported",
        "capture_incomplete",
        "runner_failed",
        "assertion_failed",
      ].includes(sdkReport.status) ||
      (sdkReport.status === "passed") !== (exit === 0)
    )
      throw new ReplayError("runner_failed", "sdk-replay-report");
    const after = await sdkSource(sdkRoot);
    if (
      after.revision !== before.revision ||
      after.digest !== before.digest ||
      after.dirty !== before.dirty
    )
      throw new ReplayError("runner_failed", "sdk-source-changed");
    report = {
      ...sdkReport,
      status: sdkReport.status,
      sdk_revision: before.revision,
      sdk_dirty: before.dirty,
      sdk_source_sha256: before.digest,
      source: "current-sdk-checkout",
    };
  } else {
    const [{ replayCase }, { createChatReplayTarget }] = await Promise.all([
      import("../src/lib/replay/runner"),
      import("../src/lib/replay/chatTarget"),
    ]);
    const fixture = validateReplayCase(input);
    report =
      verb === "validate"
        ? { case_id: fixture.id, target: fixture.target, status: "valid" }
        : { ...(await replayCase(fixture, createChatReplayTarget)) };
  }
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
