import { expect, test } from "bun:test";
import { consumeLiveSteering, projectLiveSteering } from "../src/lib/transcript/liveSteering";
import { groupAssistantTurns, groupMessageToolCalls } from "../src/lib/toolCallGroups";
import type { ChatMessage, StreamItem } from "../src/lib/types";

const user = (id: string, steering = false): ChatMessage => ({
  id,
  role: "user",
  content: id,
  timestamp: 0,
  ...(steering ? { liveSteering: { assistantMessageId: "run" } } : {}),
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

test("pending steering follows the whole current response as it continues streaming", () => {
  const messages = [user("initial"), user("correction", true), user("another", true)];
  expect(rows(messages, [{ type: "text", content: "before complete" }])).toEqual([
    { user: "initial" },
    { output: [{ type: "text", content: "before complete" }], settled: false },
    { user: "correction" },
    { user: "another" },
  ]);
});

test("consumption splits a growing text item and preserves multiple user boundaries", () => {
  let messages = [user("initial"), user("correction", true), user("another", true)];
  messages = consumeLiveSteering(messages, "run", [{ type: "text", content: "before" }]);
  expect(rows(messages, [{ type: "text", content: "beforeafter" }])).toEqual([
    { user: "initial" },
    { output: [{ type: "text", content: "before" }], settled: true },
    { user: "correction" },
    { user: "another" },
    { output: [{ type: "text", content: "after" }], settled: false },
  ]);
  messages.push(user("third", true));
  messages = consumeLiveSteering(messages, "run", [{ type: "text", content: "beforeafter" }]);
  expect(rows(messages, [{ type: "text", content: "beforeafterthird reply" }]).slice(-3)).toEqual([
    { output: [{ type: "text", content: "after" }], settled: true },
    { user: "third" },
    { output: [{ type: "text", content: "third reply" }], settled: false },
  ]);
});

test("a boundary keeps tool results live and ignores unrelated runs", () => {
  const messages = [user("initial"), user("correction", true)];
  expect(consumeLiveSteering(messages, "other-run", [])).toBe(messages);
  const tool: StreamItem = { type: "tool_call", name: "read_file", args: "{}" };
  const consumed = consumeLiveSteering(messages, "run", [tool]);
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
