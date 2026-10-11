import { writable } from "svelte/store";
import type { AppConfig } from "./types";

export type AppearanceConfig = Pick<
  AppConfig,
  "theme_plugin" | "theme_overrides" | "agent_plugins_enabled"
>;
export const appearancePreview = writable<AppearanceConfig | null>(null);
