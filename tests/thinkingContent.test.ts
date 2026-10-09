import { describe, expect, test } from "bun:test";
import {
  latestThinkingLine,
  normalizeThinkingContent,
} from "../src/lib/transcript/thinkingContent";

describe("thinking preview", () => {
  test("follows the latest partial line as new content arrives", () => {
    const content = "Inspect the boundaries.\nCheck the";
    expect(latestThinkingLine(content)).toBe("Check the");
    expect(latestThinkingLine(content + " stream.")).toBe("Check the stream.");
  });

  test("keeps the previous non-empty line through trailing blank chunks", () => {
    expect(latestThinkingLine("First line.\nLatest line.\n \t\n")).toBe("Latest line.");
    expect(latestThinkingLine("\r\n\t ")).toBe("");
  });

  test("handles LF, CRLF and CR without changing full content", () => {
    for (const newline of ["\n", "\r\n", "\r"]) {
      const content = `第一步${newline}  正在检查流式输出  `;
      expect(latestThinkingLine(content)).toBe("正在检查流式输出");
      expect(normalizeThinkingContent(content)).toBe(content);
    }
  });

  test("removes only the leading provider label for preview and full content", () => {
    const content = normalizeThinkingContent(" Reasoning： First line.\nanalysis: latest line.");
    expect(content).toBe("First line.\nanalysis: latest line.");
    expect(latestThinkingLine(content)).toBe("analysis: latest line.");
    expect(normalizeThinkingContent("analysis:")).toBe("");
  });
});
