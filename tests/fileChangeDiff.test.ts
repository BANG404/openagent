// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { fileChangeDiffLines, parseReverseFilePatch } from "../src/lib/fileChangeDiff";

describe("file change diff", () => {
  test("turns a stored reverse patch into a forward display", () => {
    expect(parseReverseFilePatch("@@ -1 +1 @@\n-new value\n+old value")).toEqual([
      { type: "remove", text: "-old value", oldLine: 1 },
      { type: "add", text: "+new value", newLine: 1 },
    ]);
  });

  test("renders zstd-compressed new files as added lines", () => {
    expect(
      fileChangeDiffLines({
        old_patch: null,
        new_content_z: [40, 181, 47, 253, 32, 4, 33, 0, 0, 97, 10, 98, 10],
      }),
    ).toEqual([
      { type: "add", text: "+a", newLine: 1 },
      { type: "add", text: "+b", newLine: 2 },
    ]);
  });

  test("falls back to the unavailable state for invalid compressed content", () => {
    expect(fileChangeDiffLines({ old_patch: null, new_content_z: [1, 2, 3] })).toEqual([]);
  });
});
