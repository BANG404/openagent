import { invoke } from "$lib/openagent/tauriClient";

export type SettingsNav =
  | "general"
  | "channels"
  | "providers"
  | "defaults"
  | "execution"
  | "agents"
  | "memory"
  | "hooks"
  | "plugins"
  | "extensions"
  | "about";

export type SettingsWindowKind =
  "models" | "agent" | "integrations" | "memory" | "automation" | "about";

export const settingsWindowSections: Record<SettingsWindowKind, SettingsNav[]> = {
  models: ["providers", "defaults"],
  agent: ["execution", "agents"],
  integrations: ["channels", "extensions", "plugins"],
  memory: ["memory"],
  automation: ["hooks"],
  about: ["about"],
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

export function openSettingsWindow(kind: SettingsWindowKind, section?: SettingsNav): Promise<void> {
  return invoke("open_settings_window", { kind, section });
}
