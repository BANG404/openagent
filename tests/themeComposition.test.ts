import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { composeTheme, recipeFromPreset, themeOptions } from "../scripts/themes/compose";
import { encodePreset } from "../scripts/themes/upstream/preset";
import { createThemePlugin } from "../scripts/create-theme-plugin";
import upstream from "../scripts/themes/upstream/themes.json";
import fontResources from "../scripts/themes/fonts/provenance.json";
import { accentForeground, resolveThemeTokens } from "../src/lib/themeTokens";

test("all base/accent/chart pairs preserve the official light/dark palette values", () => {
  for (const baseColor of themeOptions.baseColors) {
    for (const theme of themeOptions.themes) {
      for (const chartColor of themeOptions.themes) {
        const result = composeTheme({ baseColor, theme, chartColor }).theme;
        const base = upstream.find((entry) => entry.name === baseColor)!;
        const accent = upstream.find((entry) => entry.name === theme)!;
        const chart = upstream.find((entry) => entry.name === chartColor)!;
        for (const mode of ["light", "dark"] as const) {
          const expected: Record<string, string> = {
            ...(base.cssVars[mode] as Record<string, string>),
            ...(accent.cssVars[mode] as Record<string, string>),
          };
          delete expected.radius;
          for (let i = 1; i <= 5; i++) {
            const key = `chart-${i}` as "chart-1";
            expected[key] = chart.cssVars[mode][key]!;
          }
          for (const [key, value] of Object.entries(expected))
            expect(result[mode][`--${key}`]).toBe(value);
          expect(result[mode]["--primary-foreground"]).toBeTruthy();
        }
        expect(
          Object.keys(result.tokens).length +
            Object.keys(result.light).length +
            Object.keys(result.dark).length,
        ).toBeLessThanOrEqual(256);
      }
    }
  }
});

test("all named styles, fonts, radii and menu choices compose without losing independent axes", () => {
  for (const style of themeOptions.styles)
    for (const font of themeOptions.fonts) {
      const result = composeTheme({ ...recipeFromPreset(style), font });
      expect(result.recipe.style).toBe(style);
      expect(result.recipe.font).toBe(font);
      expect(result.theme.tokens["--font-sans"]).toBeTruthy();
      expect(result.theme.tokens["--control-height"]).toMatch(/px$/);
    }
  for (const radius of themeOptions.radii)
    for (const menuColor of themeOptions.menuColors) {
      const { theme } = composeTheme({
        radius,
        menuColor,
        menuAccent: "bold",
        fontHeading: "lora",
      });
      expect(theme.light["--accent"]).toBe(theme.light["--primary"]);
      expect(theme.dark["--accent-foreground"]).toBe(theme.dark["--primary-foreground"]);
      expect(theme.tokens["--font-heading"]).toContain("Lora");
      expect(theme.light["--menu-surface"].includes("85%")).toBe(menuColor.endsWith("translucent"));
      if (radius === "none") expect(theme.tokens["--radius"]).toBe("0px");
    }
  expect(() => composeTheme({ font: "unavailable-font" })).toThrow();
  expect(() => composeTheme({ baseColor: "gray" })).toThrow();
  expect(() => composeTheme({ style: "toString" })).toThrow();
});

test("official named presets, encoded recipes and create URLs preserve mix choices", () => {
  const recipe = {
    ...recipeFromPreset("sera"),
    theme: "rose",
    chartColor: "cyan",
    radius: "large",
  };
  const code = encodePreset({
    style: "sera",
    baseColor: "taupe",
    theme: "rose",
    chartColor: "cyan",
    radius: "large",
  });
  expect(recipeFromPreset(code)).toMatchObject({
    style: "sera",
    theme: "rose",
    chartColor: "cyan",
    radius: "large",
  });
  expect(
    recipeFromPreset(`https://ui.shadcn.com/create?preset=${code}&font=figtree`),
  ).toMatchObject({ font: "figtree", theme: "rose" });
  expect(composeTheme(recipe).theme.tokens["--radius"]).toBe("0.875rem");
  expect(() => recipeFromPreset("https://example.com/create")).toThrow();
  expect(() => recipeFromPreset("unknown")).toThrow();
  expect(() => recipeFromPreset("constructor")).toThrow();
  expect(recipeFromPreset("a0")).toMatchObject({ theme: "neutral", chartColor: "blue" });
});

test("generated packages retain recipe and upstream identity and never overwrite existing files", () => {
  const directory = mkdtempSync(join(tmpdir(), "oa-theme-package-"));
  const output = join(directory, "openagent-theme-mix");
  const result = createThemePlugin({
    id: "openagent-theme-mix",
    output,
    preset: "maia",
    overrides: { theme: "emerald", chartColor: "violet" },
  });
  expect(JSON.parse(readFileSync(join(output, "plugin.json"), "utf8"))).toEqual(result.manifest);
  expect(JSON.parse(readFileSync(join(output, "recipe.json"), "utf8"))).toMatchObject({
    style: "maia",
    theme: "emerald",
    chartColor: "violet",
  });
  expect(JSON.parse(readFileSync(join(output, "provenance.json"), "utf8")).revision).toMatch(
    /^[0-9a-f]{40}$/,
  );
  expect(existsSync(join(output, "LICENSE"))).toBe(true);
  expect(result.manifest.extensions.openagent.compatibility.features).toContain("theme-fonts-v1");
  expect(result.manifest.extensions.openagent.theme.fonts).toHaveLength(1);
  for (const font of result.manifest.extensions.openagent.theme.fonts) {
    expect(readFileSync(join(output, font.entry)).subarray(0, 4).toString()).toBe("wOF2");
    expect(existsSync(join(output, font.entry.replace(".woff2", ".LICENSE.txt")))).toBe(true);
  }
  const mixed = createThemePlugin({
    id: "openagent-theme-heading",
    output: join(directory, "heading"),
    overrides: { font: "figtree", fontHeading: "lora" },
  });
  expect(mixed.manifest.extensions.openagent.theme.fonts.map((font) => font.family)).toEqual([
    "Figtree Variable",
    "Lora Variable",
  ]);
  expect(() => createThemePlugin({ id: "openagent-theme-mix", output })).toThrow("already exists");
  expect(() => createThemePlugin({ id: "../escape", output: join(directory, "escape") })).toThrow();
});

test("every selectable font is bundled offline with matching digest and license", () => {
  expect(new Set(fontResources.map((font) => font.name))).toEqual(new Set(themeOptions.fonts));
  for (const font of fontResources) {
    const data = readFileSync(new URL(`../scripts/themes/fonts/${font.file}`, import.meta.url));
    expect(createHash("sha256").update(data).digest("hex")).toBe(font.sha256);
    expect(
      existsSync(new URL(`../scripts/themes/fonts/${font.name}.LICENSE.txt`, import.meta.url)),
    ).toBe(true);
  }
});

test("semantic names win over theme-v1 aliases and derived surfaces never replace explicit tokens", () => {
  const result = resolveThemeTokens({
    "--bg": "#111111",
    "--background": "#222222",
    "--surface": "#333333",
    "--control-surface": "#444444",
    "--popover": "#555555",
  });
  expect(result["--background"]).toBe("#222222");
  expect(result["--card"]).toBe("#333333");
  expect(result["--control-surface"]).toBe("#444444");
  expect(result["--mica-surface"]).toBe("var(--popover)");
  expect(accentForeground("#FFFFFF")).toBe("#000000");
  expect(accentForeground("#000000")).toBe("#FFFFFF");
  expect(accentForeground("#FFFF00")).toBe("#000000");
});

test("flat theme palettes retain a distinct workspace canvas without changing package colors", () => {
  const light = resolveThemeTokens({
    "--background": "white",
    "--card": "white",
    "--sidebar": "#fafafa",
  });
  expect(light["--workspace-canvas"]).toBe("var(--sidebar)");
  const dark = resolveThemeTokens({
    "--background": "#111111",
    "--card": "#222222",
    "--sidebar": "#222222",
  });
  expect(dark["--workspace-canvas"]).toBe("var(--background)");
  expect(dark["--card"]).toBe("#222222");
  expect(dark["--sidebar"]).toBe("#222222");
  const flat = { "--background": "white", "--card": "white" };
  expect(resolveThemeTokens(flat)["--workspace-canvas"]).toContain("color-mix");
  expect(resolveThemeTokens({ ...flat, "--workspace-canvas": "pink" })["--workspace-canvas"]).toBe(
    "pink",
  );
});
