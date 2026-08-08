// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  MORE_PANE_DEFAULT_WIDTH,
  MORE_PANE_MAX_WIDTH,
  MORE_PANE_MIN_WIDTH,
  clampMorePaneWidth,
  normalizeStoredMorePaneWidth,
} from "../src/lib/morePaneSizing";

describe("more pane sizing", () => {
  test("defaults to the skills pane width and clamps the resize range", () => {
    expect(MORE_PANE_DEFAULT_WIDTH).toBe(220);
    expect(clampMorePaneWidth(MORE_PANE_MIN_WIDTH - 1)).toBe(MORE_PANE_MIN_WIDTH);
    expect(clampMorePaneWidth(247.6)).toBe(248);
    expect(clampMorePaneWidth(MORE_PANE_MAX_WIDTH + 1)).toBe(MORE_PANE_MAX_WIDTH);
  });

  test("normalizes persisted values", () => {
    expect(normalizeStoredMorePaneWidth(null)).toBe(MORE_PANE_DEFAULT_WIDTH);
    expect(normalizeStoredMorePaneWidth("not-a-number")).toBe(MORE_PANE_DEFAULT_WIDTH);
    expect(normalizeStoredMorePaneWidth("120")).toBe(MORE_PANE_MIN_WIDTH);
    expect(normalizeStoredMorePaneWidth("420")).toBe(MORE_PANE_MAX_WIDTH);
    expect(normalizeStoredMorePaneWidth("264")).toBe(264);
  });
});
