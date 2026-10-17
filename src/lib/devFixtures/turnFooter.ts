import {
  buildTreeFromCheckpoints,
  computeActivePath,
  selectActivePathToCheckpoint,
} from "../checkpointTree";
import { chatTaskUsagesByCheckpoint } from "../cacheUsage";
import type {
  ChatTaskUsage,
  CheckpointMessage,
  CheckpointTurnMetadata,
  RenderableCheckpoint,
} from "../types";

function record(
  id: string,
  role: "user" | "assistant",
  timestamp: number,
  completedAt: number | null = null,
): CheckpointMessage {
  return {
    id,
    role,
    content: [{ type: "text", text: id }],
    status: "completed",
    timestamp,
    first_token_at: role === "assistant" ? timestamp : null,
    completed_at: completedAt,
    tags: [],
    system_prompt: null,
    tools: null,
  };
}

function checkpoint(
  id: string,
  parent: string | null,
  messages: CheckpointMessage[],
  turn?: CheckpointTurnMetadata,
): RenderableCheckpoint {
  return {
    meta: {
      thread_id: "turn-footer-fixture",
      checkpoint_id: id,
      parent_checkpoint_id: parent,
      metadata: JSON.stringify({ turn }),
      created_at: messages.at(-1)!.completed_at ?? messages.at(-1)!.timestamp,
    },
    data: {
      messages,
      file_change_ids: [],
      phase: turn?.status === "running" ? "before_completion" : "final_completed",
    },
  };
}

function usage(
  checkpointId: string,
  createdAt: number,
  cached: number,
  input = 100,
  written = 0,
): ChatTaskUsage {
  return {
    checkpoint_id: checkpointId,
    created_at: createdAt,
    usage: {
      input_tokens: input,
      output_tokens: 10,
      total_tokens: input + 10,
      cached_input_tokens: cached,
      cache_creation_input_tokens: written,
      tool_use_prompt_tokens: 0,
      reasoning_tokens: 0,
    },
  };
}

export function turnFooterFixture(branch = false) {
  const first = [
    record("first-user", "user", 10_000),
    record("first-answer", "assistant", 10_200, 11_000),
  ];
  const second = [
    ...first,
    record("second-user", "user", 20_000),
    record("second-answer", "assistant", 20_400, 22_000),
  ];
  const alternate = [
    ...first,
    record("alternate-user", "user", 20_000),
    record("alternate-answer", "assistant", 20_600, 23_000),
  ];
  const toolStart: CheckpointTurnMetadata = {
    id: "tool-turn",
    input_message_id: "tool-user",
    response_message_id: "tool-response",
    status: "running",
    started_at: 30_000,
  };
  const toolEnd: CheckpointTurnMetadata = {
    ...toolStart,
    status: "completed",
    first_token_at: 30_300,
    completed_at: 34_000,
    duration_ms: 4_000,
  };
  const toolRecords = [
    ...second,
    record("tool-user", "user", 30_000),
    record("tool-response", "assistant", 30_300),
  ];
  const finished = [...toolRecords, record("tool-final-answer", "assistant", 33_000, 34_000)];
  const lastTurn: CheckpointTurnMetadata = {
    id: "last-turn",
    input_message_id: "last-user",
    response_message_id: "last-answer",
    status: "completed",
    started_at: 40_000,
    first_token_at: 40_500,
    completed_at: 45_000,
    duration_ms: 5_000,
  };
  const checkpoints = [
    checkpoint("first", null, first),
    checkpoint("second", "first", second),
    checkpoint("alternate", "first", alternate),
    checkpoint("tool-request", "second", toolRecords, toolStart),
    checkpoint("tool-output", "tool-request", finished, toolStart),
    checkpoint("tool-terminal", "tool-output", finished, toolEnd),
    checkpoint(
      "last",
      "tool-terminal",
      [
        ...finished,
        record("last-user", "user", 40_000),
        record("last-answer", "assistant", 40_500, 45_000),
      ],
      lastTurn,
    ),
  ];
  const tree = selectActivePathToCheckpoint(
    buildTreeFromCheckpoints(checkpoints),
    branch ? "alternate" : "last",
  );
  const messages = computeActivePath(tree);
  const usages = [
    usage("temporary-first", 10, 20),
    usage("temporary-first", 10, 70),
    usage("second", 20, 60),
    usage("alternate", 20, 20),
    usage("tool-request", 30, 80),
    usage("tool-output", 33, 90, 200, 20),
    usage("last", 40, 50),
    usage("last", 40, 0),
  ];
  return {
    tree,
    messages,
    usages: chatTaskUsagesByCheckpoint(
      usages,
      Object.values(tree.nodes).map(({ ckId, turn }) => ({ checkpointId: ckId, turn })),
      messages,
    ),
  };
}
