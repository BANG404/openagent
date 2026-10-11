import { expect, test } from "bun:test";
import {
  parseEditFilePreview,
  MAX_TOOL_EDIT_PREVIEW_CHARACTERS,
  MAX_TOOL_EDIT_PREVIEW_LINES,
} from "../src/lib/toolEditPreview";
import { toolArgHint } from "../src/lib/toolCallGroups";

test("structured edits use the path regardless of argument order", () => {
  expect(
    toolArgHint(
      JSON.stringify({ edits: [{ old_text: "a", new_text: "b" }], path: "src/config.ts" }),
    ),
  ).toBe("src/config.ts");
  expect(toolArgHint('{"options":{"nested":true}}')).toBe("");
  expect(toolArgHint('{"items":[1,2],"query":"needle"}')).toBe("needle");
  expect(toolArgHint('{"edits":')).toBe("");
});

test("replacement fragments preserve whitespace, deletions and unknown offsets", () => {
  const preview = parseEditFilePreview({
    edits: [
      { old_text: "  a\r\n\r\nb", new_text: "  c\n" },
      { old_text: "remove", new_text: "" },
      { old_text: 123, new_text: "invalid" },
      null,
    ],
  });
  expect(preview).toEqual({
    replacements: 2,
    additions: 1,
    removals: 4,
    lines: [
      { type: "remove", text: "-  a" },
      { type: "remove", text: "-" },
      { type: "remove", text: "-b" },
      { type: "add", text: "+  c" },
      { type: "remove", text: "-remove" },
    ],
  });
});

test("large replacements bound DOM and source bytes but preserve complete counts", () => {
  const preview = parseEditFilePreview({
    edits: [{ old_text: "old\n".repeat(20_000), new_text: "new\n".repeat(20_000) }],
  });
  expect(preview).toMatchObject({ replacements: 1, additions: 20_000, removals: 20_000 });
  expect(preview.lines).toHaveLength(MAX_TOOL_EDIT_PREVIEW_LINES);
  expect(preview.lines.at(-1)).toEqual({ type: "context", text: "..." });
  const longLine = parseEditFilePreview({
    edits: [{ old_text: "x".repeat(MAX_TOOL_EDIT_PREVIEW_CHARACTERS + 1), new_text: "short" }],
  });
  expect(preview.lines.some((line) => line.type === "add")).toBe(true);
  expect(preview.lines.some((line) => line.type === "remove")).toBe(true);
  expect(longLine.lines).toEqual([
    { type: "add", text: "+short" },
    { type: "context", text: "..." },
  ]);
  expect(longLine).toMatchObject({ additions: 1, removals: 1 });
});
