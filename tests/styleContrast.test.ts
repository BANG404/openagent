import { expect, test } from "bun:test";
import {
  DEFAULT_STYLE_CONTRAST,
  normalizeStyleContrast,
  withStyleContrast,
} from "../src/lib/styleContrast";
import { appearanceTokens } from "../src/lib/pluginPresentation";

test("contrast preserves zero, bounds finite integers, and defaults missing or invalid values", () => {
  expect(DEFAULT_STYLE_CONTRAST).toBe(60);
  expect(normalizeStyleContrast(undefined)).toBeUndefined();
  expect(normalizeStyleContrast(Number.NaN)).toBeUndefined();
  expect(normalizeStyleContrast(Infinity)).toBeUndefined();
  expect(normalizeStyleContrast(0)).toBe(0);
  expect(normalizeStyleContrast(-5)).toBe(0);
  expect(normalizeStyleContrast(150)).toBe(100);
  expect(normalizeStyleContrast(82.9)).toBe(82);
});

test("theme selection aliases follow hover exactly once while distinct selections remain distinct", () => {
  const source = {
    "--sidebar-accent": "#dedede",
    "--sidebar-selected": "var(--sidebar-accent)",
    "--sidebar-selected-foreground": "#111111",
    "--primary": "#0066cc",
    "--foreground": "#111111",
  };
  const soft = withStyleContrast(source);
  expect(soft["--sidebar-accent"]).toBe("color-mix(in srgb, #dedede 60%, transparent)");
  expect(soft["--sidebar-selected"]).toBe("var(--sidebar-accent)");
  for (const key of ["--sidebar-selected-foreground", "--primary", "--foreground"])
    expect(soft[key]).toBe(source[key as keyof typeof source]);
  const separate = withStyleContrast({ ...source, "--sidebar-selected": "#bfdbfe" }, 20);
  expect(separate["--sidebar-selected"]).toBe("color-mix(in srgb, #bfdbfe 20%, transparent)");
  expect(withStyleContrast(source, 100)).toEqual(source);
  expect(source["--sidebar-accent"]).toBe("#dedede");
});

test("built-in interactions and accent-only themes scale without creating CSS variable cycles", () => {
  const builtin = appearanceTokens([], null);
  expect(builtin["--interactive-state-opacity"]).toBe("calc(8% * 0.6)");
  expect(builtin["--interactive-state-bg"]).toBeUndefined();
  expect(builtin["--sidebar-accent"]).toBeUndefined();
  const accentOnly = withStyleContrast({
    "--accent": "#eeeeee",
    "--interactive-state-bg": "var(--accent)",
  });
  expect(accentOnly["--sidebar-accent"]).toBe("color-mix(in srgb, var(--accent) 60%, transparent)");
  expect(accentOnly["--interactive-state-bg"]).toBe(accentOnly["--sidebar-accent"]);
  const aliases = withStyleContrast({
    "--sidebar-accent": "var(--interactive-state-bg)",
    "--menu-accent": "var(--sidebar-accent)",
  });
  expect(aliases["--sidebar-accent"]).toBe("var(--interactive-state-bg)");
  expect(aliases["--menu-accent"]).toBe("var(--sidebar-accent)");
  expect(
    appearanceTokens([], {
      theme_overrides: { light: {}, dark: {}, font_family: "", style_contrast: 100 },
    }),
  ).toEqual({});
});
