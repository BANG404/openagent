import type { OpenAgentEventMap, OpenAgentOperationMap } from "./contracts";

export type OpenAgentOperation = keyof OpenAgentOperationMap;
export type OpenAgentEvent = keyof OpenAgentEventMap;
export type Unsubscribe = () => void;

export interface OpenAgentSubscriptionOptions {
  conversationId?: string;
  onError?: () => void;
}

export interface OpenAgentTransport {
  request<Operation extends OpenAgentOperation>(
    operation: Operation,
    request: OpenAgentOperationMap[Operation]["request"],
  ): Promise<OpenAgentOperationMap[Operation]["response"]>;

  subscribe<Event extends OpenAgentEvent>(
    event: Event,
    handler: (payload: OpenAgentEventMap[Event]) => void,
    options?: OpenAgentSubscriptionOptions,
  ): Promise<Unsubscribe>;
}
