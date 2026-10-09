import { expect, test } from "bun:test";
import { FrontendCapture } from "../src/lib/replay/capture";
import { RecordingTransport } from "../src/lib/replay/recordingTransport";
import { extractFrontendCase } from "../src/lib/replay/extract";
import { replayCase } from "../src/lib/replay/runner";
import { createChatReplayTarget } from "../src/lib/replay/chatTarget";
import type { CaptureAnchor, CaptureManifest } from "../src/lib/replay/captureTypes";
import type { ReplayRecord } from "../src/lib/replay/types";
import type { OpenAgentTransport } from "../src/lib/openagent";
import { ReplayTransport } from "../src/lib/replay/transport";
import { recordFrontendReplay } from "../src/lib/replay/recordReplay";
import duplicate from "../src/lib/replay/fixtures/duplicate-tool-result.json";
import hydration from "../src/lib/replay/fixtures/hydration-race.json";
import {
  observeFrontendAction,
  setFrontendActionObserver,
  duringIndependentFrontendAction,
} from "../src/lib/replay/captureObservation";

const anchor: CaptureAnchor = {
  initial: {
    conversations: [{ id: "A", title: "Synthetic", messages: [], createdAt: 1, updatedAt: 1 }],
    streams: [],
    active_conversation: "A",
  },
  conversations: ["A"],
  subscriptions: ["chat.chunk", "chat.done"],
  scope: "consumer-observed",
  idle: true,
};

for (const original of [duplicate, hydration]) {
  test(`records and extracts actual production transitions for ${original.id}`, async () => {
    const records: ReplayRecord[] = [];
    const recorded = await recordFrontendReplay(original, {
      append: async (record) => {
        records.push(record);
      },
    });
    expect(recorded.report.status).toBe("passed");
    expect(recorded.result.reasons).toEqual([]);
    const manifest: CaptureManifest = {
      capture_version: 1,
      target: "frontend",
      target_version: 1,
      session_id: "synthetic",
      anchor: recorded.anchor,
      finalized: true,
      completeness: "complete",
      ...recorded.result,
      journal_bytes: 0,
      journal_sha256: "core-only",
    };
    const fixture = extractFrontendCase(
      manifest,
      records,
      `captured-${original.id}`,
      original.assertions,
    );
    for (let i = 0; i < 20; i++)
      expect((await replayCase(fixture, createChatReplayTarget)).status).toBe("passed");
  });
}

test("consumer recording extracts independently asserted cases and replays actual handlers", async () => {
  const records: ReplayRecord[] = [];
  let clock = 0;
  const capture = new FrontendCapture(
    anchor,
    {
      append: async (record) => {
        records.push(record);
      },
    },
    () => clock++,
  );
  capture.action({
    action: "insert-user",
    conversation: "A",
    assistant: "reply",
    message: { id: "user", role: "user", content: "Synthetic input" },
  });
  capture.action({ action: "start-stream", conversation: "A", assistant: "reply" });
  capture.event("chat.chunk", { conv_id: "A", text: "Synthetic reply" });
  capture.event("chat.done", { conv_id: "A", asst_msg_id: "reply" });
  const result = await capture.stop();
  const manifest: CaptureManifest = {
    capture_version: 1,
    target: "frontend",
    target_version: 1,
    session_id: "synthetic",
    anchor,
    finalized: true,
    completeness: "complete",
    ...result,
    journal_bytes: 0,
    journal_sha256: "unused-in-core",
  };
  const fixture = extractFrontendCase(manifest, records, "recorded-synthetic", [
    {
      id: "reply-preserved",
      path: ["conversations", "A", "messages", "1", "content"],
      equals: "Synthetic reply",
    },
  ]);
  for (let i = 0; i < 20; i++)
    expect((await replayCase(fixture, createChatReplayTarget)).status).toBe("passed");
  fixture.assertions[0].equals = "wrong";
  expect((await replayCase(fixture, createChatReplayTarget)).status).toBe("assertion_failed");
});

test("transport observes before callbacks and preserves values and error identity", async () => {
  const records: ReplayRecord[] = [];
  let callback: (payload: unknown) => void = () => {};
  let resolveRequest: (value: unknown) => void = () => {};
  const pending = new Promise((resolve) => {
    resolveRequest = resolve;
  });
  const original = new Error("private raw error");
  const underlying = {
    request: () => pending,
    subscribe: async (_event: string, handler: (payload: unknown) => void) => {
      callback = handler;
      return () => {};
    },
  } as unknown as OpenAgentTransport;
  const recording = new RecordingTransport(underlying);
  const capture = new FrontendCapture(anchor, {
    append: async (record) => {
      records.push(record);
    },
  });
  const delivered: unknown[] = [];
  await recording.subscribe("chat.chunk", (payload) => {
    delivered.push(payload);
  });
  recording.capture = capture;
  const actual = recording.request("product.invoke_desktop", {
    operation: "get_branches",
    args: { convId: "A" },
  });
  const event = { conv_id: "A", text: "Synthetic" };
  callback(event);
  expect(delivered[0]).toBe(event);
  const output: unknown[] = [];
  resolveRequest(output);
  expect(await actual).toBe(output);
  await capture.stop();
  expect(records.map((record) => record.kind)).toEqual([
    "request.begin",
    "event.deliver",
    "request.resolve",
  ]);
  const rejecting = new RecordingTransport({
    ...underlying,
    request: () => Promise.reject(original),
  } as OpenAgentTransport);
  const rejectedRecords: ReplayRecord[] = [];
  rejecting.capture = new FrontendCapture(anchor, {
    append: async (record) => {
      rejectedRecords.push(record);
    },
  });
  await expect(
    rejecting.request("product.invoke_desktop", {
      operation: "get_branches",
      args: { convId: "A" },
    }),
  ).rejects.toBe(original);
  await rejecting.capture.stop();
  expect(JSON.stringify(rejectedRecords)).not.toContain("private raw error");
});

test("writer failure, overflow, pending requests and unsupported events invalidate captures", async () => {
  const failure = new FrontendCapture(anchor, {
    append: async () => {
      throw new Error("private path");
    },
  });
  failure.event("chat.chunk", { conv_id: "A", text: "Synthetic" });
  expect((await failure.stop()).reasons).toContain("writer-failed");
  const overflow = new FrontendCapture(anchor, { append: async () => {} });
  overflow.event("chat.chunk", { conv_id: "A", text: "a".repeat(1024 * 1024) });
  expect((await overflow.stop()).reasons).toContain("writer-overflow");
  const incomplete = new FrontendCapture(anchor, { append: async () => {} });
  incomplete.begin("product.invoke_desktop", {});
  incomplete.event("chat.retry", { conv_id: "A" });
  incomplete.event("chat.tool_call", { conv_id: "A", args: { api_key: "never persisted" } });
  expect((await incomplete.stop()).reasons).toEqual([
    "credential-field",
    "pending-requests",
    "unsupported-event",
  ]);
  const hanging = new FrontendCapture(anchor, { append: () => new Promise(() => {}) });
  hanging.event("chat.chunk", { conv_id: "A", text: "Synthetic" });
  expect((await hanging.stop(5)).reasons).toContain("writer-timeout");
});

test("void responses survive JSON recording without inventing a null product value", async () => {
  const records: ReplayRecord[] = [];
  const capture = new FrontendCapture(anchor, {
    append: async (record) => {
      records.push(record);
    },
  });
  const input = {
    operation: "restore_agent_history" as const,
    args: { convId: "A", checkpointId: null },
  };
  const request = capture.begin("product.invoke_desktop", input);
  capture.outcome(request, undefined);
  await capture.stop();
  const transport = new ReplayTransport(records);
  const pending = transport.request("product.invoke_desktop", input);
  transport.release(records[1]);
  expect(await pending).toBeUndefined();
  transport.check([]);
});

test("event-owned hydration actions are not recorded again as independent inputs", async () => {
  const actions: unknown[] = [];
  setFrontendActionObserver((action) => {
    actions.push(action);
  });
  let callback: () => void = () => {};
  const underlying = {
    request: () => Promise.resolve(null),
    subscribe: async (_event: string, receive: (value: unknown) => void) => {
      callback = () => receive({ conv_id: "A", text: "Synthetic" });
      return () => {};
    },
  } as unknown as OpenAgentTransport;
  try {
    const transport = new RecordingTransport(underlying);
    await transport.subscribe("chat.chunk", () => {
      observeFrontendAction({ action: "hydrate", conversation: "A" });
      duringIndependentFrontendAction(() =>
        observeFrontendAction({ action: "hydrate", conversation: "A", force_refresh: true }),
      );
    });
    callback();
    expect(actions).toEqual([{ action: "hydrate", conversation: "A", force_refresh: true }]);
    observeFrontendAction({ action: "hydrate", conversation: "A" });
    expect(actions).toHaveLength(2);
  } finally {
    setFrontendActionObserver(null);
  }
});

test("an announced run-start after optimistic insertion preserves one user and assistant row", async () => {
  const records: ReplayRecord[] = [];
  const capture = new FrontendCapture(
    {
      ...anchor,
      initial: { ...(anchor.initial as object), workspace: "fixture", loaded_conversations: ["A"] },
    },
    {
      append: async (record) => {
        records.push(record);
      },
    },
  );
  capture.action({
    action: "insert-user",
    conversation: "A",
    assistant: "reply",
    message: { id: "user", role: "user", content: "Authored input" },
  });
  capture.action({ action: "start-stream", conversation: "A", assistant: "reply" });
  const started = {
    conv_id: "A",
    msg_id: "user",
    asst_msg_id: "reply",
    message: "Authored input",
    workspace: "fixture",
    title: "Fixture",
    pinned: false,
    created_at: 1,
    updated_at: 1,
    is_new: false,
    source: "desktop",
  };
  capture.event("chat.run_started", started);
  capture.event("chat.run_started", started);
  capture.event("chat.memory_retrieval", { conv_id: "A", stage: "searching" });
  capture.event("chat.response_started", { conv_id: "A" });
  capture.event("chat.chunk", { conv_id: "A", text: "Recorded reply" });
  capture.event("chat.done", { conv_id: "A", asst_msg_id: "reply" });
  const result = await capture.stop();
  const fixture = extractFrontendCase(
    {
      capture_version: 1,
      target_version: 1,
      target: "frontend",
      session_id: "synthetic",
      anchor: capture.anchor,
      finalized: true,
      completeness: "complete",
      ...result,
      journal_bytes: 0,
      journal_sha256: "unused-core",
    },
    records,
    "run-start-correlation",
    [
      {
        id: "no-duplicate-user",
        path: ["conversations", "A", "message_ids"],
        equals: ["user", "reply"],
      },
      {
        id: "text-preserved",
        path: ["conversations", "A", "messages", "1", "content"],
        equals: "Recorded reply",
      },
      { id: "awaiting-cleaned", path: ["awaiting_output"], equals: {} },
      { id: "retrieval-cleaned", path: ["memory_retrieval"], equals: {} },
    ],
  );
  for (let repeat = 0; repeat < 20; repeat++)
    expect((await replayCase(fixture, createChatReplayTarget)).status).toBe("passed");
});

test("out-of-target Runtime and file effects cannot silently qualify unsupported outcomes", async () => {
  const recording = new RecordingTransport({
    request: async () => [{ id: "file" }],
    subscribe: async () => () => {},
  } as unknown as OpenAgentTransport);
  recording.capture = new FrontendCapture(anchor, { append: async () => {} });
  await recording.request("product.invoke_desktop", {
    operation: "get_file_changes",
    args: { convId: "A" },
  });
  await recording.request("agent.resume_interrupt", {
    convId: "A",
    interruptId: "approval",
    response: "yes",
    assistantMessageId: "reply",
  });
  await recording.request("product.invoke_desktop", {
    operation: "set_chat_queue_pending",
    args: { convId: "A", pending: true },
  });
  expect((await recording.capture.stop()).reasons).toEqual([
    "file-changes-capability",
    "queued-submission-capability",
    "unsupported-operation:agent.resume_interrupt",
  ]);
  const original = new Error("private provider failure");
  const failed = new RecordingTransport({
    request: async () => {
      throw original;
    },
    subscribe: async () => () => {},
  } as unknown as OpenAgentTransport);
  failed.capture = new FrontendCapture(anchor, { append: async () => {} });
  await expect(
    failed.request("agent.submit_input", { convId: "A", text: "Plain input" }),
  ).rejects.toBe(original);
  expect((await failed.capture.stop()).reasons).toEqual(["unsupported-effect-rejection"]);
  const synchronous = new RecordingTransport({
    request: () => {
      throw original;
    },
    subscribe: async () => () => {},
  } as unknown as OpenAgentTransport);
  synchronous.capture = new FrontendCapture(anchor, { append: async () => {} });
  expect(() =>
    synchronous.request("agent.submit_input", { convId: "A", text: "Plain input" }),
  ).toThrow(original);
  expect(synchronous.idle).toBe(true);
  expect((await synchronous.capture.stop()).reasons).toEqual(["unsupported-effect-rejection"]);
});
