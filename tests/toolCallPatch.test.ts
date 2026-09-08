// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { expect, test } from "bun:test";
import {
  MAX_TOOL_PATCH_PREVIEW_LINES,
  parseApplyPatchPreview,
  summarizePatchChanges,
} from "../src/lib/toolCallPatch";

test("projects every apply_patch file into a forward diff preview", () => {
  const previews = parseApplyPatchPreview(
    [
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "@@ -10,2 +10,2 @@",
      " const keep = true;",
      "-const before = 1;",
      "+const after = 2;",
      "*** Add File: docs/new.md",
      "+# New",
      "+content",
      "*** Delete File: docs/old.md",
      "*** End Patch",
    ].join("\n"),
  );

  expect(previews).toEqual([
    {
      path: "src/app.ts",
      operation: "update",
      additions: 1,
      removals: 1,
      lines: [
        { type: "context", text: "const keep = true;", oldLine: 10, newLine: 10 },
        { type: "remove", text: "-const before = 1;", oldLine: 11 },
        { type: "add", text: "+const after = 2;", newLine: 11 },
      ],
    },
    {
      path: "docs/new.md",
      operation: "add",
      additions: 2,
      removals: 0,
      lines: [
        { type: "add", text: "+# New", newLine: 1 },
        { type: "add", text: "+content", newLine: 2 },
      ],
    },
    { path: "docs/old.md", operation: "delete", additions: 0, removals: 0, lines: [] },
  ]);
  expect(summarizePatchChanges(previews)).toEqual({ files: 3, additions: 3, removals: 1 });
});

test("bounds apply_patch previews while retaining complete change counts", () => {
  const additions = Array.from(
    { length: MAX_TOOL_PATCH_PREVIEW_LINES * 2 },
    (_, index) => `+line ${index}`,
  );
  const [preview] = parseApplyPatchPreview(
    ["*** Begin Patch", "*** Add File: generated.txt", ...additions, "*** End Patch"].join("\n"),
  );

  expect(preview.lines).toHaveLength(MAX_TOOL_PATCH_PREVIEW_LINES);
  expect(preview.lines.at(-1)).toEqual({ type: "context", text: "..." });
  expect(preview.additions).toBe(MAX_TOOL_PATCH_PREVIEW_LINES * 2);
});
