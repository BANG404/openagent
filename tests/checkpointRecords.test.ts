// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { checkpointRecordsToMessages } from "../src/lib/checkpointTree";

const record = (overrides) => ({
  id: crypto.randomUUID(),
  role: "assistant",
  content: [],
  status: "completed",
  timestamp: 0,
  first_token_at: null,
  completed_at: null,
  tags: [],
  system_prompt: null,
  tools: null,
  ...overrides,
});

describe("checkpoint record projection", () => {
  test("preserves ordered reasoning and joins a persisted tool result", () => {
    const messages = checkpointRecordsToMessages(
      [
        record({
          id: "assistant-1",
          content: [
            { type: "reasoning", text: "checking" },
            { type: "tool_use", id: "tool-1", name: "read_file", input: { path: "a.txt" } },
          ],
        }),
        record({
          id: "result-1",
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tool-1", content: [{ type: "text", text: "ok" }] },
          ],
        }),
      ],
      "checkpoint-1",
      "conversation-1",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].items).toEqual([
      { type: "thinking", content: "checking" },
      {
        type: "tool_call",
        name: "read_file",
        args: '{"path":"a.txt"}',
        toolUseId: "tool-1",
        result: "ok",
      },
    ]);
  });

  test("restores structured and image tool results without blank output", () => {
    const messages = checkpointRecordsToMessages(
      [
        record({
          id: "assistant-1",
          content: [
            { type: "tool_use", id: "tool-1", name: "search_roles", input: { query: "review" } },
          ],
        }),
        record({
          id: "result-1",
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool-1",
              content: [
                { type: "text", text: "matches" },
                { type: "json", value: [{ id: "role-2", name: "Developer" }] },
                { type: "image", data: "base64-data-that-must-not-render" },
              ],
            },
          ],
        }),
      ],
      "checkpoint-1",
      "conversation-1",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].items?.[0]).toMatchObject({
      type: "tool_call",
      name: "search_roles",
      result: 'matches\n[{"id":"role-2","name":"Developer"}]\n[image]',
    });
    expect(messages[0].items?.[0].result).not.toContain("base64-data-that-must-not-render");
  });

  test("scopes restored ask_user requests to the remote conversation", () => {
    const [message] = checkpointRecordsToMessages(
      [
        record({
          content: [
            {
              type: "tool_use",
              id: "question-1",
              name: "ask_user",
              input: { fields: [{ type: "text", name: "answer", label: "Answer" }] },
            },
          ],
        }),
      ],
      "checkpoint-1",
      "conversation-1",
    );

    expect(message.items?.[0]).toMatchObject({
      type: "user_input",
      state: "pending",
      request: { request_id: "question-1", conv_id: "conversation-1" },
    });
  });
});
