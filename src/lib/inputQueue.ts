import type {
  InputDelivery,
  InputQueueAction,
  InputQueueSnapshot,
  OpenAgentClient,
  SubmitAgentInputRequest,
} from "./openagent";
import { randomUuid } from "./uuid";

/** A projection of Runtime state. This controller never starts or dequeues a turn. */
export interface InputQueueProjectionState {
  snapshots: Record<string, InputQueueSnapshot>;
  loading: Record<string, boolean>;
  errors: Record<string, string>;
  pending: Record<string, number>;
}

export function createInputQueueProjection(
  client: Pick<OpenAgentClient, "getInputQueue" | "mutateInputQueue">,
  state: InputQueueProjectionState = { snapshots: {}, loading: {}, errors: {}, pending: {} },
) {
  const generations = new Map<string, number>();
  const loads = new Set<string>();
  const unacknowledged = new Map<string, { userMessageId: string; assistantMessageId: string }>();

  function accept(snapshot: InputQueueSnapshot) {
    const previous = state.snapshots[snapshot.convId];
    if (previous && previous.revision > snapshot.revision) return;
    state.snapshots = { ...state.snapshots, [snapshot.convId]: snapshot };
    state.errors = { ...state.errors, [snapshot.convId]: "" };
  }

  async function load(convId: string) {
    if (loads.has(convId)) return;
    loads.add(convId);
    const generation = (generations.get(convId) ?? 0) + 1;
    generations.set(convId, generation);
    state.loading = { ...state.loading, [convId]: !state.snapshots[convId] };
    try {
      const result = await client.getInputQueue(convId);
      if (generations.get(convId) === generation) accept(result);
    } catch (cause) {
      if (generations.get(convId) === generation) {
        state.errors = { ...state.errors, [convId]: String(cause) };
      }
    } finally {
      loads.delete(convId);
      if (generations.get(convId) === generation)
        state.loading = { ...state.loading, [convId]: false };
    }
  }

  async function mutate(convId: string, action: InputQueueAction) {
    state.pending = { ...state.pending, [convId]: (state.pending[convId] ?? 0) + 1 };
    generations.set(convId, (generations.get(convId) ?? 0) + 1);
    try {
      const result = await client.mutateInputQueue(convId, action);
      accept(result);
      return result;
    } catch (cause) {
      state.errors = { ...state.errors, [convId]: String(cause) };
      throw cause;
    } finally {
      state.pending = { ...state.pending, [convId]: Math.max(0, (state.pending[convId] ?? 1) - 1) };
      state.loading = { ...state.loading, [convId]: false };
    }
  }

  async function submit(
    input: SubmitAgentInputRequest,
    delivery: InputDelivery,
    expectedRunId?: string | null,
  ) {
    const key = JSON.stringify({ input, delivery, expectedRunId });
    let identity = unacknowledged.get(key);
    if (!identity) {
      identity = { userMessageId: randomUuid(), assistantMessageId: randomUuid() };
      unacknowledged.set(key, identity);
    }
    const result = await mutate(input.convId, {
      type: "add",
      input: { ...input, ...identity },
      delivery,
      expectedRunId,
    });
    unacknowledged.delete(key);
    return result;
  }

  return {
    get snapshots() {
      return state.snapshots;
    },
    get loading() {
      return state.loading;
    },
    get errors() {
      return state.errors;
    },
    get pending() {
      return state.pending;
    },
    accept,
    load,
    mutate,
    submit,
  };
}
