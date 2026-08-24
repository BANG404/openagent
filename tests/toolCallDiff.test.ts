// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { expect, test } from "bun:test";
import {
  buildReplacementDiff,
  MAX_TOOL_DIFF_PREVIEW_CHARACTERS_PER_SIDE,
  MAX_TOOL_DIFF_PREVIEW_LINES,
} from "../src/lib/toolCallDiff";

test("keeps a small replacement diff complete", () => {
  expect(buildReplacementDiff("before\nold\nafter", "before\nnew\nafter")).toEqual([
    { type: "context", text: "  before" },
    { type: "remove", text: "- old" },
    { type: "add", text: "+ new" },
    { type: "context", text: "  after" },
  ]);
});

test("bounds large replacement previews before they reach the transcript DOM", () => {
  const oldText = Array.from({ length: 2_000 }, (_, index) => `old ${index}`).join("\n");
  const newText = Array.from({ length: 2_000 }, (_, index) => `new ${index}`).join("\n");

  const diff = buildReplacementDiff(oldText, newText);

  expect(diff).toHaveLength(MAX_TOOL_DIFF_PREVIEW_LINES);
  expect(diff.at(-1)).toEqual({ type: "context", text: "  …" });
});

test("bounds large single-line replacement text", () => {
  const diff = buildReplacementDiff(
    "a".repeat(MAX_TOOL_DIFF_PREVIEW_CHARACTERS_PER_SIDE * 2),
    "b".repeat(MAX_TOOL_DIFF_PREVIEW_CHARACTERS_PER_SIDE * 2),
  );

  expect(diff.at(-1)).toEqual({ type: "context", text: "  …" });
  expect(diff.slice(0, -1).every((line) => line.text.length <= 24_002)).toBe(true);
});
