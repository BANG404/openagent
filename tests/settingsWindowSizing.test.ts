// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";

import {
  SETTINGS_WINDOW_MAX_HEIGHT,
  SETTINGS_WINDOW_MIN_HEIGHT,
  resolveSettingsWindowSize,
} from "../src/lib/settingsWindowSizing";

describe("settings utility window sizing", () => {
  test("uses compact domain widths for short content", () => {
    expect(resolveSettingsWindowSize("general", 640, 1440, 900)).toEqual({
      width: 920,
      height: 640,
    });
    expect(resolveSettingsWindowSize("about", 460, 1440, 900)).toEqual({
      width: 680,
      height: 460,
    });
    expect(resolveSettingsWindowSize("memory", 540, 1440, 900)).toEqual({
      width: 780,
      height: 540,
    });
  });

  test("keeps long content within the monitor work area", () => {
    expect(resolveSettingsWindowSize("models", 1400, 1280, 720)).toEqual({
      width: 980,
      height: 672,
    });
    expect(resolveSettingsWindowSize("agent", 1400, 1920, 1080).height).toBe(
      SETTINGS_WINDOW_MAX_HEIGHT,
    );
  });

  test("preserves a usable minimum for sparse and constrained content", () => {
    expect(resolveSettingsWindowSize("about", 120, 600, 360)).toEqual({
      width: 640,
      height: SETTINGS_WINDOW_MIN_HEIGHT,
    });
  });
});
