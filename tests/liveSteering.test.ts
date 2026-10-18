import { expect, test } from "bun:test";
import { consumeLiveSteering, projectLiveSteering } from "../src/lib/transcript/liveSteering";
import { groupAssistantTurns, groupMessageToolCalls } from "../src/lib/toolCallGroups";
import type { ChatMessage, StreamItem } from "../src/lib/types";

const user = (id: string): ChatMessage => ({
  id,
  role: "user",
  content: id,
  timestamp: 0,
});
function rows(messages: ChatMessage[], items: StreamItem[]) {
  return projectLiveSteering(
    groupAssistantTurns(groupMessageToolCalls(messages.map((msg, index) => ({ msg, index })))),
    "run",
    items,
  ).map((entry) =>
    entry.kind === "live_stream"
      ? { output: entry.items, settled: !!entry.settled }
      : { user: entry.key },
  );
}

test("without a consumption event the transcript contains no steering bubble", () => {
  expect(rows([user("initial")], [{ type: "text", content: "before complete" }])).toEqual([
    { user: "initial" },
    { output: undefined, settled: false },
  ]);
});

test("consumption splits a growing text item and preserves multiple user boundaries", () => {
  const before: StreamItem[] = [{ type: "text", content: "before" }];
  let messages = consumeLiveSteering([user("initial")], user("correction"), "run", before);
  messages = consumeLiveSteering(messages, user("another"), "run", before);
  expect(rows(messages, [{ type: "text", content: "beforeafter" }])).toEqual([
    { user: "initial" },
    { output: [{ type: "text", content: "before" }], settled: true },
    { user: "correction" },
    { user: "another" },
    { output: [{ type: "text", content: "after" }], settled: false },
  ]);
  messages = consumeLiveSteering(messages, user("third"), "run", [
    { type: "text", content: "beforeafter" },
  ]);
  expect(rows(messages, [{ type: "text", content: "beforeafterthird reply" }]).slice(-3)).toEqual([
    { output: [{ type: "text", content: "after" }], settled: true },
    { user: "third" },
    { output: [{ type: "text", content: "third reply" }], settled: false },
  ]);
});

test("a boundary keeps tool results live and consumption is idempotent", () => {
  const messages = [user("initial")];
  const tool: StreamItem = { type: "tool_call", name: "read_file", args: "{}" };
  const consumed = consumeLiveSteering(messages, user("correction"), "run", [tool]);
  expect(consumeLiveSteering(consumed, user("correction"), "run", [])).toBe(consumed);
  expect(
    rows(consumed, [
      { ...tool, result: "done" },
      { type: "text", content: "after" },
    ]),
  ).toEqual([
    { user: "initial" },
    { output: [{ ...tool, result: "done" }], settled: true },
    { user: "correction" },
    { output: [{ type: "text", content: "after" }], settled: false },
  ]);
});
