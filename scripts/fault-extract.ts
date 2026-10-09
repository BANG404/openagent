import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { invokeRuntimeReplay } from "./fault-runtime";
import { readFrontendCapture } from "./fault-capture-files";
import { ReplayError, type ReplayAssertion } from "../src/lib/replay/types";

const args = process.argv.slice(2);
if (
  args.length !== 9 ||
  args[0] !== "--capture" ||
  args[2] !== "--assertions" ||
  args[4] !== "--out" ||
  args[6] !== "--id" ||
  args[8] !== "--private-reviewed"
) {
  process.stderr.write(
    "Usage: bun scripts/fault-extract.ts --capture <directory> --assertions <json> --out <case.json> --id <case-id> --private-reviewed\n",
  );
  process.exit(2);
}
try {
  const directory = resolve(args[1]);
  const headerPath = join(directory, "manifest.json");
  const headerMetadata = await lstat(headerPath);
  if (
    !headerMetadata.isFile() ||
    headerMetadata.isSymbolicLink() ||
    headerMetadata.size > 16 * 1024 * 1024 ||
    (await realpath(headerPath)) !== headerPath
  )
    throw new ReplayError("invalid_case", "capture-manifest-boundary");
  const headerBytes = await readFile(headerPath);
  if (headerBytes.length > 16 * 1024 * 1024)
    throw new ReplayError("invalid_case", "capture-manifest-budget");
  const header: unknown = JSON.parse(headerBytes.toString("utf8"));
  if (header && typeof header === "object" && "target" in header && header.target === "runtime") {
    const report = await invokeRuntimeReplay("extract", args);
    process.stdout.write(JSON.stringify(report) + "\n");
    process.exit(report.status === "extracted" ? 0 : 1);
  }
  if (
    !header ||
    typeof header !== "object" ||
    !("target" in header) ||
    header.target !== "frontend"
  )
    throw new ReplayError("unsupported", "capture-target");
  const { manifest, records } = await readFrontendCapture(args[1]);
  const assertionsBytes = await readFile(resolve(args[3]));
  if (assertionsBytes.length > 16 * 1024 * 1024)
    throw new ReplayError("invalid_case", "assertion-byte-limit");
  const assertions = JSON.parse(assertionsBytes.toString("utf8")) as ReplayAssertion[];
  const [{ extractFrontendCase }, { replayCase }, { createChatReplayTarget }] = await Promise.all([
    import("../src/lib/replay/extract"),
    import("../src/lib/replay/runner"),
    import("../src/lib/replay/chatTarget"),
  ]);
  const fixture = extractFrontendCase(manifest, records, args[7], assertions);
  const encoded = JSON.stringify(fixture, null, 2) + "\n";
  if (Buffer.byteLength(encoded) > 16 * 1024 * 1024)
    throw new ReplayError("unsupported", "inline-case-byte-limit");
  const report = await replayCase(fixture, createChatReplayTarget);
  if (report.status !== "passed") {
    process.stdout.write(JSON.stringify(report) + "\n");
    process.exitCode = 1;
  } else {
    // An explicit local private output only. Existing files are never overwritten.
    const output = resolve(args[5]);
    const parent = await realpath(dirname(output));
    if (
      parent === directory ||
      parent.startsWith(directory + (process.platform === "win32" ? "\\" : "/"))
    )
      throw new ReplayError("invalid_case", "private-output-boundary");
    for (let ancestor = parent; ; ancestor = dirname(ancestor)) {
      const git = await lstat(join(ancestor, ".git")).catch((error: unknown) => {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
          return null;
        throw error;
      });
      if (git) throw new ReplayError("invalid_case", "private-output-boundary");
      if (dirname(ancestor) === ancestor) break;
    }
    await writeFile(join(parent, basename(output)), encoded, { flag: "wx", mode: 0o600 });
    process.stdout.write(
      JSON.stringify({
        status: "extracted",
        case_id: fixture.id,
        records: records.length,
        coverage: report.coverage,
      }) + "\n",
    );
  }
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      status: error instanceof ReplayError ? error.status : "invalid_case",
      code: error instanceof ReplayError ? error.code : "capture-extraction-failed",
    }) + "\n",
  );
  process.exitCode = 1;
}
