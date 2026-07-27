// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  detectMermaidDiagramType,
  mermaidToolFailure,
} from "../src/lib/streamdown/mermaidRenderer";

describe("Mermaid renderer results", () => {
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
