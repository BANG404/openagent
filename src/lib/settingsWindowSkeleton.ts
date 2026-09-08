import {
  settingsWindowSection,
  settingsWindowSections,
  type SettingsNav,
  type SettingsWindowKind,
} from "$lib/settingsWindows";

export type SettingsWindowSkeletonLayout = "content" | "collection" | "about";

export interface SettingsWindowSkeletonSpec {
  section: SettingsNav;
  sections: SettingsNav[];
  layout: SettingsWindowSkeletonLayout;
  showNavigation: boolean;
}

const collectionSections = new Set<SettingsNav>(["providers", "channels", "extensions"]);

export function settingsWindowSkeletonSpec(
  kind: SettingsWindowKind,
  requestedSection?: string | null,
): SettingsWindowSkeletonSpec {
  const section = settingsWindowSection(kind, requestedSection);
  const sections = settingsWindowSections[kind];
  return {
    section,
    sections,
    layout:
      section === "about" ? "about" : collectionSections.has(section) ? "collection" : "content",
    showNavigation: sections.length > 1,
  };
}
