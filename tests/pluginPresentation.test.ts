import { expect, test } from "bun:test";
import {
  channelPlugins,
  pluginThemeTokens,
  applyPluginThemeTokens,
  appearanceTokens,
  normalizeThemeOverrides,
  usesNativeBackground,
} from "../src/lib/pluginPresentation";
import type { AgentPluginSummary } from "../src/lib/types";

const plugin = (
  id: string,
  type: "theme" | "integration" | "agent" = "theme",
): AgentPluginSummary => ({
  id,
  name: id,
  builtin: false,
  version: "1.0.0",
  description: null,
  path: `/plugins/${id}`,
  repository: null,
  homepage: null,
  license: null,
  author: null,
  keywords: [],
  capabilities: [],
  commands: [],
  command_specs: [],
  message_policies: [],
  skills: [],
  mcp_servers: [],
  sidebar_views: [],
  automation_hooks: [],
  warnings: [],
  plugin_type: type,
  enabled: true,
  error: null,
  theme: {
    version: 1,
    tokens: { "--app-radius": "20px" },
    light: { "--primary": "#663399" },
    dark: { "--primary": "#cc99ff" },
  },
});

test("only the selected theme follows saved enablement and resolved appearance", () => {
  const first = plugin("a");
  const last = plugin("z");
  last.theme!.light["--primary"] = "#112233";
  expect(pluginThemeTokens([last, first], {}, false, "a")["--primary"]).toBe("#663399");
  expect(pluginThemeTokens([first], {}, true, "a")["--primary"]).toBe("#cc99ff");
  expect(pluginThemeTokens([first], { a: false }, false, "a")).toEqual({});
  expect(pluginThemeTokens([last, first])).toEqual({});
  first.enabled = false;
  expect(pluginThemeTokens([first])).toEqual({});
  expect(pluginThemeTokens([first], { a: true }, false, "a")["--app-radius"]).toBe("20px");
  first.error = "invalid package";
  expect(pluginThemeTokens([first], { a: true }, false, "a")).toEqual({});
  expect(pluginThemeTokens([plugin("ordinary", "agent")])).toEqual({});
});

test("user overrides win and light/dark palettes stay independent after package removal", () => {
  const theme = plugin("a");
  const config = {
    theme_plugin: "a",
    theme_overrides: {
      light: { accent: "#abcdef", background: "#ffffff" },
      dark: { foreground: "#eeeeee" },
      font_family: "serif",
      ui_font_size: 18,
      code_font_size: 16,
    },
  };
  expect(appearanceTokens([theme], config)["--primary"]).toBe("#ABCDEF");
  expect(appearanceTokens([theme], config)["--workspace-canvas"]).toBe("var(--sidebar)");
  expect(appearanceTokens([theme], config)["--app-radius"]).toBe("20px");
  expect(appearanceTokens([theme], config, true)["--primary"]).toBe("#cc99ff");
  expect(appearanceTokens([theme], config, true)["--foreground"]).toBe("#EEEEEE");
  expect(appearanceTokens([], config)["--app-radius"]).toBeUndefined();
  expect(appearanceTokens([], config)["--primary"]).toBe("#ABCDEF");
  expect(appearanceTokens([], config)["--app-font-size"]).toBe("18px");
  expect(appearanceTokens([], config)["--code-font-size"]).toBe("16px");
  expect(appearanceTokens([theme], config)["--font-sans"]).toBe(
    appearanceTokens([theme], config)["--app-font-family"],
  );
  expect(appearanceTokens([theme], { theme_plugin: "a" })["--primary"]).toBe("#663399");
});

test("override normalization rejects unsafe values and bounds typography", () => {
  expect(normalizeThemeOverrides()).toEqual({
    light: {},
    dark: {},
    opaque_background: false,
    font_family: "",
    ui_font_size: undefined,
    code_font_size: undefined,
  });
  const normalized = normalizeThemeOverrides({
    light: { accent: "url(secret)", background: " #abcDEF " },
    font_family: "url(secret)",
    ui_font_size: 99,
    code_font_size: 1,
  });
  expect(normalized.light).toEqual({ background: "#ABCDEF" });
  expect(normalized.font_family).toBe("");
  expect(normalized.ui_font_size).toBe(24);
  expect(normalized.code_font_size).toBe(10);
});

test("native background yields to opaque mode, plugin canvases and palette overrides", () => {
  const theme = plugin("a");
  theme.theme!.light["--bg"] = "#FFF8EE";
  const config = { theme_plugin: "a" };
  expect(usesNativeBackground(undefined, {})).toBe(true);
  expect(
    usesNativeBackground({ light: {}, dark: {}, font_family: "", opaque_background: true }, {}),
  ).toBe(false);
  expect(usesNativeBackground(undefined, appearanceTokens([theme], config))).toBe(false);
  expect(usesNativeBackground(undefined, appearanceTokens([theme], config, true))).toBe(true);
  expect(
    usesNativeBackground(
      undefined,
      appearanceTokens([], {
        theme_overrides: { light: { background: "#123456" }, dark: {}, font_family: "" },
      }),
    ),
  ).toBe(false);
  expect(
    usesNativeBackground(
      undefined,
      appearanceTokens([theme], { ...config, agent_plugins_enabled: { a: false } }),
    ),
  ).toBe(true);
});

test("channels include disabled communication integrations and exclude unrelated packages", () => {
  const channel = { ...plugin("imessage", "integration"), category: "communication" as const };
  channel.enabled = false;
  const observability = { ...plugin("langfuse", "integration"), category: "development" as const };
  const communicationAgent = { ...plugin("agent", "agent"), category: "communication" as const };
  expect(
    channelPlugins([
      plugin("theme"),
      communicationAgent,
      observability,
      plugin("unclassified", "integration"),
      channel,
    ]),
  ).toEqual([channel]);
});

test("theme removal restores previous inline values and priorities", () => {
  const values = new Map<string, [string, string]>([["--primary", ["red", "important"]]]);
  const element = {
    style: {
      getPropertyValue: (name: string) => values.get(name)?.[0] ?? "",
      getPropertyPriority: (name: string) => values.get(name)?.[1] ?? "",
      setProperty: (name: string, value: string, priority = "") =>
        values.set(name, [value, priority]),
      removeProperty: (name: string) => values.delete(name),
    },
  } as unknown as HTMLElement;
  const restore = applyPluginThemeTokens(element, {
    "--primary": "blue",
    "--app-radius": "20px",
    display: "none",
  });
  expect(values.get("--primary")).toEqual(["blue", ""]);
  expect(values.has("display")).toBe(false);
  restore();
  expect(values.get("--primary")).toEqual(["red", "important"]);
  expect(values.has("--app-radius")).toBe(false);
});
