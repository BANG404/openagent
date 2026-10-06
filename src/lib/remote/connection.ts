import type { OpenAgentClient, RemoteConversationState } from "$lib/openagent";

interface ConnectionOptions {
  client: Pick<OpenAgentClient, "getRemoteConversationState" | "subscribeToConversationState">;
  activeConversationId: () => string | null;
  prepare: (preservePendingTurn: boolean) => void;
  loadHistory: (convId: string, isCurrent: () => boolean) => Promise<void>;
  applyInitialState: (state: RemoteConversationState) => void;
  applyState: (state: RemoteConversationState) => void;
  onConnected: () => void;
  onReconnecting: () => void;
  onError: (cause: unknown) => void;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}

/** A single SSE subscription, generation and reconnect timer for the remote page. */
export function createRemoteConnectionController(options: ConnectionOptions) {
  let disconnect: (() => void) | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let connectionGeneration = 0;
  let disposed = false;
  const schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay));
  const cancel = options.cancel ?? clearTimeout;

  function retire() {
    connectionGeneration += 1;
    if (reconnectTimer !== null) cancel(reconnectTimer);
    reconnectTimer = null;
    disconnect?.();
    disconnect = null;
  }

  function reset() {
    retire();
    reconnectAttempt = 0;
  }

  async function connect(convId: string, preservePendingTurn = false) {
    if (disposed) return;
    retire();
    const generation = connectionGeneration;
    if (!preservePendingTurn) reconnectAttempt = 0;
    const isCurrent = () => !disposed && generation === connectionGeneration;
    const isActive = () => isCurrent() && options.activeConversationId() === convId;
    options.prepare(preservePendingTurn);
    const [state] = await Promise.all([
      options.client.getRemoteConversationState(convId),
      options.loadHistory(convId, isCurrent),
    ]);
    if (!isCurrent()) return;
    options.applyInitialState(state);
    const unsubscribe = await options.client.subscribeToConversationState(
      convId,
      (nextState) => {
        if (!isActive()) return;
        reconnectAttempt = 0;
        options.applyState(nextState);
      },
      () => {
        if (isActive()) scheduleReconnect(convId, generation);
      },
    );
    if (!isActive()) {
      unsubscribe();
      return;
    }
    disconnect = unsubscribe;
    options.onConnected();
  }

  function scheduleReconnect(convId: string, generation: number): void {
    if (disposed || reconnectTimer !== null || generation !== connectionGeneration) return;
    const delay = Math.min(1000 * 2 ** reconnectAttempt, 10000);
    reconnectAttempt += 1;
    options.onReconnecting();
    reconnectTimer = schedule(() => {
      reconnectTimer = null;
      if (
        disposed ||
        generation !== connectionGeneration ||
        options.activeConversationId() !== convId
      )
        return;
      const retry = connect(convId, true);
      const retryGeneration = connectionGeneration;
      void retry.catch((cause) => {
        if (
          disposed ||
          retryGeneration !== connectionGeneration ||
          options.activeConversationId() !== convId
        )
          return;
        options.onError(cause);
        scheduleReconnect(convId, retryGeneration);
      });
    }, delay);
  }

  function dispose() {
    disposed = true;
    reset();
  }
  return { connect, reset, dispose };
}
