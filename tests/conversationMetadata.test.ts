import { expect, test } from "bun:test";
import { mergeConversationMetadata } from "../src/lib/page/conversationMetadata";
import type { Conversation } from "../src/lib/types";

function conversation(id: string): Conversation {
  return { id, title: id, messages: [], createdAt: 1, updatedAt: 1 };
}

test("metadata refresh retains live messages and appends unknown conversations", () => {
  const current = conversation("active");
  current.messages.push({ id: "user", role: "user", content: "draft", timestamp: 1 });
  const refreshed = { ...conversation("active"), title: "accepted", updatedAt: 2 };
  const unknown = conversation("other");
  const result = mergeConversationMetadata([current], [refreshed, unknown]);
  expect(result[0].title).toBe("accepted");
  expect(result[0].messages).toBe(current.messages);
  expect(result[1]).toBe(unknown);
});

test("unmentioned conversations retain their existing objects", () => {
  const existing = conversation("existing");
  expect(mergeConversationMetadata([existing], [conversation("new")])[0]).toBe(existing);
});
