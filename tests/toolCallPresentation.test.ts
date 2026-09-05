// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { countTextLines, formatTextLineCount } from "../src/lib/toolCallPresentation";

describe("tool call presentation", () => {
  test("counts the complete write content instead of the tool result message", () => {
    const content = ["# Specification", "", "First requirement.", "Second requirement."].join("\n");

    expect(countTextLines(content)).toBe(4);
    expect(formatTextLineCount(content)).toBe("4 lines");
    expect(formatTextLineCount("File written successfully")).toBe("1 line");
  });

  test("formats empty and single-line content", () => {
    expect(formatTextLineCount("")).toBe("0 lines");
    expect(formatTextLineCount("content")).toBe("1 line");
  });
});
