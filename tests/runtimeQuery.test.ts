import { describe, expect, test } from "bun:test";
import { resolveRuntimeQuery } from "$lib/runtimeQuery";

describe("runtime query state", () => {
  test("keeps production query state free of development previews", () => {
    const state = resolveRuntimeQuery(
      "?automation-hooks-preview&settings-window=automation&frontend-version=42",
      false,
    );

    expect(state.frontendActivationVersion).toBe("42");
    expect(state.isAutomationHooksPreview).toBe(false);
    expect(state.standaloneDevPreview).toBeNull();
    expect(state.settingsWindowKind).toBe("automation");
    expect(state.isSettingsWindow).toBe(true);
  });

  test("resolves development preview flags and localized settings", () => {
    const state = resolveRuntimeQuery(
      "?automation-hooks-preview&automation-hooks-preview-theme=dark&automation-hooks-preview-locale=en&settings-section=schedules",
      true,
    );

    expect(state.isAutomationHooksPreview).toBe(true);
    expect(state.settingsWindowKind).toBe("automation");
    expect(state.settingsWindowInitialSection).toBe("schedules");
    expect(state.automationHooksPreviewTheme).toBe("dark");
    expect(state.automationHooksPreviewLocale).toBe("en");
    expect(state.isQuickChatSurface).toBe(false);
  });
});
