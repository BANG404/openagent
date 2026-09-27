import { describe, expect, test } from "bun:test";
import { findNextComponentStart, parseComponentAt } from "../src/lib/streamdown/parser";
import { evalArgs } from "../src/lib/streamdown/runtime";

describe("component call parser", () => {
  test("parses nested components, containers, expressions, and escaped strings", () => {
    const source = String.raw`Card(title: "line\n\u263A", body: Text(value: "a" + "b"), options: {"enabled": true, count: -1.5e2, tags: [null, $name, ("x" + "y"),],}, note: """multi
line""")`;
    const result = parseComponentAt(source, 0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.end).toBe(source.length);
    expect(evalArgs(result.value.args)).toEqual({
      title: "line\n☺",
      body: {
        kind: "component",
        name: "Text",
        args: [
          [
            "value",
            {
              kind: "binary",
              op: "+",
              left: { kind: "string", value: "a" },
              right: { kind: "string", value: "b" },
            },
          ],
        ],
      },
      options: { enabled: true, count: -150, tags: [null, undefined, '"x""y"'] },
      note: "multi\nline",
    });
  });

  test("reports malformed escapes and missing delimiters at the input boundary", () => {
    for (const source of [
      String.raw`Card(title: "bad\u12G4")`,
      'Card(title: "unfinished)',
      'Card(title: "ok", values: [1 2])',
      "Card(options: {key 1})",
      'Card(title: ("ok")',
    ]) {
      expect(parseComponentAt(source, 0).ok).toBe(false);
    }
  });

  test("finds only standalone uppercase component heads", () => {
    const source = "prefixCard(x: 1) $Hidden(x: 2) Card(x: 3)";
    expect(findNextComponentStart(source)).toBe(source.indexOf("Card(x: 3)"));
    expect(findNextComponentStart(source, source.length)).toBe(-1);
  });
});
