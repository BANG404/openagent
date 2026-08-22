// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  InterruptResolutionTracker,
  InterruptTerminalHandoff,
} from "../src/lib/interruptResolutionTracker";

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

describe("InterruptTerminalHandoff", () => {
  test("releases every waiter only after the interrupted turn is finalized", async () => {
    const handoff = new InterruptTerminalHandoff();
    const order: string[] = [];
    const first = handoff.wait("conversation-1").then(() => order.push("first resume"));
    const sibling = handoff.wait("conversation-1").then(() => order.push("sibling resume"));

    await Promise.resolve();
    expect(order).toEqual([]);
    expect(handoff.has("conversation-1")).toBe(true);

    order.push("turn finalized");
    handoff.release("conversation-1");
    await Promise.all([first, sibling]);

    expect(order).toEqual(["turn finalized", "first resume", "sibling resume"]);
    expect(handoff.has("conversation-1")).toBe(false);
  });

  test("ignores terminal events without a waiting live approval", () => {
    const handoff = new InterruptTerminalHandoff();
    handoff.release("conversation-1");
    expect(handoff.has("conversation-1")).toBe(false);
  });
});
