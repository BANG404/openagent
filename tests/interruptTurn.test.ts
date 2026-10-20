import { describe, expect, test } from "bun:test";
import { reconcileTerminalAssistantMessage } from "../src/lib/checkpointTree";
import {
  assistantTurnStatus,
  hasPendingHumanInput,
  turnClock,
} from "../src/lib/processRecordState";
import { assistantItems, entryAssistantMessages } from "../src/lib/transcript/assistantContent";
import { projectLiveSteering } from "../src/lib/transcript/liveSteering";
import { groupAssistantTurns, groupMessageToolCalls } from "../src/lib/toolCallGroups";
import type { ChatMessage, CheckpointTurnStatus, StreamItem } from "../src/lib/types";

const input: ChatMessage = { id: "input", role: "user", content: "request", timestamp: 100 };
const prefix: ChatMessage = {
  id: "response",
  role: "assistant",
  content: "Before the question",
  timestamp: 200,
  firstTokenAt: 150,
  items: [{ type: "text", content: "Before the question" }],
  turn: {
    id: "response",
    response_message_id: "response",
    input_message_id: "input",
    status: "interrupted",
    started_at: 100,
    first_token_at: 150,
  },
};
const grouped = (messages: ChatMessage[]) =>
  groupAssistantTurns(groupMessageToolCalls(messages.map((msg, index) => ({ msg, index }))));

describe("human interrupts belong to one logical Turn", () => {
  for (const name of ["ask_user", "create_file", "exec_command"]) {
    test(`${name} resume retains one row, its records and the original clock`, () => {
      const tool: StreamItem = { type: "tool_call", name, args: "{}", toolUseId: "request" };
      const interrupted = { ...prefix, items: [...prefix.items!, tool] };
      const messages = [input, interrupted];
      const entries = projectLiveSteering(grouped(messages), "resume-execution", [
        { type: "text", content: "After the answer" },
      ]);
      expect(entries.map((entry) => entry.key)).toEqual(["input", "response"]);
      const resumed = entries[1];
      expect(resumed.kind).toBe("live_stream");
      expect(assistantTurnStatus(entryAssistantMessages(resumed), true)).toBe("running");
      expect(
        assistantItems(resumed, [{ type: "text", content: "After the answer" }], "a", null),
      ).toEqual([...interrupted.items!, { type: "text", content: "After the answer" }]);
      expect(turnClock(messages)).toEqual({ startedAt: 100, firstTokenAt: 150 });
    });
  }

  for (const status of ["interrupted", "completed", "cancelled", "failed"] as const) {
    test(`appends a distinct resumed ${status} record despite the existing Turn owner`, () => {
      const resumed: ChatMessage = {
        id: "resume-execution",
        role: "assistant",
        content: "continued",
        timestamp: 300,
        transientTurnStatus: status,
        turn: { ...prefix.turn!, status },
      };
      const reconciled = reconcileTerminalAssistantMessage([input, prefix], resumed, "response");
      expect(reconciled.appended).toBe(true);
      expect(reconciled.messages).toEqual([input, prefix, resumed]);
      expect(grouped(reconciled.messages).map((entry) => entry.key)).toEqual(["input", "response"]);
      expect(assistantTurnStatus([prefix, resumed], false)).toBe(status);
      expect(
        reconcileTerminalAssistantMessage(reconciled.messages, resumed, "response").appended,
      ).toBe(false);
    });
  }

  test("a hydrated terminal Turn suppresses a late terminal event, while a new input starts a row", () => {
    const terminal = { ...prefix, turn: { ...prefix.turn!, status: "completed" as const } };
    const event = {
      ...terminal,
      id: "resume",
      transientTurnStatus: "completed" as CheckpointTurnStatus,
    };
    expect(reconcileTerminalAssistantMessage([input, terminal], event, "response").appended).toBe(
      false,
    );
    const nextInput = { ...input, id: "next-input", timestamp: 500 };
    const entries = projectLiveSteering(grouped([input, terminal, nextInput]), "next-response", []);
    expect(entries.map((entry) => entry.key)).toEqual([
      "input",
      "response",
      "next-input",
      "next-response",
    ]);
    expect(turnClock([input, terminal, nextInput])).toEqual({
      startedAt: 500,
      firstTokenAt: undefined,
    });
  });

  test("snapshot clients without Turn metadata keep the first record's row key", () => {
    const first = { ...prefix, turn: undefined };
    const second = { ...first, id: "resume", content: "continued" };
    expect(grouped([input, first, second])[1].key).toBe("response");
  });

  test("an abandoned or resolved question does not keep an old Turn waiting", () => {
    const request = { request_id: "question", conv_id: null, fields: [] };
    expect(hasPendingHumanInput([{ type: "user_input", request, state: "pending" }])).toBe(true);
    for (const state of ["answered", "cancelled", "unanswered"] as const) {
      expect(hasPendingHumanInput([{ type: "user_input", request, state }])).toBe(false);
    }
    expect(
      hasPendingHumanInput([
        {
          type: "tool_call",
          name: "create_file",
          args: "{}",
          approval: { request, state: "pending" },
        },
      ]),
    ).toBe(true);
  });
});
