// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { anchoredScrollTop, selectVirtualScrollAnchor } from "../src/lib/virtualScrollAnchor";

describe("virtual transcript scroll anchoring", () => {
  test("anchors the rendered row that crosses the viewport start", () => {
    expect(
      selectVirtualScrollAnchor(
        [
          { key: "above", top: -300, bottom: -20 },
          { key: "crossing", top: -20, bottom: 180 },
          { key: "below", top: 180, bottom: 300 },
        ],
        0,
      ),
    ).toBe("crossing");
  });

  test("falls forward to the first row below an empty viewport edge", () => {
    expect(
      selectVirtualScrollAnchor(
        [
          { key: "later", top: 240, bottom: 360 },
          { key: "first", top: 120, bottom: 220 },
        ],
        0,
      ),
    ).toBe("first");
  });

  test("compensates from real anchor movement after the browser changes scroll bounds", () => {
    expect(anchoredScrollTop(700, 20, -180)).toBe(500);
    expect(anchoredScrollTop(120, 40, 340)).toBe(420);
    expect(anchoredScrollTop(40, 40, -80)).toBe(0);
  });
});
