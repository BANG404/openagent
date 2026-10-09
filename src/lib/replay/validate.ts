import { ReplayError, type Json, type ReplayCase } from "./types";

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const LIMITS = { bytes: 16 * 1024 * 1024, entries: 10000, depth: 40 };
const KINDS = ["request.begin", "request.resolve", "request.reject", "event.deliver", "action"];
const OPERATIONS = ["action", "await-request", "resolve", "reject", "deliver", "drain", "assert"];

function invalid(code: string): never {
  throw new ReplayError("invalid_case", code);
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("expected-object");
  return value as Record<string, unknown>;
}

export function string(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 512) invalid("expected-identity");
  return value;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > LIMITS.entries) invalid("expected-identities");
  return value.map(string);
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > LIMITS.entries) invalid("expected-array");
  return value;
}

function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    invalid("expected-nonnegative-integer");
  return value as number;
}

function fields(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid("unknown-field");
}

function validateJson(value: unknown, depth = 0): asserts value is Json {
  if (depth > LIMITS.depth) invalid("payload-depth-limit");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (!value || typeof value !== "object") invalid("non-json-value");
  if (Array.isArray(value)) {
    if (value.length > LIMITS.entries) invalid("payload-entry-limit");
    value.forEach((item) => validateJson(item, depth + 1));
  } else {
    if (Object.keys(value).length > LIMITS.entries) invalid("payload-entry-limit");
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) invalid("unsafe-property");
      validateJson(item, depth + 1);
    }
  }
}

/** Validate untrusted bundles before allocating a target or invoking current code. */
export function validateReplayCase(input: unknown): ReplayCase {
  validateJson(input);
  if (new TextEncoder().encode(JSON.stringify(input)).length > LIMITS.bytes)
    invalid("case-byte-limit");
  const source = object(input);
  fields(source, [
    "format_version",
    "target",
    "target_version",
    "id",
    "completeness",
    "allowed_pending",
    "initial",
    "records",
    "schedule",
    "assertions",
  ]);
  if (source.format_version !== 1 || source.target_version !== 1) {
    throw new ReplayError("unsupported", "schema-version");
  }
  if (source.target !== "frontend") throw new ReplayError("unsupported", "replay-target");
  string(source.id);
  if (!Object.hasOwn(source, "initial")) invalid("missing-initial-state");
  if (source.completeness !== "full" && source.completeness !== "prefix") {
    throw new ReplayError("capture_incomplete", "missing-completeness");
  }
  const allowedPending = strings(source.allowed_pending);
  if (source.completeness === "full" && allowedPending.length) invalid("full-case-pending-work");
  const ids = new Set<string>();
  const sequences = new Map<string, number>();
  const offsets = new Map<string, number>();
  const requests = new Set<string>();
  const outcomes = new Set<string>();
  const records = array(source.records).map((entry) => {
    const record = object(entry);
    fields(record, [
      "record_id",
      "producer",
      "epoch",
      "seq",
      "kind",
      "correlation",
      "caused_by",
      "monotonic_offset_us",
      "payload",
    ]);
    const id = string(record.record_id);
    if (ids.has(id)) invalid("duplicate-record");
    const scope = `${string(record.producer)}:${integer(record.epoch)}`;
    const seq = integer(record.seq);
    if (seq !== (sequences.get(scope) ?? 0) + 1) invalid("noncontiguous-records");
    sequences.set(scope, seq);
    const offset = integer(record.monotonic_offset_us);
    if (offset < (offsets.get(scope) ?? 0)) invalid("nonmonotonic-offset");
    offsets.set(scope, offset);
    const correlation = string(record.correlation);
    if (!KINDS.includes(string(record.kind))) throw new ReplayError("unsupported", "record-kind");
    const causes = strings(record.caused_by);
    if (causes.some((cause) => !ids.has(cause))) invalid("invalid-causal-link");
    if (!Object.hasOwn(record, "payload")) invalid("missing-payload");
    const payload = object(record.payload);
    if (record.kind === "request.begin") {
      if (requests.has(correlation)) invalid("duplicate-request");
      requests.add(correlation);
      string(payload.operation);
      if (!Object.hasOwn(payload, "input")) invalid("missing-request-input");
    }
    if (record.kind === "request.resolve" || record.kind === "request.reject") {
      if (!requests.has(correlation) || outcomes.has(correlation))
        invalid("invalid-request-outcome");
      outcomes.add(correlation);
      if (record.kind === "request.reject") string(payload.code);
      else if (!Object.hasOwn(payload, "output")) invalid("missing-request-output");
      if (
        payload.output_kind !== undefined &&
        (payload.output_kind !== "undefined" || payload.output !== null)
      )
        invalid("invalid-output-kind");
    }
    if (record.kind === "event.deliver") {
      string(payload.event);
      if (!Object.hasOwn(payload, "data")) invalid("missing-event-data");
    }
    if (record.kind === "action") string(payload.action);
    ids.add(id);
    return record;
  });
  if (allowedPending.some((id) => !requests.has(id))) invalid("unknown-pending-request");
  if ([...requests].some((id) => !outcomes.has(id) && !allowedPending.includes(id)))
    invalid("missing-request-outcome");
  const assertionIds = new Set<string>();
  for (const entry of array(source.assertions)) {
    const assertion = object(entry);
    fields(assertion, ["id", "path", "equals"]);
    const id = string(assertion.id);
    if (assertionIds.has(id)) invalid("duplicate-assertion");
    const path = strings(assertion.path);
    if (!path.length || path.some((part) => FORBIDDEN_KEYS.has(part)))
      invalid("unsafe-assertion-path");
    if (!Object.hasOwn(assertion, "equals")) invalid("missing-expectation");
    assertionIds.add(id);
  }
  if (!assertionIds.size) invalid("missing-assertions");
  const steps = new Set<string>();
  const usedRecords = new Set<string>();
  const usedAssertions = new Set<string>();
  const expectedKinds: Record<string, string> = {
    action: "action",
    resolve: "request.resolve",
    reject: "request.reject",
    deliver: "event.deliver",
  };
  for (const entry of array(source.schedule)) {
    const step = object(entry);
    fields(step, ["step", "do", "record", "request", "assertion", "after"]);
    const id = string(step.step);
    if (steps.has(id)) invalid("duplicate-step");
    const operation = string(step.do);
    if (!OPERATIONS.includes(operation)) throw new ReplayError("unsupported", "schedule-operation");
    if (strings(step.after).some((prior) => !steps.has(prior))) invalid("invalid-schedule-link");
    if (expectedKinds[operation]) {
      const recordId = string(step.record);
      const record = records.find((record) => record.record_id === recordId);
      if (!record || record.kind !== expectedKinds[operation] || usedRecords.has(recordId))
        invalid("invalid-scheduled-record");
      usedRecords.add(recordId);
    } else if (operation === "await-request") {
      if (!requests.has(string(step.request))) invalid("unknown-awaited-request");
    } else if (operation === "assert") {
      const assertionId = string(step.assertion);
      if (!assertionIds.has(assertionId)) invalid("unknown-assertion");
      usedAssertions.add(assertionId);
    }
    steps.add(id);
  }
  if ([...assertionIds].some((id) => !usedAssertions.has(id))) invalid("unexecuted-assertion");
  if (
    records.some(
      (record) => record.kind !== "request.begin" && !usedRecords.has(string(record.record_id)),
    )
  )
    invalid("unscheduled-record");
  return structuredClone(input) as unknown as ReplayCase;
}
