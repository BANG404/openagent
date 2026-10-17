import type { AgentPluginSummary, AppConfig, ThemeColors, ThemeOverrides } from "$lib/types";
import { accentForeground, resolveThemeTokens } from "$lib/themeTokens";

export const THEME_FONTS: Record<string, string> = {
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Inter", sans-serif',
  sans: '"Inter Variable", "Inter", "Segoe UI", sans-serif',
  serif: 'Georgia, "Songti SC", "SimSun", serif',
  mono: '"JetBrains Mono Variable", "JetBrains Mono", "Cascadia Code", Consolas, monospace',
};

export function normalizeThemeOverrides(input?: Partial<ThemeOverrides>): ThemeOverrides {
  const colors = (input?: ThemeColors): ThemeColors =>
    Object.fromEntries(
      Object.entries(input ?? {})
        .filter(
          ([key, value]) =>
            ["accent", "background", "foreground"].includes(key) &&
            typeof value === "string" &&
            /^#[a-f0-9]{6}$/i.test(value.trim()),
        )
        .map(([key, value]) => [key, value.trim().toUpperCase()]),
    );
  const size = (value?: number): number | undefined =>
    value == null || !Number.isFinite(Number(value))
      ? undefined
      : Math.min(24, Math.max(10, Math.floor(Number(value))));
  return {
    light: colors(input?.light),
    dark: colors(input?.dark),
    opaque_background: input?.opaque_background === true,
    font_family:
      input?.font_family && Object.hasOwn(THEME_FONTS, input.font_family) ? input.font_family : "",
    ui_font_size: size(input?.ui_font_size),
    code_font_size: size(input?.code_font_size),
  };
}

/** An explicit theme/user canvas takes precedence over the native backdrop. */
export function usesNativeBackground(
  overrides: ThemeOverrides | undefined,
  tokens: Record<string, string>,
): boolean {
  return overrides?.opaque_background !== true && !tokens["--background"] && !tokens["--bg"];
}

export function integrationPlugins(plugins: AgentPluginSummary[]): AgentPluginSummary[] {
  return plugins
    .filter((plugin) => plugin.plugin_type === "integration")
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** The saved lifecycle switch wins while catalog refresh is still in flight. */
export function pluginThemeTokens(
  plugins: AgentPluginSummary[],
  enabled: Record<string, boolean> = {},
  dark = false,
  selected = "",
): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const plugin of [...plugins].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (
      plugin.plugin_type !== "theme" ||
      plugin.id !== selected ||
      !plugin.theme ||
      plugin.error ||
      !(enabled[plugin.id] ?? plugin.enabled)
    )
      continue;
    Object.assign(tokens, plugin.theme.tokens, dark ? plugin.theme.dark : plugin.theme.light);
  }
  return tokens;
}

/** Built-in design, selected enabled package, then saved user overrides. */
export function appearanceTokens(
  plugins: AgentPluginSummary[],
  config: Pick<AppConfig, "theme_plugin" | "theme_overrides" | "agent_plugins_enabled"> | null,
  dark = false,
): Record<string, string> {
  const tokens = resolveThemeTokens(
    pluginThemeTokens(plugins, config?.agent_plugins_enabled, dark, config?.theme_plugin),
  );
  const overrides = normalizeThemeOverrides(config?.theme_overrides);
  const colors = dark ? overrides.dark : overrides.light;
  if (colors.accent) {
    tokens["--primary"] = colors.accent;
    tokens["--primary-foreground"] = accentForeground(colors.accent);
    tokens["--primary-hover"] = `color-mix(in srgb, ${colors.accent} 85%, var(--foreground))`;
  }
  if (colors.background) {
    for (const key of [
      "--background",
      "--card",
      "--popover",
      "--app-chrome-bg",
      "--mica-surface",
      "--floating-surface",
      "--control-surface",
    ])
      tokens[key] = colors.background;
    for (const key of ["--muted", "--sidebar", "--component-neutral-bg"])
      tokens[key] = `color-mix(in srgb, ${colors.background} 96%, var(--foreground))`;
  }
  if (colors.foreground) {
    tokens["--foreground"] = colors.foreground;
    tokens["--card-foreground"] = colors.foreground;
    tokens["--popover-foreground"] = colors.foreground;
    tokens["--sidebar-foreground"] = colors.foreground;
    tokens["--muted-foreground"] = `color-mix(in srgb, ${colors.foreground} 60%, var(--card))`;
  }
  if (overrides.font_family) {
    tokens["--font-sans"] = THEME_FONTS[overrides.font_family];
    tokens["--app-font-family"] = THEME_FONTS[overrides.font_family];
  }
  if (overrides.ui_font_size) tokens["--app-font-size"] = `${overrides.ui_font_size}px`;
  if (overrides.code_font_size) tokens["--code-font-size"] = `${overrides.code_font_size}px`;
  return tokens;
}

/** Apply only custom properties and restore exact pre-existing inline values. */
export function applyPluginThemeTokens(
  element: HTMLElement,
  tokens: Record<string, string>,
): () => void {
  const previous = new Map<string, [string, string]>();
  for (const [name, value] of Object.entries(tokens)) {
    if (!/^--[a-z][a-z0-9-]{0,79}$/.test(name)) continue;
    previous.set(name, [
      element.style.getPropertyValue(name),
      element.style.getPropertyPriority(name),
    ]);
    element.style.setProperty(name, value);
  }
  return () => {
    for (const [name, [value, priority]] of previous) {
      if (value) element.style.setProperty(name, value, priority);
      else element.style.removeProperty(name);
    }
  };
}
