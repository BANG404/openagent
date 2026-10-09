import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readFrontendCapture } from "./fault-capture-files";
import { extractFrontendCase } from "../src/lib/replay/extract";
import { replayCase } from "../src/lib/replay/runner";
import { createChatReplayTarget } from "../src/lib/replay/chatTarget";
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
  const { manifest, records } = await readFrontendCapture(args[1]);
  const assertionsBytes = await readFile(resolve(args[3]));
  if (assertionsBytes.length > 16 * 1024 * 1024)
    throw new ReplayError("invalid_case", "assertion-byte-limit");
  const assertions = JSON.parse(assertionsBytes.toString("utf8")) as ReplayAssertion[];
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
    await writeFile(resolve(args[5]), encoded, { flag: "wx", mode: 0o600 });
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
