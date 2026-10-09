import type {
  OpenAgentTransport,
  OpenAgentOperation,
  OpenAgentEvent,
  OpenAgentSubscriptionOptions,
  Unsubscribe,
} from "../openagent";
import type { OpenAgentOperationMap, OpenAgentEventMap } from "@openagent/client/contracts";
import { FrontendCapture, CAPTURE_OPERATIONS } from "./capture";
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
    const scoped = capture?.includes(product?.args.convId);
    const observed = scoped && product && CAPTURE_OPERATIONS.has(product.operation);
    if (scoped && !observed) capture!.invalidate("unsupported-operation");
    const request = observed ? capture!.begin(operation, input) : null;
    this.inFlight += 1;
    let result: Promise<OpenAgentOperationMap[Operation]["response"]>;
    try {
      result = this.transport.request(operation, input);
    } catch (error) {
      this.inFlight -= 1;
      if (request) capture!.outcome(request, null, true);
      throw error;
    }
    // Register before the consumer receives the promise. Never replace its error.
    return result.then(
      (output) => {
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
