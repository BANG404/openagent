// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { expect, test } from "bun:test";
import {
  MAX_TOOL_PATCH_PREVIEW_LINES,
  applyFileChangeSnapshotsToPatchPreviews,
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

test("numbers every line in a delete patch body", () => {
  const [preview] = parseApplyPatchPreview(
    ["*** Begin Patch", "*** Delete File: docs/old.md", "-first", "-second", "*** End Patch"].join(
      "\n",
    ),
  );

  expect(preview).toMatchObject({ additions: 0, removals: 2 });
  expect(preview.lines).toEqual([
    { type: "remove", text: "-first", oldLine: 1 },
    { type: "remove", text: "-second", oldLine: 2 },
  ]);
});

test("hydrates bodyless delete previews from the pre-delete file snapshot", () => {
  const [preview] = parseApplyPatchPreview(
    ["*** Begin Patch", "*** Delete File: docs/old.md", "*** End Patch"].join("\n"),
  );
  const hydrated = applyFileChangeSnapshotsToPatchPreviews(
    [preview],
    [
      {
        path: "/workspace/docs/old.md",
        old_patch: "@@ -1,0 +1,3 @@\n+first\n+second\n+third",
      },
    ],
  );

  expect(hydrated[0]).toMatchObject({ additions: 0, removals: 3 });
  expect(hydrated[0].lines).toEqual([
    { type: "remove", text: "-first", oldLine: 1 },
    { type: "remove", text: "-second", oldLine: 2 },
    { type: "remove", text: "-third", oldLine: 3 },
  ]);
});
