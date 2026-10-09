import { ReplayError, jsonEqual, type Json, type ReplayCase, type ReplayReport } from "./types";
import { validateReplayCase, object, string } from "./validate";
import { ReplayTransport } from "./transport";

export interface ReplayTarget {
  action: (name: string, payload: Record<string, unknown>) => void;
  /** Drain released work only; pending scripted requests are permitted at gates. */
  drain: () => Promise<void>;
  observe: () => Json;
  finish: (allowedPending: string[]) => void;
  close: () => void;
}

export type ReplayTargetFactory = (
  initial: Json,
  transport: ReplayTransport,
  fixture: ReplayCase,
) => Promise<ReplayTarget>;

function atPath(value: unknown, path: string[]): unknown {
  for (const part of path) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

/** An explicit schedule, never wall-clock delays, releases external outcomes. */
export async function replayCase(
  input: unknown,
  createTarget: ReplayTargetFactory,
): Promise<ReplayReport> {
  const report: ReplayReport = {
    case_id: "unvalidated",
    target: "unvalidated",
    status: "runner_failed",
    assertions_passed: [],
    steps_completed: 0,
    coverage: "frontend-handlers",
  };
  let target: ReplayTarget | undefined;
  let transport: ReplayTransport | undefined;
  let fixture: ReplayCase;
  try {
    fixture = validateReplayCase(input);
    report.case_id = fixture.id;
    report.target = fixture.target;
    transport = new ReplayTransport(fixture.records);
    target = await createTarget(fixture.initial, transport, fixture);
    const records = new Map(fixture.records.map((record) => [record.record_id, record]));
    for (const step of fixture.schedule) {
      report.step = step.step;
      const record = step.record ? records.get(step.record)! : undefined;
      switch (step.do) {
        case "action": {
          const payload = object(record!.payload);
          target.action(string(payload.action), payload);
          break;
        }
        case "await-request":
          await target.drain();
          if (!transport.hasIssued(step.request!))
            throw new ReplayError("runner_failed", "request-gate-not-reached");
          break;
        case "resolve":
        case "reject":
          transport.release(record!);
          break;
        case "deliver":
          transport.deliver(record!);
          break;
        case "drain":
          await target.drain();
          break;
        case "assert": {
          await target.drain();
          const assertion = fixture.assertions.find(
            (assertion) => assertion.id === step.assertion,
          )!;
          report.assertion = assertion.id;
          if (!jsonEqual(atPath(target.observe(), assertion.path), assertion.equals)) {
            throw new ReplayError("assertion_failed", "observable-state-mismatch");
          }
          report.assertions_passed.push(assertion.id);
          delete report.assertion;
          break;
        }
      }
      transport.check();
      report.steps_completed += 1;
    }
    await target.drain();
    transport.check(fixture.allowed_pending);
    target.finish(fixture.allowed_pending);
    report.status = "passed";
    delete report.step;
  } catch (error) {
    report.status = error instanceof ReplayError ? error.status : "runner_failed";
    report.code = error instanceof ReplayError ? error.code : "target-failure";
  } finally {
    try {
      target?.close();
      transport?.close();
    } catch {
      report.status = "runner_failed";
      report.code = "cleanup-failure";
    }
  }
  return report;
}
