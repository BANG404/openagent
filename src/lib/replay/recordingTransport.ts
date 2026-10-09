import type {
  OpenAgentTransport,
  OpenAgentOperation,
  OpenAgentEvent,
  OpenAgentSubscriptionOptions,
  Unsubscribe,
} from "../openagent";
import type { OpenAgentOperationMap, OpenAgentEventMap } from "@openagent/client/contracts";
import { FrontendCapture, CAPTURE_OPERATIONS, TRANSCRIPT_AFFORDANCES } from "./capture";
import { duringFrontendEvent } from "./captureObservation";

function frontendOutput(operation: string, output: unknown): unknown {
  if (operation !== "get_renderable_checkpoints" || !Array.isArray(output)) return output;
  // These provider-context fields are not part of the frontend projection.
  return output.map((checkpoint) => {
    if (
      checkpoint.data.messages.some((message: Record<string, unknown>) => message.role === "system")
    )
      throw new Error("unsupported-checkpoint-context");
    return {
      ...checkpoint,
      data: {
        ...checkpoint.data,
        messages: checkpoint.data.messages.map((message: Record<string, unknown>) => {
          const { system_prompt: _prompt, tools: _tools, ...frontend } = message;
          return frontend;
        }),
      },
    };
  });
}

/** Decorates the existing boundary; values, callback order and errors stay intact. */
export class RecordingTransport implements OpenAgentTransport {
  capture: FrontendCapture | null = null;
  readonly subscriptions = new Map<string, number>();
  private inFlight = 0;

  constructor(private readonly transport: OpenAgentTransport) {}

  get idle(): boolean {
    return this.inFlight === 0;
  }

  request<Operation extends OpenAgentOperation>(
    operation: Operation,
    input: OpenAgentOperationMap[Operation]["request"],
  ): Promise<OpenAgentOperationMap[Operation]["response"]> {
    const capture = this.capture;
    const product =
      operation === "product.invoke_desktop"
        ? (input as OpenAgentOperationMap["product.invoke_desktop"]["request"])
        : null;
    const scoped = capture?.includes((input as { convId?: string }).convId ?? product?.args.convId);
    const observed = scoped && product && CAPTURE_OPERATIONS.has(product.operation);
    const submission = scoped && operation === "agent.submit_input";
    if (submission) {
      const args = input as OpenAgentOperationMap["agent.submit_input"]["request"];
      if (args.attachments?.length || args.contexts?.length || args.text.startsWith("/"))
        capture!.invalidate("unsupported-submission-input");
    }
    const affordance =
      scoped &&
      product &&
      (TRANSCRIPT_AFFORDANCES.has(product.operation) ||
        (product.operation === "update_conversation" &&
          (product.args.patch as { title_source?: string })?.title_source === "fallback"));
    if (scoped && !observed && !submission && !affordance)
      capture!.invalidate(`unsupported-operation:${product?.operation ?? operation}`);
    if (scoped && product?.operation === "set_chat_queue_pending" && product.args.pending === true)
      capture!.invalidate("queued-submission-capability");
    const request = observed ? capture!.begin(operation, input) : null;
    this.inFlight += 1;
    let result: Promise<OpenAgentOperationMap[Operation]["response"]>;
    try {
      result = this.transport.request(operation, input);
    } catch (error) {
      this.inFlight -= 1;
      if (submission || affordance) capture!.invalidate("unsupported-effect-rejection");
      if (request) capture!.outcome(request, null, true);
      throw error;
    }
    // Register before the consumer receives the promise. Never replace its error.
    return result.then(
      (output) => {
        if (
          submission &&
          !["run_completed", "run_accepted"].includes((output as { type?: string })?.type ?? "")
        )
          capture!.invalidate("unsupported-submission-outcome");
        // The frontend target excludes Runtime submission and host affordances.
        // Refuse outcomes that would require their own state transition adapters.
        if (
          scoped &&
          product?.operation === "get_file_changes" &&
          (!Array.isArray(output) || output.length > 0)
        )
          capture!.invalidate("file-changes-capability");
        if (request) {
          try {
            capture!.outcome(request, frontendOutput(product!.operation, output));
          } catch {
            capture!.invalidate("response-projection-failed");
          }
        }
        this.inFlight -= 1;
        return output;
      },
      (error: unknown) => {
        if (submission || affordance) capture!.invalidate("unsupported-effect-rejection");
        if (request) capture!.outcome(request, null, true);
        this.inFlight -= 1;
        throw error;
      },
    );
  }

  async subscribe<Event extends OpenAgentEvent>(
    event: Event,
    handler: (payload: OpenAgentEventMap[Event]) => void,
    options?: OpenAgentSubscriptionOptions,
  ): Promise<Unsubscribe> {
    if (this.capture) this.capture.invalidate("subscription-changed");
    const unsubscribe = await this.transport.subscribe(
      event,
      (payload) => {
        const capture = this.capture;
        const convId = (payload as unknown as { conv_id?: string }).conv_id;
        if (capture?.includes(convId)) capture.event(event, payload);
        duringFrontendEvent(() => handler(payload));
      },
      options
        ? {
            ...options,
            onError: () => {
              this.capture?.invalidate("subscription-error");
              options.onError?.();
            },
          }
        : undefined,
    );
    this.subscriptions.set(event, (this.subscriptions.get(event) ?? 0) + 1);
    return () => {
      this.capture?.invalidate("subscription-changed");
      this.subscriptions.set(event, (this.subscriptions.get(event) ?? 1) - 1);
      unsubscribe();
    };
  }

  invokeLocal<Response>(command: string, args?: Record<string, unknown>): Promise<Response> {
    if (!this.transport.invokeLocal) throw new Error("Local transport unavailable");
    return this.transport.invokeLocal(command, args);
  }
  listenLocal<Payload>(
    event: string,
    handler: (event: { payload: Payload }) => void,
  ): Promise<Unsubscribe> {
    if (!this.transport.listenLocal) throw new Error("Local transport unavailable");
    return this.transport.listenLocal<Payload>(event, (value) => {
      if (event === "runtime-resync-required") this.capture?.invalidate("consumer-resync");
      handler(value);
    });
  }
  emitLocal<Payload>(event: string, payload?: Payload): Promise<void> {
    if (!this.transport.emitLocal) throw new Error("Local transport unavailable");
    return this.transport.emitLocal(event, payload);
  }
}
