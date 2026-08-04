// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  normalizeStoredSidebarWidth,
} from "../src/lib/sidebarSizing";

describe("sidebar sizing", () => {
  test("clamps and rounds widths to the supported range", () => {
    expect(clampSidebarWidth(SIDEBAR_MIN_WIDTH - 1)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(247.6)).toBe(248);
    expect(clampSidebarWidth(SIDEBAR_MAX_WIDTH + 1)).toBe(SIDEBAR_MAX_WIDTH);
  });

  test("normalizes persisted values", () => {
    expect(normalizeStoredSidebarWidth(null)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(normalizeStoredSidebarWidth("not-a-number")).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(normalizeStoredSidebarWidth("120")).toBe(SIDEBAR_MIN_WIDTH);
    expect(normalizeStoredSidebarWidth("420")).toBe(SIDEBAR_MAX_WIDTH);
    expect(normalizeStoredSidebarWidth("264")).toBe(264);
  });
});
