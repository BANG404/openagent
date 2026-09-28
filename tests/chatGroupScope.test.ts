import { describe, expect, test } from "bun:test";
import { chatGroupScope } from "../src/lib/chatGroupScope";

describe("chatGroupScope", () => {
  test("collects group ids only after a successful tool result", () => {
    const result = chatGroupScope([
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: 1,
        items: [
          {
            type: "tool_call",
            name: "chat_group_send_message",
            args: JSON.stringify({ group_id: "group-a", content: "hello" }),
            result: JSON.stringify({ id: "message-1", group_id: "group-a" }),
          },
        ],
      },
    ]);

    expect(result).toEqual({ invoked: true, groupIds: ["group-a"] });
  });

  test("uses a create result and ignores unrelated group records", () => {
    const result = chatGroupScope([
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: 1,
        toolCalls: [
          {
            name: "chat_group_create",
            args: JSON.stringify({ title: "Planning" }),
            result: JSON.stringify({ id: "group-created", title: "Planning" }),
          },
          {
            name: "chat_group_list_members",
            args: JSON.stringify({ group_id: "group-created" }),
            result: JSON.stringify([]),
          },
          {
            name: "chat_group_read_messages",
            args: JSON.stringify({ group_id: "group-other" }),
            result: JSON.stringify({ messages: [], next_seq: 0, temporary: true }),
          },
          { name: "dispatch_role", args: "{}" },
        ],
      },
    ]);

    expect(result).toEqual({ invoked: true, groupIds: ["group-created", "group-other"] });
  });

  test("does not expose a pending or failed group call", () => {
    expect(
      chatGroupScope([
        {
          id: "assistant-1",
          role: "assistant",
          content: "",
          timestamp: 1,
          items: [{ type: "tool_call", name: "chat_group_create", args: '{"title":"x"}' }],
        },
      ]),
    ).toEqual({ invoked: false, groupIds: [] });
    expect(
      chatGroupScope([
        {
          id: "assistant-2",
          role: "assistant",
          content: "",
          timestamp: 1,
          toolCalls: [
            {
              name: "chat_group_start",
              args: '{"title":"x","content":"@Unknown"}',
              result: "Unknown role 'Unknown'",
            },
          ],
        },
      ]),
    ).toEqual({ invoked: false, groupIds: [] });
  });

  test("extracts the nested group from chat_group_start", () => {
    const result = chatGroupScope([
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: 1,
        toolCalls: [
          {
            name: "chat_group_start",
            args: JSON.stringify({ title: "Planning", roles: ["Research"], content: "Start" }),
            result: JSON.stringify({
              group: { id: "group-started", title: "Planning" },
              members: [],
              message: { group_id: "group-started" },
            }),
          },
        ],
      },
    ]);

    expect(result).toEqual({ invoked: true, groupIds: ["group-started"] });
  });

  // The Runtime appends model context (automation-hook output) to the durable
  // result, so the structured value is only a prefix of the result text.
  const appendedContext = "\n[Automation hook: demo automation]\nC:\\plugins\\demo\\after-tool.cmd";

  test("reads group ids from a result that carries appended context", () => {
    const result = chatGroupScope([
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: 1,
        items: [
          {
            type: "tool_call",
            name: "chat_group_start",
            args: JSON.stringify({ title: "Round table", roles: ["Debater"], content: "Start" }),
            result:
              JSON.stringify({ group: { id: "group-started" }, members: [], message: {} }) +
              appendedContext,
          },
          {
            type: "tool_call",
            name: "chat_group_send_message",
            args: JSON.stringify({ group_id: "group-started", content: "hello" }),
            result:
              JSON.stringify({ id: "message-1", group_id: "group-started" }) + appendedContext,
          },
        ],
      },
    ]);

    expect(result).toEqual({ invoked: true, groupIds: ["group-started"] });
  });

  test("keeps a plain-text failure unstructured when context is appended", () => {
    const result = chatGroupScope([
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        timestamp: 1,
        items: [
          {
            type: "tool_call",
            name: "chat_group_send_message",
            args: JSON.stringify({ group_id: "group-a", content: "hello" }),
            result: "Unknown role 'Debater'" + appendedContext,
          },
        ],
      },
    ]);

    expect(result).toEqual({ invoked: false, groupIds: [] });
  });
});
