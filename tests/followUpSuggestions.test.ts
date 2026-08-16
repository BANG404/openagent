// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { latestTurnAssistantMessageId } from "../src/lib/followUpSuggestions";

describe("latestTurnAssistantMessageId", () => {
  test("selects only the final assistant reply on the active branch", () => {
    expect(
      latestTurnAssistantMessageId([
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
      latestTurnAssistantMessageId([
        { id: "user-1", role: "user" },
        { id: "assistant-1", role: "assistant" },
        { id: "user-2", role: "user" },
      ]),
    ).toBeNull();
  });

  test("ignores trailing non-turn records", () => {
    expect(
      latestTurnAssistantMessageId([
        { id: "user-1", role: "user" },
        { id: "assistant-1", role: "assistant" },
        { id: "notice", role: "system" },
      ]),
    ).toBe("assistant-1");
  });
});
