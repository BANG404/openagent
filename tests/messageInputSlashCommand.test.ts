// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { applySlashCommandSelection } from "../src/lib/components/slashCommandSelection";

describe("composer slash command selection", () => {
  test("inserts /goal before an existing draft", () => {
    expect(applySlashCommandSelection("/gkeep this draft", 0, 2, "/goal")).toEqual({
      value: "/goal keep this draft",
      caret: 6,
    });
  });

  test("inserts /graph while preserving existing whitespace", () => {
    expect(applySlashCommandSelection("/gr  keep this draft", 0, 3, "/graph")).toEqual({
      value: "/graph  keep this draft",
      caret: 6,
    });
  });
});
