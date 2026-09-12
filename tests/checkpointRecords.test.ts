// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { askUserRequestFromToolUse, checkpointRecordsToMessages } from "../src/lib/checkpointTree";

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
  test("restores a durable model retry with its failed attempt output", () => {
    const [message] = checkpointRecordsToMessages(
      [
        record({
          id: "retry-1",
          items: JSON.stringify([
            {
              type: "retry",
              items: [{ type: "thinking", content: "checking the response" }],
              attempt: 1,
              maxAttempts: 4,
              model: "test-model",
              error: "upstream disconnected",
            },
          ]),
        }),
      ],
      "checkpoint-1",
      "conversation-1",
    );

    expect(message.content).toBe("");
    expect(message.items).toEqual([
      {
        type: "retry",
        items: [{ type: "thinking", content: "checking the response" }],
        attempt: 1,
        maxAttempts: 4,
        model: "test-model",
        error: "upstream disconnected",
      },
    ]);
  });

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

  test("does not restore malformed ask_user arguments as a form", () => {
    const malformedInput = {
      fields: [
        {
          type: "select",
          name: "scope",
          label: "Scope",
          options: [[[["nested option"]]]],
        },
      ],
    };

    expect(
      askUserRequestFromToolUse({
        id: "malformed-question",
        name: "ask_user",
        input: malformedInput,
      }),
    ).toBeNull();

    const [message] = checkpointRecordsToMessages(
      [
        record({
          content: [
            { type: "tool_use", id: "malformed-question", name: "ask_user", input: malformedInput },
          ],
        }),
        record({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "malformed-question",
              content: [{ type: "text", text: "failed to parse tool arguments: invalid options" }],
            },
          ],
        }),
      ],
      "checkpoint-1",
      "conversation-1",
    );

    expect(message.items).toEqual([
      {
        type: "tool_call",
        name: "ask_user",
        args: JSON.stringify(malformedInput),
        toolUseId: "malformed-question",
        result: "failed to parse tool arguments: invalid options",
      },
    ]);
    expect(message.items?.some((item) => item.type === "user_input")).toBe(false);
  });

  test("hides a failed result even when an ask_user form was already projected", () => {
    const messages = checkpointRecordsToMessages(
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
        record({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "question-1",
              content: [{ type: "text", text: "failed to parse tool arguments: invalid field" }],
            },
          ],
        }),
      ],
      "checkpoint-1",
      "conversation-1",
    );

    expect(messages[0]?.items).toEqual([]);
  });

  test("restores quoted context separately from user-authored text", () => {
    const [message] = checkpointRecordsToMessages(
      [
        record({
          id: "user-1",
          role: "user",
          content: [
            { type: "quote", text: "Earlier assistant excerpt", source_message_id: "assistant-0" },
            { type: "text", text: "Explain this claim" },
          ],
        }),
      ],
      "checkpoint-1",
    );

    expect(message.content).toBe("Explain this claim");
    expect(message.items).toEqual([
      {
        type: "quote",
        context: {
          type: "quote",
          text: "Earlier assistant excerpt",
          sourceMessageId: "assistant-0",
        },
      },
      { type: "text", content: "Explain this claim" },
    ]);
  });
});
