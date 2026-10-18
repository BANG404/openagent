import { describe, expect, test } from "bun:test";
import { fileCodeLanguage, highlightDiffLines } from "../src/lib/streamdown/diffHighlight";
import type { FileChangeDiffLine } from "../src/lib/fileChangeDiff";

describe("file diff syntax", () => {
  test("recognizes common extensions and named configuration files", () => {
    for (const [path, language] of [
      ["C:\\work\\MAIN.TS", "typescript"],
      ["script.ps1", "powershell"],
      ["Dockerfile", "docker"],
      [".env.local", "dotenv"],
      ["file.unknown", null],
    ]) {
      expect(fileCodeLanguage(path!)).toBe(language);
    }
  });
  test("multiline grammar is separate for removed and added revisions", async () => {
    const lines: FileChangeDiffLine[] = [
      { type: "remove", text: "-/* old comment", oldLine: 1 },
      { type: "remove", text: "-still a comment */", oldLine: 2 },
      { type: "add", text: '+const text: string = "你好";', newLine: 1 },
      { type: "context", text: "/* next comment", oldLine: 3, newLine: 2 },
      { type: "context", text: "continued */", oldLine: 4, newLine: 3 },
      { type: "add", text: "+const after = 1;", newLine: 40 },
    ];
    const tokens = await highlightDiffLines(lines, "file.ts");
    expect(tokens.map((row) => row.map((token) => token.content).join(""))).toEqual(
      lines.map((line) => (line.type === "context" ? line.text : line.text.slice(1))),
    );
    expect(tokens[2].length).toBeGreaterThan(1);
    expect(tokens[2][0].htmlStyle?.["--shiki-light"]).toBeDefined();
    expect(tokens[2][0].htmlStyle?.["--shiki-dark"]).toBeDefined();
    expect(tokens[1][0].htmlStyle).toEqual(tokens[4][0].htmlStyle);
    expect(tokens[5][0].htmlStyle).toEqual(tokens[2][0].htmlStyle);
  });
  test("unknown files retain literal text including markup", async () => {
    const text = '<script>alert("你好")</script>';
    const tokens = await highlightDiffLines(
      [{ type: "add", text: `+${text}`, newLine: 1 }],
      "file.unknown",
    );
    expect(tokens[0]).toEqual([{ content: text, offset: 0 }]);
  });
  test("minified HTML and oversized files retain complete source without syntax spans", async () => {
    for (const source of [
      [
        "<!doctype html>",
        "<style>" + ".car{color:red}".repeat(500) + "</style>",
        "<script>" + "move();".repeat(500) + "</script>",
      ],
      Array.from({ length: 2_001 }, () => "<p>你好</p>"),
      Array.from({ length: 100 }, () => "x".repeat(1_001)),
      Array.from({ length: 40 }, () => '<div a="b">x</div>'.repeat(100)),
    ]) {
      const lines: FileChangeDiffLine[] = source.map((text, index) => ({
        type: "add",
        text: `+${text}`,
        newLine: index + 1,
      }));
      const tokens = await highlightDiffLines(lines, "index.html");
      expect(tokens.map((row) => row.map((token) => token.content).join(""))).toEqual(source);
      expect(tokens.every((row) => row.length === 1 && !row[0].htmlStyle)).toBe(true);
    }
  });
});
