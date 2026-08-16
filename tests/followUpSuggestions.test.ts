// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { latestTurnSuggestionHostMessageId } from "../src/lib/followUpSuggestions";

describe("latestTurnSuggestionHostMessageId", () => {
  test("selects only the final assistant reply on the active branch", () => {
    expect(
      latestTurnSuggestionHostMessageId([
        { id: "user-1", role: "user" },
        { id: "assistant-1", role: "assistant" },
        { id: "user-2", role: "user" },
        { id: "assistant-2a", role: "assistant" },
        { id: "assistant-2b", role: "assistant" },
      ]),
    ).toBe("assistant-2b");
  });

  test("does not revive an older suggestion after a newer user message", () => {
    expect(
      latestTurnSuggestionHostMessageId([
        { id: "user-1", role: "user" },
        { id: "assistant-1", role: "assistant" },
        { id: "user-2", role: "user" },
      ]),
    ).toBeNull();
  });

  test("ignores trailing non-turn records", () => {
    expect(
      latestTurnSuggestionHostMessageId([
        { id: "user-1", role: "user" },
        { id: "assistant-1", role: "assistant" },
        { id: "notice", role: "system" },
      ]),
    ).toBe("assistant-1");
  });

  test("uses the logical Turn response ID across tool rounds", () => {
    expect(
      latestTurnSuggestionHostMessageId([
        { id: "user-1", role: "user", timestamp: 1 },
        {
          id: "assistant-turn",
          role: "assistant",
          turn: { response_message_id: "assistant-turn" },
        },
        { id: "tool-result", role: "user", timestamp: 0 },
        { id: "assistant-final", role: "assistant" },
      ]),
    ).toBe("assistant-turn");
  });
});
