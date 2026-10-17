import themes from "./upstream/themes.json";
import presets from "./upstream/presets.json";
import fonts from "./upstream/fonts.json";
import { decodePreset, V1_CHART_COLOR_MAP } from "./upstream/preset";

export type ThemeRecipe = {
  style: string;
  baseColor: string;
  theme: string;
  chartColor: string;
  font: string;
  fontHeading: string;
  radius: string;
  menuAccent: string;
  menuColor: string;
};

export const BASE_COLORS = ["neutral", "stone", "zinc", "mauve", "olive", "mist", "taupe"];
export const RADII: Record<string, string> = {
  none: "0px",
  small: "0.45rem",
  medium: "0.625rem",
  large: "0.875rem",
};

// OpenAgent's compact desktop controls implement the upstream visual grammars
// through shared dimensions, rather than importing executable React styles.
const STYLES: Record<string, { height: number; padding: number; radius: string; text: number }> = {
  nova: { height: 32, padding: 12, radius: "0.625rem", text: 13 },
  vega: { height: 36, padding: 16, radius: "0.625rem", text: 14 },
  maia: { height: 38, padding: 18, radius: "0.875rem", text: 14 },
  lyra: { height: 32, padding: 12, radius: "0px", text: 12 },
  mira: { height: 28, padding: 10, radius: "0.5rem", text: 12 },
  luma: { height: 36, padding: 16, radius: "1rem", text: 14 },
  sera: { height: 36, padding: 16, radius: "0.25rem", text: 14 },
  rhea: { height: 28, padding: 10, radius: "0.875rem", text: 12 },
};

export function recipeFromPreset(value = "nova"): Partial<ThemeRecipe> {
  if (Object.hasOwn(presets, value)) return presets[value as keyof typeof presets];
  let code = value;
  if (value.startsWith("https://")) {
    const url = new URL(value);
    if (url.origin !== "https://ui.shadcn.com" || !["/create", "/init"].includes(url.pathname))
      throw new Error("Expected an official shadcn/create or /init URL");
    code = url.searchParams.get("preset") ?? "";
    const base = code ? recipeFromPreset(code) : presets.nova;
    const overrides = Object.fromEntries(
      Object.entries(base).filter(([key]) => key in presets.nova),
    );
    for (const key of Object.keys(presets.nova)) {
      const part = url.searchParams.get(key);
      if (part) overrides[key] = part;
    }
    return overrides;
  }
  const decoded = decodePreset(code);
  if (!decoded) throw new Error(`Unknown preset: ${value}`);
  return {
    ...decoded,
    chartColor: decoded.chartColor ?? V1_CHART_COLOR_MAP[decoded.theme] ?? decoded.theme,
  };
}

export function composeTheme(input: Partial<ThemeRecipe> = {}) {
  const recipe: ThemeRecipe = { ...presets.nova, ...input };
  const style = Object.hasOwn(STYLES, recipe.style) ? STYLES[recipe.style] : undefined;
  const base = themes.find((item) => item.name === recipe.baseColor);
  const accent = themes.find((item) => item.name === recipe.theme);
  const chart = themes.find((item) => item.name === recipe.chartColor);
  const font = fonts.find((item) => item.name === recipe.font);
  const heading = fonts.find((item) => item.name === recipe.fontHeading);
  if (
    !style ||
    !base ||
    !BASE_COLORS.includes(recipe.baseColor) ||
    !accent ||
    !chart ||
    !font ||
    (recipe.fontHeading !== "inherit" && !heading) ||
    !["default", ...Object.keys(RADII)].includes(recipe.radius) ||
    !["subtle", "bold"].includes(recipe.menuAccent) ||
    !["default", "inverted", "default-translucent", "inverted-translucent"].includes(
      recipe.menuColor,
    )
  )
    throw new Error("Unknown theme recipe option; use --list for supported values");

  const tokens: Record<string, string> = {
    "--font-sans": font.family,
    "--app-font-family": "var(--font-sans)",
    "--font-heading": heading?.family ?? "var(--font-sans)",
    "--radius": RADII[recipe.radius] ?? style.radius,
    "--app-font-size": `${style.text}px`,
    "--settings-control-height": `${style.height}px`,
    "--control-height": `${style.height}px`,
    "--control-padding-inline": `${style.padding}px`,
    "--menu-item-min-height": `${style.height - 4}px`,
    "--menu-item-font-size": `${style.text - 1}px`,
    "--menu-item-padding-inline": `${style.padding}px`,
    "--settings-card-row-padding-block": `${style.padding}px`,
    "--plugin-card-padding": `${style.padding}px`,
    "--settings-content-padding": `${style.padding * 2}px`,
  };
  if (font.type === "mono") tokens["--font-mono"] = font.family;
  const result = {
    version: 1 as const,
    tokens,
    light: {} as Record<string, string>,
    dark: {} as Record<string, string>,
  };
  for (const mode of ["light", "dark"] as const) {
    const merged: Record<string, string> = {
      ...(base.cssVars[mode] as Record<string, string>),
      ...(accent.cssVars[mode] as Record<string, string>),
    };
    delete merged.radius;
    for (let i = 1; i <= 5; i++) {
      const key = `chart-${i}` as "chart-1";
      const value = chart.cssVars[mode][key];
      if (value) merged[key] = value;
    }
    if (recipe.menuAccent === "bold") {
      merged.accent = merged.primary;
      merged["accent-foreground"] = merged["primary-foreground"];
    }
    const target = Object.fromEntries(
      Object.entries(merged).map(([key, value]) => [`--${key}`, value]),
    );
    const inverted = recipe.menuColor.startsWith("inverted");
    const translucent = recipe.menuColor.endsWith("translucent");
    const surface = inverted ? "var(--foreground)" : "var(--popover)";
    target["--menu-surface"] = translucent
      ? `color-mix(in srgb, ${surface} 85%, transparent)`
      : surface;
    target["--menu-foreground"] = inverted ? "var(--background)" : "var(--popover-foreground)";
    target["--menu-accent"] =
      recipe.menuAccent === "bold"
        ? "var(--primary)"
        : inverted
          ? "color-mix(in srgb, var(--background) 15%, transparent)"
          : "var(--accent)";
    target["--menu-accent-foreground"] =
      recipe.menuAccent === "bold" ? "var(--primary-foreground)" : "var(--menu-foreground)";
    result[mode] = target;
  }
  return { recipe, theme: result };
}

export const themeOptions = {
  styles: Object.keys(STYLES),
  baseColors: BASE_COLORS,
  themes: themes.map((item) => item.name),
  fonts: fonts.map((item) => item.name),
  radii: ["default", ...Object.keys(RADII)],
  menuAccents: ["subtle", "bold"],
  menuColors: ["default", "inverted", "default-translucent", "inverted-translucent"],
};
