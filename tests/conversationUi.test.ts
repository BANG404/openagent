import { expect, test } from "bun:test";
import { checkpointRecordsToMessages } from "../src/lib/checkpointTree";
import {
  conversationUiFromContent,
  conversationUiFrameDocument,
  mergeConversationUiMessages,
  mergeConversationUiStream,
  reconcileLiveConversationUi,
} from "../src/lib/conversationUi";
import {
  groupAssistantTurns,
  groupMessageToolCalls,
  partitionAssistantSegments,
  groupStreamItems,
} from "../src/lib/toolCallGroups";
import type { CheckpointMessage, ChatMessage } from "../src/lib/types";

const record = (
  id: string,
  role: CheckpointMessage["role"],
  content: CheckpointMessage["content"],
): CheckpointMessage => ({
  id,
  role,
  content,
  status: "completed",
  timestamp: 1,
  first_token_at: null,
  completed_at: null,
  tags: [],
  system_prompt: null,
  tools: null,
});

test("restored UI keeps chronological identity without creating an editable user turn", () => {
  const records = [
    record("u", "user", [{ type: "text", text: "Hello" }]),
    record("a", "assistant", [{ type: "text", text: "Checking" }]),
    record("ui", "ui", [
      {
        type: "ui",
        ui: {
          version: 1,
          component: "builtin.notice",
          props: { text: "Ready" },
          fallback: "Ready",
        },
      },
    ]),
    record("b", "assistant", [{ type: "text", text: "Done" }]),
  ];
  const messages = checkpointRecordsToMessages(records, "ck");
  expect(messages.map((message) => message.id)).toEqual(["u", "a", "ui", "b"]);
  expect(messages.filter((message) => message.role === "user")).toHaveLength(1);
  expect(messages[2].ui?.fallback).toBe("Ready");
  const grouped = groupAssistantTurns(
    groupMessageToolCalls(messages.map((msg, index) => ({ msg, index }))),
  );
  expect(grouped).toHaveLength(2);
  expect(grouped[1].kind).toBe("assistant_turn");
});

test("unknown UI versions retain fallback and malformed envelopes do not become executable", () => {
  expect(
    conversationUiFromContent([
      { type: "ui", ui: { version: 99, component: "future", props: {}, fallback: "Saved result" } },
    ])?.fallback,
  ).toBe("Saved result");
  expect(
    conversationUiFromContent([{ type: "ui", ui: { version: 1, props: [], fallback: "Invalid" } }]),
  ).toBeUndefined();
  const html = conversationUiFrameDocument("<script>fetch('https://example.com')</script>");
  expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script>"));
  expect(html).toContain("connect-src 'none'");
});

test("both legacy and inline compaction render one durable divider with hidden provider context", () => {
  const divider = record("divider", "ui", [
    {
      type: "ui",
      ui: {
        version: 1,
        component: "builtin.divider",
        props: { label_key: "compactionCompleted" },
        fallback: "Compacted",
      },
    },
  ]);
  const replay = {
    ...record("replay", "user", [{ type: "text", text: "Hidden replay" }]),
    tags: ["context_compaction" as const],
  };
  const summary = {
    ...record("summary", "system", [{ type: "text", text: "Hidden summary" }]),
    tags: ["context_compaction" as const],
  };
  expect(
    checkpointRecordsToMessages([divider, replay], "checkpoint").map((message) => message.id),
  ).toEqual(["divider"]);
  expect(
    checkpointRecordsToMessages([divider, summary, replay], "checkpoint").map(
      (message) => message.id,
    ),
  ).toEqual(["divider"]);
});

test("UI reconciliation updates slots without replacing optimistic assistant content", () => {
  const visible: ChatMessage[] = [
    { id: "u", role: "user", content: "Hello", timestamp: 1 },
    { id: "a", role: "assistant", content: "Live text", timestamp: 2 },
  ];
  const ui: ChatMessage = {
    id: "ui",
    role: "ui",
    content: "",
    timestamp: 2,
    ui: { version: 1, component: "builtin.notice", props: { text: "Ready" }, fallback: "Ready" },
  };
  const merged = mergeConversationUiMessages(visible, [
    visible[0],
    ui,
    { ...visible[1], content: "Earlier text" },
  ]);
  expect(merged.map((message) => message.id)).toEqual(["u", "ui", "a"]);
  expect(merged[2].content).toBe("Live text");
  expect(mergeConversationUiMessages(merged, [visible[0], visible[1]])).toEqual(visible);
});

test("live UI replaces its transient compaction marker and stays visible after completion", () => {
  const ui: ChatMessage = {
    id: "divider",
    role: "ui",
    content: "",
    timestamp: 2,
    ui: {
      version: 1,
      component: "builtin.divider",
      props: { label_key: "compactionCompleted" },
      fallback: "Compacted",
    },
  };
  const stream = mergeConversationUiStream(
    [],
    [ui],
    [{ type: "compaction_boundary" }, { type: "text", content: "Live" }],
    "conv",
    "branch",
  );
  expect(stream).toHaveLength(2);
  expect(stream[0].type).toBe("ui");
  expect(mergeConversationUiStream([], [ui], stream, "conv", "branch")).toEqual(stream);
  expect(
    partitionAssistantSegments(groupStreamItems(stream), "completed").finalSegments,
  ).toHaveLength(2);
});

test("compaction refresh keeps the live trajectory without hydrating a duplicate response row", () => {
  const visible: ChatMessage[] = [
    { id: "old-user", role: "user", content: "Earlier request", timestamp: 1 },
    { id: "old-reply", role: "assistant", content: "Earlier answer", timestamp: 2 },
    { id: "user", role: "user", content: "Continue working", timestamp: 3 },
  ];
  const live: ChatMessage = {
    id: "live-response",
    role: "assistant",
    content: "Inspecting files",
    timestamp: 4,
    items: [
      { type: "text", content: "Inspecting files" },
      { type: "thinking", content: "Keep the original tool results" },
      { type: "tool_call", name: "read_file", args: "{}", toolUseId: "call", result: "Found" },
    ],
  };
  const divider: ChatMessage = {
    id: "compaction-divider",
    role: "ui",
    content: "",
    timestamp: 5,
    ui: {
      version: 1,
      component: "builtin.divider",
      props: { label_key: "compactionCompleted" },
      fallback: "Compacted",
    },
  };
  const items = [...live.items!, { type: "compaction_boundary" as const }];
  const durable = [...visible, live, divider];
  const projection = reconcileLiveConversationUi(visible, durable, items, "conv", "branch");
  expect(projection.messages).toEqual(visible);
  expect(projection.items.slice(0, 3)).toEqual(live.items!);
  expect(projection.items[3]).toMatchObject({ type: "ui", messageId: divider.id });
  expect(
    reconcileLiveConversationUi(projection.messages, durable, projection.items, "conv", "branch"),
  ).toEqual(projection);
  const entries = groupAssistantTurns(
    groupMessageToolCalls(projection.messages.map((msg, index) => ({ msg, index }))),
  );
  expect(entries.some((entry) => entry.key === live.id)).toBe(false);

  const secondDivider = { ...divider, id: "second-divider", timestamp: 7 };
  const continued = [
    ...projection.items,
    { type: "text" as const, content: "Continuing after compaction" },
    { type: "compaction_boundary" as const },
  ];
  const repeated = reconcileLiveConversationUi(
    visible,
    [...durable, secondDivider],
    continued,
    "conv",
    "branch",
  );
  expect(repeated.items.slice(0, 5)).toEqual(continued.slice(0, 5));
  expect(repeated.items[5]).toMatchObject({ type: "ui", messageId: secondDivider.id });
});
