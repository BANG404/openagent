import type { TranslationKeys } from "./i18n";

/** Stable presentation IDs shared by package manifests and marketplace catalogs. */
export const PLUGIN_CATEGORIES = [
  "development",
  "productivity",
  "communication",
  "automation",
  "data",
  "design",
  "other",
] as const;
export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number];
export type PluginCategoryFilter = PluginCategory | "all" | "uncategorized";

export const pluginCategoryKeys: Record<PluginCategory, TranslationKeys> = {
  development: "pluginCategoryDevelopment",
  productivity: "pluginCategoryProductivity",
  communication: "pluginCategoryCommunication",
  automation: "pluginCategoryAutomation",
  data: "pluginCategoryData",
  design: "pluginCategoryDesign",
  other: "pluginCategoryOther",
};

export function isPluginCategory(value: unknown): value is PluginCategory {
  return typeof value === "string" && PLUGIN_CATEGORIES.some((category) => category === value);
}
