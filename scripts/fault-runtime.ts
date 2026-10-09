import { lstat, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
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

export async function invokeRuntimeReplay(verb: "validate" | "replay" | "extract", args: string[]) {
  const root = fileURLToPath(new URL("../", import.meta.url));
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
      ...args,
    ],
    { cwd: sdkRoot, stdout: "pipe", stderr: "ignore" },
  );
  const reader = child.stdout.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 1024 * 1024) {
      child.kill();
      await reader.cancel();
      await child.exited;
      throw new ReplayError("runner_failed", "sdk-report-budget");
    }
    chunks.push(value);
  }
  const output = Buffer.concat(chunks).toString("utf8");
  const exit = await child.exited;
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
      "extracted",
      "invalid_case",
      "unsupported",
      "capture_incomplete",
      "runner_failed",
      "assertion_failed",
    ].includes(sdkReport.status) ||
    (sdkReport.status === (verb === "extract" ? "extracted" : "passed")) !== (exit === 0)
  )
    throw new ReplayError("runner_failed", "sdk-replay-report");
  const after = await sdkSource(sdkRoot);
  if (
    after.revision !== before.revision ||
    after.digest !== before.digest ||
    after.dirty !== before.dirty
  )
    throw new ReplayError("runner_failed", "sdk-source-changed");
  return {
    ...sdkReport,
    status: sdkReport.status,
    sdk_revision: before.revision,
    sdk_dirty: before.dirty,
    sdk_source_sha256: before.digest,
    source: "current-sdk-checkout",
  };
}
