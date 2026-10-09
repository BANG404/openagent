import type { CaptureManifest } from "./captureTypes";
import type { ReplayAssertion, ReplayCase, ReplayRecord, ReplayStep } from "./types";
import { ReplayError } from "./types";
import { validateReplayCase } from "./validate";
import { admitChatCase } from "./chatAdmission";

/** Extraction creates gates from observation order, never expectations from outputs. */
export function extractFrontendCase(
  manifest: CaptureManifest,
  records: ReplayRecord[],
  id: string,
  assertions: ReplayAssertion[],
): ReplayCase {
  if (
    manifest.capture_version !== 1 ||
    manifest.target_version !== 1 ||
    manifest.target !== "frontend"
  )
    throw new ReplayError("unsupported", "capture-version");
  if (
    !manifest.finalized ||
    manifest.completeness !== "complete" ||
    manifest.reasons.length ||
    manifest.committed_seq !== records.length ||
    manifest.records !== records.length
  )
    throw new ReplayError("capture_incomplete", "unqualified-journal");
  const schedule: ReplayStep[] = [];
  const add = (step: Omit<ReplayStep, "step" | "after">) => {
    schedule.push({
      ...step,
      step: `s${schedule.length + 1}`,
      after: schedule.length ? [`s${schedule.length}`] : [],
    });
  };
  for (const record of records) {
    if (record.kind === "request.begin") add({ do: "await-request", request: record.correlation });
    else
      add({
        do:
          record.kind === "action"
            ? "action"
            : record.kind === "event.deliver"
              ? "deliver"
              : record.kind === "request.reject"
                ? "reject"
                : "resolve",
        record: record.record_id,
      });
  }
  for (const assertion of assertions) add({ do: "assert", assertion: assertion.id });
  const fixture = validateReplayCase({
    format_version: 1,
    target: "frontend",
    target_version: 1,
    id,
    completeness: "full",
    allowed_pending: [],
    initial: manifest.anchor.initial,
    records,
    schedule,
    assertions,
  });
  admitChatCase(fixture);
  return fixture;
}
