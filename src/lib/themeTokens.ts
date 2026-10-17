/** Theme-v1 packages remain readable while all application consumers use semantic tokens. */
export const LEGACY_THEME_TOKENS: Readonly<Record<string, string>> = {
  "--bg": "--background",
  "--text": "--foreground",
  "--text-muted": "--muted-foreground",
  "--surface": "--card",
  "--surface2": "--muted",
  "--danger": "--destructive",
  "--sidebar-bg": "--sidebar",
  "--app-radius": "--radius",
};

/** Fill application-specific surfaces from a standard theme without replacing explicit values. */
export function resolveThemeTokens(input: Record<string, string>): Record<string, string> {
  const tokens = { ...input };
  for (const [legacy, semantic] of Object.entries(LEGACY_THEME_TOKENS)) {
    if (tokens[legacy] && !tokens[semantic]) tokens[semantic] = tokens[legacy];
  }
  const defaults: Record<string, string> = {
    "--background": "--app-chrome-bg",
    "--card": "--conversation-surface",
    "--muted": "--component-neutral-bg",
    "--popover": "--mica-surface",
    "--border": "--mica-border",
  };
  for (const [source, target] of Object.entries(defaults)) {
    if (tokens[source] && !tokens[target]) tokens[target] = `var(${source})`;
  }
  if (tokens["--card"]) tokens["--control-surface"] ??= "var(--card)";
  if (tokens["--accent"]) tokens["--interactive-state-bg"] ??= "var(--accent)";
  if (tokens["--popover"]) {
    tokens["--floating-surface"] ??= "var(--popover)";
  }
  if (tokens["--border"]) {
    tokens["--mica-divider"] ??= "var(--border)";
    tokens["--composer-border"] ??= "var(--border)";
  }
  // A standard color theme supplies its own matching foreground. Legacy accent-only
  // packages retain the built-in button foreground until the author adds a pair.
  return tokens;
}

/** Pick a legible foreground for the hex-only user accent control (WCAG luminance). */
export function accentForeground(hex: string): string {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? "#000000" : "#FFFFFF";
}
