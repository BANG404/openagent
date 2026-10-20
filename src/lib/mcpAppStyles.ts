import { readThemePalette } from "./streamdown/themePalette";

/** MCP Apps standard style variables, resolved for the opaque widget document. */
export function mcpAppStyles() {
  const palette = readThemePalette();
  const variables: Record<string, string> = {};
  for (const [variable, token] of Object.entries({
    "--color-background-primary": "card",
    "--color-background-secondary": "muted",
    "--color-background-tertiary": "background",
    "--color-text-primary": "card-foreground",
    "--color-text-secondary": "muted-foreground",
    "--color-border-primary": "border",
    "--font-sans": "font",
  })) {
    if (palette[token]) variables[variable] = palette[token];
  }
  return { variables, css: { fonts: "" } };
}
