// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  BROWSER_DESKTOP_VIEWPORT_WIDTH,
  browserViewportScale,
} from "../src/lib/browserViewportScale";

describe("browser viewport scale", () => {
  test("fits the desktop canvas into a narrow sidebar", () => {
    expect(browserViewportScale(640)).toBe(0.5);
    expect(browserViewportScale(320)).toBe(0.25);
  });

  test("keeps a wide viewport at native scale", () => {
    expect(browserViewportScale(BROWSER_DESKTOP_VIEWPORT_WIDTH)).toBe(1);
    expect(browserViewportScale(1440)).toBe(1);
  });

  test("uses native scale until a valid measurement is available", () => {
    expect(browserViewportScale(0)).toBe(1);
    expect(browserViewportScale(Number.NaN)).toBe(1);
  });
});
