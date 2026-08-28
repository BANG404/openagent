// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { expect, test } from "bun:test";
import { buildTreeFromCheckpoints, computeActivePath } from "../src/lib/checkpointTree";

const message = (
  id: string,
  role: "user" | "assistant",
  content: Array<Record<string, unknown>>,
) => ({
  id,
  role,
  content,
  status: "completed",
  timestamp: role === "user" ? 10 : 20,
  first_token_at: role === "assistant" ? 20 : null,
  completed_at: role === "assistant" ? 30 : null,
  tags: [],
});

test("restores historical turn metadata and hides memory content", () => {
  const turn = {
    id: "assistant-1",
    input_message_id: "user-1",
    response_message_id: "assistant-1",
    status: "completed",
    started_at: 10,
    first_token_at: 20,
    completed_at: 30,
    duration_ms: 20,
  };
  const checkpoints = [
    {
      meta: {
        thread_id: "conv-1",
        checkpoint_id: "checkpoint-1",
        parent_checkpoint_id: null,
        metadata: JSON.stringify({ step: 1, tools_used: [], turn }),
        created_at: 30,
      },
      data: {
        messages: [
          message("user-1", "user", [
            { type: "memory", entries: ["private recalled context"] },
            { type: "text", text: "visible request" },
          ]),
          message("assistant-1", "assistant", [{ type: "text", text: "answer" }]),
        ],
        file_change_ids: [],
        phase: "final_completed",
      },
    },
  ];

  const path = computeActivePath(buildTreeFromCheckpoints(checkpoints));
  expect(path.map(({ content }) => content)).toEqual(["visible request", "answer"]);
  expect(path.find(({ id }) => id === "assistant-1")?.turn).toEqual(turn);
});

test("restores each assistant turn's owning checkpoint from a complete snapshot", () => {
  const firstTurn = {
    id: "assistant-1",
    input_message_id: "user-1",
    response_message_id: "assistant-1",
    status: "completed",
    started_at: 10,
    completed_at: 30,
    duration_ms: 20,
  };
  const secondTurn = {
    id: "assistant-2",
    input_message_id: "user-2",
    response_message_id: "assistant-2",
    status: "completed",
    started_at: 40,
    completed_at: 60,
    duration_ms: 20,
  };
  const firstMessages = [
    message("user-1", "user", [{ type: "text", text: "first request" }]),
    message("assistant-1", "assistant", [{ type: "text", text: "first reply" }]),
  ];
  const checkpoints = [
    {
      meta: {
        thread_id: "conv-1",
        checkpoint_id: "checkpoint-1",
        parent_checkpoint_id: null,
        metadata: JSON.stringify({ turn: firstTurn }),
        created_at: 30,
      },
      data: { messages: firstMessages, file_change_ids: [], phase: "final_completed" },
    },
    {
      meta: {
        thread_id: "conv-1",
        checkpoint_id: "checkpoint-2",
        parent_checkpoint_id: "checkpoint-1",
        metadata: JSON.stringify({ turn: secondTurn }),
        created_at: 60,
      },
      data: {
        messages: [
          ...firstMessages,
          message("user-2", "user", [{ type: "text", text: "second request" }]),
          message("assistant-2", "assistant", [{ type: "text", text: "second reply" }]),
        ],
        file_change_ids: [],
        phase: "final_completed",
      },
    },
  ];

  const path = computeActivePath(buildTreeFromCheckpoints(checkpoints));

  expect(path.find(({ id }) => id === "assistant-1")?.checkpointId).toBe("checkpoint-1");
  expect(path.find(({ id }) => id === "assistant-2")?.checkpointId).toBe("checkpoint-2");
});
