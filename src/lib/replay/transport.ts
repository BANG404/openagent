import type {
  OpenAgentTransport,
  OpenAgentOperation,
  OpenAgentEvent,
  Unsubscribe,
  OpenAgentSubscriptionOptions,
} from "../openagent";
import type { OpenAgentOperationMap, OpenAgentEventMap } from "@openagent/client/contracts";
import { ReplayError, jsonEqual, type ReplayRecord } from "./types";
import { object, string } from "./validate";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/** No fallback transport: every request and event must belong to the fixture. */
export class ReplayTransport implements OpenAgentTransport {
  private readonly begins: ReplayRecord[];
  private cursor = 0;
  private pending = new Map<string, PendingRequest>();
  private issued = new Set<string>();
  private handlers = new Map<string, Set<(payload: unknown) => void>>();
  private fault?: ReplayError;

  constructor(records: ReplayRecord[]) {
    this.begins = records.filter((record) => record.kind === "request.begin");
  }

  request<Operation extends OpenAgentOperation>(
    operation: Operation,
    input: OpenAgentOperationMap[Operation]["request"],
  ): Promise<OpenAgentOperationMap[Operation]["response"]> {
    const record = this.begins[this.cursor];
    const payload = record ? object(record.payload) : undefined;
    if (!record || payload?.operation !== operation || !jsonEqual(payload.input, input)) {
      this.fault = new ReplayError("runner_failed", "unexpected-request");
      // Product code may catch the rejection; the runner still rejects the case.
      return Promise.reject(this.fault);
    }
    this.cursor += 1;
    this.issued.add(record.correlation);
    return new Promise((resolve, reject) => {
      this.pending.set(record.correlation, {
        resolve: (value) =>
          resolve(structuredClone(value) as OpenAgentOperationMap[Operation]["response"]),
        reject,
      });
    });
  }

  async subscribe<Event extends OpenAgentEvent>(
    event: Event,
    handler: (payload: OpenAgentEventMap[Event]) => void,
    _options?: OpenAgentSubscriptionOptions,
  ): Promise<Unsubscribe> {
    const handlers = this.handlers.get(event) ?? new Set();
    const receive = (payload: unknown) => handler(payload as OpenAgentEventMap[Event]);
    handlers.add(receive);
    this.handlers.set(event, handlers);
    return () => {
      handlers.delete(receive);
    };
  }

  hasIssued(id: string): boolean {
    return this.issued.has(id);
  }

  release(record: ReplayRecord): void {
    const request = this.pending.get(record.correlation);
    if (!request) throw new ReplayError("runner_failed", "outcome-before-request");
    this.pending.delete(record.correlation);
    const payload = object(record.payload);
    if (record.kind === "request.reject") request.reject(new Error(string(payload.code)));
    else request.resolve(payload.output);
  }

  deliver(record: ReplayRecord): void {
    const payload = object(record.payload);
    const handlers = this.handlers.get(string(payload.event));
    if (!handlers?.size) throw new ReplayError("runner_failed", "event-without-subscription");
    for (const handler of handlers) handler(structuredClone(payload.data));
  }

  check(allowedPending?: string[]): void {
    if (this.fault) throw this.fault;
    if (!allowedPending) return;
    if (this.cursor !== this.begins.length)
      throw new ReplayError("runner_failed", "unissued-request");
    if (!jsonEqual([...this.pending.keys()].sort(), [...allowedPending].sort())) {
      throw new ReplayError("runner_failed", "unresolved-request");
    }
  }

  close(): void {
    this.handlers.clear();
    for (const request of this.pending.values()) request.reject(new Error("replay-disposed"));
    this.pending.clear();
  }
}
