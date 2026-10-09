export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type ReplayStatus =
  | "passed"
  | "assertion_failed"
  | "invalid_case"
  | "capture_incomplete"
  | "unsupported"
  | "runner_failed";

export class ReplayError extends Error {
  constructor(
    readonly status: Exclude<ReplayStatus, "passed">,
    readonly code: string,
  ) {
    super(code);
  }
}

export interface ReplayRecord {
  record_id: string;
  producer: string;
  epoch: number;
  seq: number;
  kind: "request.begin" | "request.resolve" | "request.reject" | "event.deliver" | "action";
  correlation: string;
  caused_by: string[];
  monotonic_offset_us: number;
  payload: Json;
}

export interface ReplayStep {
  step: string;
  do: "action" | "await-request" | "resolve" | "reject" | "deliver" | "drain" | "assert";
  record?: string;
  request?: string;
  assertion?: string;
  after: string[];
}

export interface ReplayAssertion {
  id: string;
  path: string[];
  equals: Json;
}

export interface ReplayCase {
  format_version: 1;
  target: "frontend";
  target_version: 1;
  id: string;
  completeness: "full" | "prefix";
  allowed_pending: string[];
  initial: Json;
  records: ReplayRecord[];
  schedule: ReplayStep[];
  assertions: ReplayAssertion[];
}

export interface ReplayReport {
  case_id: string;
  target: string;
  status: ReplayStatus;
  step?: string;
  assertion?: string;
  code?: string;
  assertions_passed: string[];
  steps_completed: number;
  coverage: "frontend-handlers";
}

/** JSON equality ignores object insertion order but preserves array/chunk order. */
export function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, i) => jsonEqual(value, right[i]));
  }
  if (Array.isArray(left) || Array.isArray(right)) return false;
  if (left && right && typeof left === "object" && typeof right === "object") {
    const a = left as Record<string, unknown>;
    const b = right as Record<string, unknown>;
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && jsonEqual(a[key], b[key]))
    );
  }
  return false;
}
