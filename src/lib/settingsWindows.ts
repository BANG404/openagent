import type { TranslationKeys } from "$lib/i18n";

export type SettingsNav =
  | "general"
  | "channels"
  | "providers"
  | "defaults"
  | "execution"
  | "agents"
  | "memory"
  | "lifecycle"
  | "schedules"
  | "extensions"
  | "plugins"
  | "about";

export type SettingsWindowKind =
  "general" | "models" | "agent" | "integrations" | "memory" | "automation" | "about";

export const settingsWindowSections: Record<SettingsWindowKind, SettingsNav[]> = {
  general: ["general"],
  models: ["providers", "defaults"],
  agent: ["execution", "agents"],
  integrations: ["channels", "extensions", "plugins"],
  memory: ["memory"],
  automation: ["lifecycle", "schedules"],
  about: ["about"],
};

export const settingsWindowTitles: Record<SettingsWindowKind, TranslationKeys> = {
  general: "settingsTitle",
  models: "modelsWindowTitle",
  agent: "agentWindowTitle",
  integrations: "integrationsWindowTitle",
  memory: "memoryManagement",
  automation: "automationWindowTitle",
  about: "aboutWindowTitle",
};

export function parseSettingsWindowKind(value: string | null): SettingsWindowKind | null {
  return value && value in settingsWindowSections ? (value as SettingsWindowKind) : null;
}

export function settingsWindowSection(
  kind: SettingsWindowKind,
  requested: string | null | undefined,
): SettingsNav {
  const sections = settingsWindowSections[kind];
  return sections.includes(requested as SettingsNav) ? (requested as SettingsNav) : sections[0];
}

/**
 * Navigation history keeps an opaque destination key so back and forward
 * restore the exact in-window management surface instead of a generic one.
 */
export function settingsSurfaceKey(
  destination: { kind: SettingsWindowKind; section: SettingsNav } | null,
): string | null {
  return destination ? `${destination.kind}\u0000${destination.section}` : null;
}

export function parseSettingsDestination(value: string | null | undefined): {
  kind: SettingsWindowKind;
  section: SettingsNav;
} {
  const [kind, section] = (value ?? "").split("\u0000");
  const resolvedKind = parseSettingsWindowKind(kind ?? null) ?? "general";
  return { kind: resolvedKind, section: settingsWindowSection(resolvedKind, section) };
}
