import { describe, expect, test } from "bun:test";
import { chatGroupScope } from "../src/lib/chatGroupScope";

describe("chatGroupScope", () => {
  test("collects group ids from selected-branch tool args", () => {
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
          },
          {
            name: "chat_group_read_messages",
            args: JSON.stringify({ group_id: "group-other" }),
          },
          { name: "dispatch_role", args: "{}" },
        ],
      },
    ]);

    expect(result).toEqual({ invoked: true, groupIds: ["group-created", "group-other"] });
  });

  test("keeps invocation visibility while a create call has no result yet", () => {
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
    ).toEqual({ invoked: true, groupIds: [] });
  });
});
