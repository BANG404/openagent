/** Percentage of the theme's original interaction fill; typography and actions stay intact. */
export const DEFAULT_STYLE_CONTRAST = 60;

export function normalizeStyleContrast(value: unknown): number | undefined {
  if (value == null || !Number.isFinite(Number(value))) return undefined;
  return Math.min(100, Math.max(0, Math.floor(Number(value))));
}

/** Scale each original fill once, retaining aliases between hover and selection. */
export function withStyleContrast(
  input: Record<string, string>,
  contrast = DEFAULT_STYLE_CONTRAST,
): Record<string, string> {
  if (contrast === 100) return input;
  const tokens = { ...input };
  tokens["--interactive-state-opacity"] =
    `calc(${input["--interactive-state-opacity"] ?? "8%"} * ${contrast / 100})`;
  const fills = [
    "--interactive-state-bg",
    "--sidebar-accent",
    "--sidebar-selected",
    "--menu-accent",
    "--item-selected-bg",
    "--item-selected-hover-bg",
  ];
  const originals = { ...input };
  // A package with only a standard accent also supplies the sidebar's fill.
  if (!originals["--sidebar-accent"] && originals["--accent"])
    originals["--sidebar-accent"] = "var(--accent)";
  for (const key of fills) {
    const value = originals[key];
    if (!value) continue;
    const alias = /^var\((--[a-z-]+)\)$/.exec(value)?.[1];
    if (alias && (fills.includes(alias) || (alias === "--accent" && !input["--accent"]))) continue;
    tokens[key] = `color-mix(in srgb, ${value} ${contrast}%, transparent)`;
  }
  return tokens;
}
