import type { CheckpointMessage, RenderableCheckpoint } from "$lib/types";

export const performanceConversationId = "conversation-performance";

export function performanceRecord(
  id: string,
  role: CheckpointMessage["role"],
  content: CheckpointMessage["content"],
): CheckpointMessage {
  return {
    id,
    role,
    content,
    status: "completed",
    timestamp: 1,
    first_token_at: null,
    completed_at: null,
    tags: [],
    system_prompt: null,
    tools: null,
  };
}

export function performanceBoundary(index: number): CheckpointMessage[] {
  return [
    performanceRecord(`divider-${index}`, "ui", [
      {
        type: "ui",
        ui: {
          version: 1,
          component: "builtin.divider",
          props: { label_key: "compactionCompleted" },
          fallback: "Context compacted",
        },
      },
    ]),
    {
      ...performanceRecord(`replay-${index}`, "user", [
        { type: "text", text: "PRIVATE_PERFORMANCE_REPLAY" },
      ]),
      tags: ["context_compaction"],
    },
  ];
}

export function performanceHistory(
  turns: number,
  payloadBytes: number,
  compactEvery: number,
): CheckpointMessage[] {
  return Array.from({ length: turns }, (_, index) => {
    const turn = index + 1;
    return [
      performanceRecord(`user-${turn}`, "user", [
        { type: "text", text: `Performance request ${turn}: ${"u".repeat(payloadBytes)}` },
      ]),
      performanceRecord(`assistant-${turn}`, "assistant", [
        { type: "reasoning", text: `Inspect turn ${turn}.` },
        {
          type: "tool_use",
          id: `call-${turn}`,
          name: "read_file",
          input: { path: `fixture-${turn}.txt` },
        },
      ]),
      performanceRecord(`tool-${turn}`, "user", [
        {
          type: "tool_result",
          tool_use_id: `call-${turn}`,
          content: [{ type: "text", text: "t".repeat(payloadBytes) }],
        },
      ]),
      performanceRecord(`answer-${turn}`, "assistant", [
        {
          type: "text",
          text: `Performance answer ${turn}.\n\n${"Synthetic conversation text. ".repeat(Math.ceil(payloadBytes / 29))}\n\n\`\`\`ts\nconst turn = ${turn};\n\`\`\``,
        },
      ]),
      ...(turn % compactEvery === 0 ? performanceBoundary(turn) : []),
    ];
  }).flat();
}

export function performanceCheckpoint(
  records: CheckpointMessage[],
  id = "performance-tip",
): RenderableCheckpoint {
  return {
    meta: {
      thread_id: performanceConversationId,
      checkpoint_id: id,
      parent_checkpoint_id: null,
      created_at: 1,
      metadata: "{}",
    },
    data: { format_version: 2, messages: records, file_change_ids: [], phase: "final_completed" },
    data_loaded: true,
  };
}
