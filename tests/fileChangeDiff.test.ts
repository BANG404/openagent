// @ts-nocheck -- legacy fixture typing is tracked separately from the strict test surface.
import { describe, expect, test } from "bun:test";
import {
  fileChangeFullDiffLines,
  fileChangeProjectionLines,
  parseForwardFilePatch,
} from "../src/lib/fileChangeDiff";

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

describe("complete recorded file with inline diff", () => {
  const change = {
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

test("fragment diffs never present snippet offsets as file line numbers", () => {
  const change = {
    projection: {
      kind: "edited",
      available: true,
      complete: false,
      content: null,
      diff: "@@ -1 +1 @@\n-old\n+new\n",
    },
  };
  const expected = [
    { type: "remove", text: "-old" },
    { type: "add", text: "+new" },
  ];
  expect(fileChangeProjectionLines(change, "diff")).toEqual(expected);
  expect(fileChangeFullDiffLines(change)).toEqual(expected);
});
