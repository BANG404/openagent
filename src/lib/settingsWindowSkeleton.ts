import {
  settingsWindowSection,
  settingsWindowSections,
  type SettingsNav,
  type SettingsWindowKind,
} from "$lib/settingsWindows";

export type SettingsWindowSkeletonLayout = SettingsNav;

export interface SettingsWindowSkeletonSpec {
  section: SettingsNav;
  sections: SettingsNav[];
  layout: SettingsWindowSkeletonLayout;
  showNavigation: boolean;
}

export function settingsWindowSkeletonSpec(
  kind: SettingsWindowKind,
  requestedSection?: string | null,
): SettingsWindowSkeletonSpec {
  if (kind === "automation" && requestedSection === "hooks") {
    return {
      section: "hooks",
      sections: settingsWindowSections[kind],
      layout: "hooks",
      showNavigation: true,
    };
  }
  const section = settingsWindowSection(kind, requestedSection);
  const sections = settingsWindowSections[kind];
  return {
    section,
    sections,
    layout: section,
    showNavigation: sections.length > 1,
  };
}
