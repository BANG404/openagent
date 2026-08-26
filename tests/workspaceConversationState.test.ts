// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { preserveStreamingMessagesDuringHydration } from "../src/lib/checkpointTree";
import { restoreWorkspaceConversationSnapshot } from "../src/lib/workspaceConversationState";
import type { ChatMessage, Conversation } from "../src/lib/types";

function message(id: string, content: string): ChatMessage {
  return { id, role: "user", content, timestamp: 1 };
}

function conversation(id: string, messages: ChatMessage[]): Conversation {
  return { id, title: id, messages, createdAt: 1, updatedAt: 1 };
}

describe("workspace conversation transcript restoration", () => {
  test("reapplies cached transcript state to fresh workspace metadata", () => {
    const optimistic = message("user-live", "still streaming");
    const restored = restoreWorkspaceConversationSnapshot(
      [conversation("active", [])],
      [conversation("active", [optimistic]), conversation("deleted", [message("old", "old")])],
    );

    expect(restored).toEqual([conversation("active", [optimistic])]);
  });

  test("keeps an optimistic user message until the streaming checkpoint contains it", () => {
    const durable = message("user-durable", "durable");
    const optimistic = message("user-live", "still streaming");

    expect(
      preserveStreamingMessagesDuringHydration(
        [durable, optimistic],
        [{ ...durable, checkpointId: "checkpoint-1" }],
      ),
    ).toEqual([{ ...durable, checkpointId: "checkpoint-1" }, optimistic]);
  });

  test("does not duplicate a user message once it becomes durable", () => {
    const optimistic = message("user-live", "still streaming");
    const durable = { ...optimistic, checkpointId: "checkpoint-2" };

    expect(preserveStreamingMessagesDuringHydration([optimistic], [durable])).toEqual([durable]);
  });
});
