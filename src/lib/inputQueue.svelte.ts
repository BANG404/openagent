import type { OpenAgentClient } from "$lib/openagent";
import { createInputQueueProjection, type InputQueueProjectionState } from "./inputQueue";

export function createInputQueueController(client: OpenAgentClient) {
  const state = $state<InputQueueProjectionState>({
    snapshots: {},
    loading: {},
    errors: {},
    pending: {},
  });
  return createInputQueueProjection(client, state);
}
