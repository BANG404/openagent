import { describe, expect, test } from "bun:test";
import { preserveStreamingMessagesDuringHydration } from "../src/lib/checkpointTree";
import {
  prepareWorkspaceConversationSnapshot,
  restoreWorkspaceConversationSnapshot,
} from "../src/lib/workspaceConversationState";
import type { ChatMessage, Conversation } from "../src/lib/types";

function message(id: string, content: string): ChatMessage {
  return { id, role: "user", content, timestamp: 1 };
}

function conversation(id: string, messages: ChatMessage[]): Conversation {
  return { id, title: id, messages, createdAt: 1, updatedAt: 1 };
}

describe("workspace conversation transcript restoration", () => {
  for (const count of [0, 1, 29, 30, 31, 1000]) {
    test(`restores only the selected long transcript among ${count} histories`, () => {
      const metadata = Array.from({ length: count }, (_, index) =>
        conversation(`history-${index}`, []),
      );
      const longTranscript = Array.from({ length: 1000 }, (_, index) =>
        message(`message-${index}`, "long history ".repeat(100)),
      );
      const restored = prepareWorkspaceConversationSnapshot(
        metadata,
        [],
        count ? "history-0" : null,
        count ? longTranscript : null,
      );
      expect(restored).toHaveLength(count);
      expect(restored.flatMap((entry) => entry.messages)).toHaveLength(count ? 1000 : 0);
      if (count) expect(restored[0].messages).toBe(longTranscript);
      expect(restored.slice(1).every((entry) => entry.messages.length === 0)).toBe(true);
    });
  }

  test("reapplies cached transcript state to fresh workspace metadata", () => {
    const optimistic = message("user-live", "still streaming");
    const restored = restoreWorkspaceConversationSnapshot(
      [conversation("active", [])],
      [conversation("active", [optimistic]), conversation("deleted", [message("old", "old")])],
    );

    expect(restored).toEqual([conversation("active", [optimistic])]);
  });

  test("prepares the hydrated active transcript before a workspace becomes visible", () => {
    const cachedInactiveMessages = [message("cached", "keep mounted state")];
    const hydratedActiveMessages = [message("durable", "ready at commit")];
    const restored = prepareWorkspaceConversationSnapshot(
      [conversation("active", []), conversation("inactive", [])],
      [
        conversation("active", [message("stale", "stale")]),
        conversation("inactive", cachedInactiveMessages),
      ],
      "active",
      hydratedActiveMessages,
    );

    expect(restored[0].messages).toBe(hydratedActiveMessages);
    expect(restored[1].messages).toBe(cachedInactiveMessages);
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
