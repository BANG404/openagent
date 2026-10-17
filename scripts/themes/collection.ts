import type { ThemeRecipe } from "./compose";

/** Independently published examples: all upstream styles plus two cross-axis mixes. */
export const themeCollection: Array<{
  id: string;
  title: string;
  preset: string;
  overrides?: Partial<ThemeRecipe>;
}> = [
  ...["nova", "vega", "maia", "lyra", "mira", "luma", "sera", "rhea"].map((preset) => ({
    id: `openagent-theme-${preset}`,
    title: preset[0].toUpperCase() + preset.slice(1),
    preset,
  })),
  {
    id: "openagent-theme-garden",
    title: "Garden",
    preset: "maia",
    overrides: {
      baseColor: "olive",
      theme: "emerald",
      chartColor: "violet",
      fontHeading: "lora",
      radius: "large",
      menuAccent: "bold",
    },
  },
  {
    id: "openagent-theme-rose-ink",
    title: "Rose Ink",
    preset: "sera",
    overrides: {
      baseColor: "taupe",
      theme: "rose",
      chartColor: "cyan",
      font: "noto-sans",
      fontHeading: "playfair-display",
      menuColor: "inverted-translucent",
    },
  },
];
