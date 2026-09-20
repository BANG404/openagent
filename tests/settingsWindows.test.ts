// @ts-nocheck -- legacy fixture typing is tracked separately from the strict test surface.
import { describe, expect, test } from "bun:test";
import {
  parseSettingsDestination,
  parseSettingsWindowKind,
  settingsSurfaceKey,
  settingsWindowSection,
  settingsWindowSections,
  settingsWindowTitles,
} from "../src/lib/settingsWindows";

describe("settings window domains", () => {
  test("keeps one title and one section list per domain", () => {
    const kinds = Object.keys(settingsWindowSections);

    expect(kinds).toEqual(Object.keys(settingsWindowTitles));
    for (const kind of kinds) {
      expect(settingsWindowTitles[kind]).toBeTruthy();
      expect(settingsWindowSection(kind, null)).toBe(settingsWindowSections[kind][0]);
      expect(parseSettingsWindowKind(kind)).toBe(kind);
    }
    expect(parseSettingsWindowKind("retired")).toBeNull();
  });

  test("falls back to the domain's first section for an unknown request", () => {
    expect(settingsWindowSection("integrations", "plugins")).toBe("plugins");
    expect(settingsWindowSection("integrations", "lifecycle")).toBe("channels");
    expect(settingsWindowSection("general", undefined)).toBe("general");
  });

  test("round-trips an in-window destination through navigation history", () => {
    const destination = { kind: "automation", section: "schedules" };
    const key = settingsSurfaceKey(destination);

    expect(key).toBeTruthy();
    expect(parseSettingsDestination(key)).toEqual(destination);
    expect(settingsSurfaceKey(null)).toBeNull();
    expect(parseSettingsDestination(null)).toEqual({ kind: "general", section: "general" });
    expect(parseSettingsDestination("retired\u0000retired")).toEqual({
      kind: "general",
      section: "general",
    });
  });
});
