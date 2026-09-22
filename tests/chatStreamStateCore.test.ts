import { describe, expect, test } from "bun:test";
import type { ChatStreamStateMaps } from "../src/lib/chatStreamStateCore";
import {
  cleanupChatState,
  recordChatFirstResponse,
  startChatTiming,
} from "../src/lib/chatStreamStateCore";

function state(): ChatStreamStateMaps {
  return {
    itemsByConversation: { a: [{ type: "text", content: "live" }], b: [] },
    assistantMessageIds: { a: "assistant-a", b: "assistant-b" },
    startedAt: { a: 10, b: 20 },
    firstTokenAt: { a: 11, b: 21 },
    awaitingOutput: { a: true, b: true },
    memoryRetrievalStages: { a: "searching", b: "completed" },
    memoryRetrievalSkippable: { a: true, b: false },
    streamingConversationIds: { a: true, b: true },
    pausedConversationIds: { a: false, b: true },
    recoveredConversationIds: { a: true, b: true },
  };
}

describe("chat stream state lifecycle", () => {
  test("starts a new turn only for the selected conversation", () => {
    const current = state();

    startChatTiming(current, "a", 100);

    expect(current.startedAt).toEqual({ a: 100, b: 20 });
    expect(current.firstTokenAt).toEqual({ b: 21 });
    expect(current.awaitingOutput).toEqual({ b: true });
    expect(current.memoryRetrievalStages).toEqual({ b: "completed" });
    expect(current.memoryRetrievalSkippable).toEqual({ b: false });
  });

  test("records only the first response timestamp for each conversation", () => {
    const current = state();

    recordChatFirstResponse(current, "a", 100);
    recordChatFirstResponse(current, "b", 200);

    expect(current.firstTokenAt).toEqual({ a: 11, b: 21 });
    recordChatFirstResponse(current, "c", 300);
    expect(current.firstTokenAt.c).toBe(300);
  });

  test("cleans every transient map for one conversation without touching siblings", () => {
    const current = state();

    cleanupChatState(current, "a");

    expect(current).toMatchObject({
      itemsByConversation: { b: [] },
      assistantMessageIds: { b: "assistant-b" },
      startedAt: { b: 20 },
      firstTokenAt: { b: 21 },
      awaitingOutput: { b: true },
      memoryRetrievalStages: { b: "completed" },
      memoryRetrievalSkippable: { b: false },
      streamingConversationIds: { b: true },
      pausedConversationIds: { b: true },
      recoveredConversationIds: { b: true },
    });
  });
});
