// @ts-nocheck -- Bun provides the test module at runtime.
import { describe, expect, test } from "bun:test";
import {
  clearQueuedChatMessages,
  dequeueChatMessage,
  enqueueChatMessage,
  removeQueuedChatMessage,
} from "../src/lib/chatQueue";

const message = (text) => ({ text, attachments: [], model: "provider/model" });

describe("chat queue", () => {
  test("keeps queued messages scoped to their conversation", () => {
    const queue = enqueueChatMessage({}, "a", message("first"));
    const next = enqueueChatMessage(queue, "a", message("second"));
    expect(dequeueChatMessage(next, "a")).toEqual({
      next: message("first"),
      queue: { a: [message("second")] },
    });
  });

  test("removes a queue key after its final message is removed", () => {
    const queue = { a: [message("only")] };
    expect(removeQueuedChatMessage(queue, "a", 0)).toEqual({});
    expect(clearQueuedChatMessages(queue, "a")).toEqual({});
  });
});
