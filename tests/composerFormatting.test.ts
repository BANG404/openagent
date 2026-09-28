import { describe, expect, test } from "bun:test";
import { applyComposerFormat } from "../src/lib/components/composerFormatting";

describe("composer formatting", () => {
  test("wraps and selects formatted text", () => {
    expect(applyComposerFormat("hello", 0, 5, { prefix: "**" })).toEqual({
      value: "**hello**",
      start: 2,
      end: 7,
    });
  });

  test("toggles an existing format off", () => {
    expect(applyComposerFormat("**hello**", 2, 7, { prefix: "**" })).toEqual({
      value: "hello",
      start: 0,
      end: 5,
    });
  });

  test("inserts a placeholder when there is no selection", () => {
    expect(applyComposerFormat("say ", 4, 4, { prefix: "`", placeholder: "code" })).toEqual({
      value: "say `code`",
      start: 5,
      end: 9,
    });
  });
});
