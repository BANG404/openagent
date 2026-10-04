import { describe, expect, test } from "bun:test";
import { resolveRuntimeQuery } from "$lib/runtimeQuery";

describe("runtime query state", () => {
  test("does not open retired automation routes or previews", () => {
    for (const development of [false, true]) {
      const state = resolveRuntimeQuery(
        "?automation-hooks-preview&settings-window=automation&settings-section=schedules",
        development,
      );
      expect(state.settingsWindowKind).toBeNull();
      expect(state.isSettingsWindow).toBe(false);
      expect(state.settingsPreviewSection).toBeNull();
    }
  });

  test("keeps production query state free of development previews", () => {
    const state = resolveRuntimeQuery(
      "?agents-settings-preview&settings-window=agent&frontend-version=42",
      false,
    );

    expect(state.frontendActivationVersion).toBe("42");
    expect(state.isAgentsSettingsPreview).toBe(false);
    expect(state.standaloneDevPreview).toBeNull();
    expect(state.settingsWindowKind).toBe("agent");
    expect(state.isSettingsWindow).toBe(true);
  });

  test("resolves development preview flags and localized settings", () => {
    const state = resolveRuntimeQuery(
      "?agents-settings-preview&agents-settings-preview-theme=dark&agents-settings-preview-locale=en&settings-window=agent&settings-section=agents",
      true,
    );

    expect(state.isAgentsSettingsPreview).toBe(true);
    expect(state.settingsWindowKind).toBe("agent");
    expect(state.settingsWindowInitialSection).toBe("agents");
    expect(state.agentsSettingsPreviewTheme).toBe("dark");
    expect(state.agentsSettingsPreviewLocale).toBe("en");
    expect(state.isQuickChatSurface).toBe(false);
  });
});
