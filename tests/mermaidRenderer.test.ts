import { describe, expect, test } from "bun:test";
import {
  detectMermaidDiagramType,
  mermaidToolFailure,
} from "../src/lib/streamdown/mermaidRenderer";
import { mermaidPalette } from "../src/lib/streamdown/mermaidPalette";

describe("Mermaid renderer results", () => {
  test("dark ER rows retain the theme surfaces and matching label colors", () => {
    const variables = mermaidPalette(
      {
        card: "#242838",
        "card-foreground": "#ffffff",
        foreground: "#e2e8f0",
        muted: "#1a1d27",
        "muted-foreground": "#8892a4",
      },
      true,
    );
    expect(variables.darkMode).toBe(true);
    expect(variables.attributeBackgroundColorOdd).toBe("#242838");
    expect(variables.attributeBackgroundColorEven).toBe("#1a1d27");
    expect(variables.primaryTextColor).toBe("#ffffff");
    expect(variables.nodeTextColor).toBe("#ffffff");
    expect(variables.actorLineColor).toBe("#8892a4");
    expect(mermaidPalette({}, false).darkMode).toBe(false);
  });
  test("detects the first declaration after comments", () => {
    expect(detectMermaidDiagramType("%% title\nflowchart TB\nA --> B")).toBe("flowchart");
    expect(detectMermaidDiagramType("graph LR\nA --> B")).toBe("flowchart");
    expect(detectMermaidDiagramType("sequenceDiagram\nA->>B: hello")).toBe("sequencediagram");
  });

  test("returns provider-readable parse locations", () => {
    const result = mermaidToolFailure({
      message: "Parse error on line 8",
      hash: {
        loc: {
          first_line: 8,
          first_column: 12,
        },
      },
    });

    expect(result).toEqual({
      ok: false,
      status: "error",
      error: {
        code: "render_failed",
        message: "Parse error on line 8",
        line: 8,
        column: 12,
      },
    });
  });
});
