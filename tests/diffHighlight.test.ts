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
});
