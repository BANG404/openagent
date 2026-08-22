// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { InterruptResolutionTracker } from "../src/lib/interruptResolutionTracker";

describe("InterruptResolutionTracker", () => {
  test("accepts sibling approvals while rejecting a duplicate request", () => {
    const tracker = new InterruptResolutionTracker();

    expect(tracker.begin("approval-1", "conversation-1")).toEqual({
      firstForConversation: true,
    });
    expect(tracker.begin("approval-1", "conversation-1")).toBeNull();
    expect(tracker.begin("approval-2", "conversation-1")).toEqual({
      firstForConversation: false,
    });
    expect(tracker.size).toBe(2);
  });

  test("keeps conversation activity until its final queued response finishes", () => {
    const tracker = new InterruptResolutionTracker();
    tracker.begin("approval-1", "conversation-1");
    tracker.begin("approval-2", "conversation-1");

    expect(tracker.hasOtherInConversation("conversation-1", "approval-1")).toBe(true);
    tracker.finish("approval-1");
    expect(tracker.hasOtherInConversation("conversation-1", "approval-2")).toBe(false);
    tracker.finish("approval-2");
    expect(tracker.size).toBe(0);
  });
});
