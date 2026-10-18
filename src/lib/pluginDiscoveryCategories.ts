import type { TranslationKeys } from "./i18n";

/** User purposes in the store; independent of Runtime manifest categories and channels. */
export const PLUGIN_DISCOVERY_CATEGORIES = [
  "development",
  "projects",
  "channels",
  "collaboration",
  "orchestration",
  "automation",
  "themes",
  "other",
] as const;

export type PluginDiscoveryCategory = (typeof PLUGIN_DISCOVERY_CATEGORIES)[number];
export type PluginDiscoveryCategoryFilter = PluginDiscoveryCategory | "all" | "uncategorized";

export const pluginDiscoveryCategoryKeys: Record<PluginDiscoveryCategory, TranslationKeys> = {
  development: "pluginDiscoveryDevelopment",
  projects: "pluginDiscoveryProjects",
  channels: "pluginDiscoveryChannels",
  collaboration: "pluginDiscoveryCollaboration",
  orchestration: "pluginDiscoveryOrchestration",
  automation: "pluginDiscoveryAutomation",
  themes: "pluginDiscoveryThemes",
  other: "pluginCategoryOther",
};

export function isPluginDiscoveryCategory(value: unknown): value is PluginDiscoveryCategory {
  return (
    typeof value === "string" && PLUGIN_DISCOVERY_CATEGORIES.some((category) => category === value)
  );
}
