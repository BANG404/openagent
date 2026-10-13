import { expect, test } from "bun:test";
import { turnFooterFixture } from "../src/lib/devFixtures/turnFooter";
import { cacheUsageForTurn, runTiming } from "../src/lib/transcript/assistantContent";
import { groupAssistantTurns, groupMessageToolCalls } from "../src/lib/toolCallGroups";
import { chatTaskUsagesByCheckpoint } from "../src/lib/cacheUsage";

function summaries(branch = false) {
  const fixture = turnFooterFixture(branch);
  return groupAssistantTurns(
    groupMessageToolCalls(fixture.messages.map((msg, index) => ({ msg, index }))),
  )
    .filter((entry) => entry.kind === "assistant_turn")
    .map((entry) => ({
      usage: cacheUsageForTurn(entry.messages, fixture.usages),
      timing: runTiming(entry.messages.at(-1)!, entry.finalIndex, entry.messages, fixture.messages),
    }));
}

test("complete snapshots keep historical and multi-record turn footers independent", () => {
  const fixture = turnFooterFixture();
  expect(
    fixture.messages
      .filter((message) => message.role === "assistant")
      .map((message) => message.checkpointId),
  ).toEqual(["first", "second", "tool-terminal", "tool-output", "last"]);
  const rows = summaries();
  expect(rows.map((row) => (row.usage?.kind === "available" ? row.usage.readRate : null))).toEqual([
    0.7,
    0.6,
    0.8,
    null,
  ]);
  expect(rows.map((row) => row.timing?.total)).toEqual(["1.0s", "2.0s", "4.0s", "5.0s"]);
  expect(rows.map((row) => row.timing?.firstToken)).toEqual(["200ms", "400ms", "300ms", "500ms"]);
  expect(summaries()).toEqual(rows);
});

test("branch switching preserves ancestor usage and selects sibling records", () => {
  expect(
    summaries(true).map((row) => (row.usage?.kind === "available" ? row.usage.readRate : null)),
  ).toEqual([0.7, 0.2]);
});

test("missing and ambiguous usage never borrows another turn's record", () => {
  const fixture = turnFooterFixture();
  const first = fixture.messages.find((message) => message.id === "first-answer")!;
  const second = fixture.messages.find((message) => message.id === "second-answer")!;
  const trace = {
    checkpoint_id: "temporary",
    created_at: 10,
    usage: fixture.usages.first[0],
  };
  expect(cacheUsageForTurn([first], { second: fixture.usages.second })).toBeNull();
  const input = fixture.messages.find((message) => message.id === "first-user")!;
  expect(
    chatTaskUsagesByCheckpoint([trace], [], [input, first, { ...second, completedAt: 11_000 }]),
  ).toEqual({});
  expect(
    chatTaskUsagesByCheckpoint([trace], [], [input, { ...first, completedAt: undefined }]),
  ).toEqual({ temporary: [trace.usage] });
});
