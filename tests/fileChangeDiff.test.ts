// @ts-nocheck -- legacy fixture typing is tracked separately from the strict test surface.
import { describe, expect, test } from "bun:test";
import {
  fileChangeContent,
  fileChangeDiffLines,
  fileChangeFullDiffLines,
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

describe("recorded full file without a derived projection", () => {
  const recorded = (content: string) => {
    const bytes = new TextEncoder().encode(content);
    return {
      old_patch: "@@ -2 +2 @@\n-TWO\n+two",
      new_content_z: [
        40,
        181,
        47,
        253,
        32,
        bytes.length,
        ((bytes.length << 3) | 1) & 255,
        bytes.length >> 5,
        0,
        ...bytes,
      ],
    };
  };
  test("an edited raw snapshot exposes all lines, including unchanged Chinese text", () => {
    const change = recorded("第一行\r\nTWO\rthree\nFOUR\n");
    expect(fileChangeContent(change)).toBe("第一行\r\nTWO\rthree\nFOUR\n");
    expect(fileChangeProjectionLines(change, "content").map((line) => line.text)).toEqual([
      "第一行",
      "TWO",
      "three",
      "FOUR",
    ]);
    expect(fileChangeProjectionLines(change, "diff").map((line) => line.text)).toEqual([
      "-two",
      "+TWO",
    ]);
  });
  test("empty, missing and corrupt snapshots have distinct availability", () => {
    expect(fileChangeContent(recorded(""))).toBe("");
    expect(fileChangeContent({ new_content_z: null })).toBeNull();
    expect(fileChangeContent({ new_content_z: [1, 2, 3] })).toBeNull();
  });
  test("the authoritative projection wins even for deletion or unavailable content", () => {
    const change = { ...recorded("obsolete"), projection: { content: null } };
    expect(fileChangeContent(change)).toBeNull();
    change.projection.content = "最新记录";
    expect(fileChangeContent(change)).toBe("最新记录");
  });
});

describe("complete recorded file with inline diff", () => {
  const change = {
    old_patch: "reverse",
    projection: {
      content: "first\nNEW\nthird\nfourth\n",
      diff: "@@ -2 +2 @@\n-old\n+NEW\n",
      kind: "edited",
    },
  };
  test("includes context outside hunks and both sides of a replacement", () => {
    expect(fileChangeFullDiffLines(change)).toEqual([
      { type: "context", text: "first", oldLine: 1, newLine: 1 },
      { type: "remove", text: "-old", oldLine: 2 },
      { type: "add", text: "+NEW", newLine: 2 },
      { type: "context", text: "third", oldLine: 3, newLine: 3 },
      { type: "context", text: "fourth", oldLine: 4, newLine: 4 },
    ]);
  });
  test("keeps line numbers after deletion, insertion and separated hunks", () => {
    const row = {
      ...change,
      projection: {
        ...change.projection,
        content: "a\nc\nNEW\nd\ne\n",
        diff: "@@ -2 +1,0 @@\n-b\n@@ -3,0 +3 @@\n+NEW\n",
      },
    };
    // Zero-length hunk anchors are the line BEFORE the insertion/deletion.
    expect(fileChangeFullDiffLines(row).map((line) => line.text)).toEqual([
      "a",
      "-b",
      "c",
      "+NEW",
      "d",
      "e",
    ]);
  });
  test("a deleted file keeps its removed content while unavailable history stays neutral", () => {
    expect(
      fileChangeFullDiffLines({
        ...change,
        projection: { kind: "deleted", content: null, diff: "@@ -1,2 +0,0 @@\n-a\n-b\n" },
      }).map((line) => line.text),
    ).toEqual(["-a", "-b"]);
    expect(
      fileChangeFullDiffLines({
        ...change,
        projection: { kind: "edited", content: "a\nb\n", diff: null },
      }).map((line) => line.type),
    ).toEqual(["context", "context"]);
  });
});
