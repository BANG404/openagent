// @ts-nocheck -- legacy fixture typing is tracked separately from the strict test surface.
import { describe, expect, test } from "bun:test";
import {
  fileChangeDiffLines,
  fileChangeProjectionLines,
  parseForwardFilePatch,
  parseReverseFilePatch,
} from "../src/lib/fileChangeDiff";

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

describe("cumulative file projection rendering", () => {
  const projection = {
    kind: "created",
    available: true,
    change_ids: ["create", "edit"],
    content: "one\r\nTWO\r\nthree\r\nfour\r\n",
    diff: "--- original\n+++ modified\n@@ -0,0 +1,4 @@\n+one\n+TWO\n+three\n+four\n",
  };
  test("shows every latest line for creation followed by edits", () => {
    expect(fileChangeProjectionLines({ projection }, "diff").map((line) => line.text)).toEqual([
      "+one",
      "+TWO",
      "+three",
      "+four",
    ]);
    expect(fileChangeProjectionLines({ projection }, "content")).toEqual(
      ["one", "TWO", "three", "four"].map((text, index) => ({
        type: "context",
        text,
        newLine: index + 1,
      })),
    );
  });
  test("retains indentation and literal header-like source text", () => {
    expect(
      parseForwardFilePatch("--- old\n+++ new\n@@ -1,2 +1,2 @@\n  context\n---old\n+++new\n"),
    ).toEqual([
      { type: "context", text: " context", oldLine: 1, newLine: 1 },
      { type: "remove", text: "---old", oldLine: 2 },
      { type: "add", text: "+++new", newLine: 2 },
    ]);
  });
  test("can show the latest content when cumulative history is unavailable", () => {
    const change = { projection: { ...projection, available: false, diff: null } };
    expect(fileChangeProjectionLines(change, "diff")).toEqual([]);
    expect(fileChangeProjectionLines(change, "content")).toHaveLength(4);
  });
});
