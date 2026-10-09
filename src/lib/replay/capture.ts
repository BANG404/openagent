import type { CaptureAnchor, CaptureResult, CaptureSink } from "./captureTypes";
import type { Json, ReplayRecord } from "./types";
import { ReplayError } from "./types";
import { admitInitial } from "./chatAdmission";

import { CAPTURE_EVENTS } from "./chatCapabilities";
export { CAPTURE_EVENTS, CAPTURE_OPERATIONS, TRANSCRIPT_AFFORDANCES } from "./chatCapabilities";
const MAX_RECORD_BYTES = 16 * 1024 * 1024;
const MAX_QUEUED_BYTES = 1024 * 1024;
const MAX_RECORDS = 10000;
const SECRET_KEY =
  /^(?:authorization|cookie|set-cookie|password|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)$/i;

/** Reject credential fields before they can reach a journal; never repair a payload. */
export function privateCaptureJson(value: unknown): Json {
  const encoded = JSON.stringify(value, (key, item: unknown) => {
    if (SECRET_KEY.test(key)) throw new ReplayError("capture_incomplete", "credential-field");
    if (typeof item === "bigint" || typeof item === "function" || typeof item === "symbol")
      throw new ReplayError("capture_incomplete", "non-json-payload");
    if (typeof item === "number" && !Number.isFinite(item))
      throw new ReplayError("capture_incomplete", "non-json-payload");
    return item;
  });
  if (!encoded || new TextEncoder().encode(encoded).length > MAX_RECORD_BYTES)
    throw new ReplayError("capture_incomplete", "payload-byte-limit");
  return JSON.parse(encoded) as Json;
}

/** One consumer's observation order, with a bounded asynchronous append queue. */
export class FrontendCapture {
  readonly anchor: CaptureAnchor;
  private seq = 0;
  private committed = 0;
  private queuedBytes = 0;
  private chain: Promise<void> = Promise.resolve();
  private reasons = new Set<string>();
  private stopped = false;
  private pending = new Set<string>();
  private requestCounter = 0;
  private readonly started: number;

  constructor(
    anchor: CaptureAnchor,
    private readonly sink: CaptureSink,
    private readonly now: () => number = () => performance.now(),
  ) {
    admitInitial(anchor.initial);
    if (!anchor.idle || anchor.scope !== "consumer-observed" || !anchor.conversations.length)
      throw new ReplayError("capture_incomplete", "missing-idle-anchor");
    if (!anchor.subscriptions.length)
      throw new ReplayError("capture_incomplete", "missing-consumer-subscription");
    this.anchor = privateCaptureJson(anchor) as unknown as CaptureAnchor;
    this.started = now();
  }

  includes(conversation: unknown): boolean {
    return typeof conversation === "string" && this.anchor.conversations.includes(conversation);
  }

  invalidate(reason: string): void {
    this.reasons.add(reason);
  }

  record(
    kind: ReplayRecord["kind"],
    correlation: string,
    payload: unknown,
    causes: string[] = [],
  ): string | null {
    if (this.stopped) return null;
    if (this.seq >= MAX_RECORDS) {
      this.invalidate("record-limit");
      return null;
    }
    try {
      const record: ReplayRecord = {
        record_id: `r${this.seq + 1}`,
        producer: "frontend",
        epoch: 0,
        seq: this.seq + 1,
        kind,
        correlation,
        caused_by: causes,
        monotonic_offset_us: Math.max(0, Math.floor((this.now() - this.started) * 1000)),
        payload: privateCaptureJson(payload),
      };
      const bytes = new TextEncoder().encode(JSON.stringify(record)).length + 1;
      if (this.queuedBytes + bytes > MAX_QUEUED_BYTES) {
        this.invalidate("writer-overflow");
        return null;
      }
      this.seq += 1;
      this.queuedBytes += bytes;
      this.chain = this.chain
        .then(async () => {
          // A failed append makes every later record diagnostic-only.
          if (this.reasons.has("writer-failed")) return;
          await this.sink.append(record);
          this.committed = record.seq;
        })
        .catch(() => {
          this.invalidate("writer-failed");
        })
        .finally(() => {
          this.queuedBytes -= bytes;
        });
      return record.record_id;
    } catch (error) {
      this.invalidate(error instanceof ReplayError ? error.code : "serialization-failed");
      return null;
    }
  }

  begin(operation: string, input: unknown): { correlation: string; record: string | null } {
    const correlation = `q${++this.requestCounter}`;
    const record = this.record("request.begin", correlation, { operation, input });
    this.pending.add(correlation);
    return { correlation, record };
  }

  outcome(
    request: { correlation: string; record: string | null },
    output: unknown,
    rejected = false,
  ): void {
    this.pending.delete(request.correlation);
    this.record(
      rejected ? "request.reject" : "request.resolve",
      request.correlation,
      rejected
        ? { code: "recorded-operation-rejected" }
        : output === undefined
          ? { output: null, output_kind: "undefined" }
          : { output },
      request.record ? [request.record] : [],
    );
  }

  action(payload: unknown): void {
    this.record("action", `a${this.seq + 1}`, payload);
  }

  event(event: string, data: unknown): void {
    if (!CAPTURE_EVENTS.has(event)) {
      this.invalidate("unsupported-event");
      return;
    }
    if (data && typeof data === "object" && "mcp_ui" in data && data.mcp_ui !== undefined) {
      this.invalidate("unsupported-event-payload");
      return;
    }
    this.record("event.deliver", `e${this.seq + 1}`, { event, data });
  }

  async stop(deadlineMs = 2000): Promise<CaptureResult> {
    this.stopped = true;
    if (this.pending.size) this.invalidate("pending-requests");
    let deadline: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      this.chain,
      new Promise<void>((resolve) => {
        deadline = setTimeout(() => {
          this.invalidate("writer-timeout");
          resolve();
        }, deadlineMs);
      }),
    ]);
    if (deadline) clearTimeout(deadline);
    return { reasons: [...this.reasons].sort(), records: this.seq, committed_seq: this.committed };
  }
}
