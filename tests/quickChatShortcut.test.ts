// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";

import {
  DEFAULT_QUICK_CHAT_SHORTCUT,
  QUICK_CHAT_FOCUS_INPUT_EVENT,
  captureQuickChatShortcut,
  formatQuickChatShortcut,
  normalizeQuickChatShortcut,
} from "../src/lib/quickChatShortcut";

describe("quick chat shortcut", () => {
  test("returns focus to the composer whenever the shortcut reveals the launcher", async () => {
    const [windowSource, surfaceSource, inputSource] = await Promise.all([
      Bun.file(new URL("../src/lib/quickChatWindow.ts", import.meta.url)).text(),
      Bun.file(new URL("../src/lib/components/QuickChatSurface.svelte", import.meta.url)).text(),
      Bun.file(new URL("../src/lib/components/MessageInput.svelte", import.meta.url)).text(),
    ]);

    expect(QUICK_CHAT_FOCUS_INPUT_EVENT).toBe("quick-chat-focus-input");
    expect(windowSource).toMatch(
      /await quickWindow\.setFocus\(\);\s+await emit\(QUICK_CHAT_FOCUS_INPUT_EVENT\);/,
    );
    expect(surfaceSource).toContain("inputFocusRequest += 1;");
    expect(surfaceSource).toContain("focusRequest={inputFocusRequest}");
    expect(inputSource).toMatch(/if \(focusRequest > 0\) void focusInput\(\);/);
  });

  test("records from the window instead of relying on button focus", async () => {
    const settingsSource = await Bun.file(
      new URL("../src/lib/components/SettingsView.svelte", import.meta.url),
    ).text();

    expect(settingsSource).toContain("<svelte:window onkeydown={handleQuickShortcutKeydown} />");
    expect(settingsSource).not.toMatch(
      /class="shortcut-recorder"[\s\S]*?onkeydown=\{handleQuickShortcutKeydown\}/,
    );
  });

  test("reloads the hidden launcher after an in-app settings save", async () => {
    const [pageSource, surfaceSource] = await Promise.all([
      Bun.file(new URL("../src/routes/+page.svelte", import.meta.url)).text(),
      Bun.file(new URL("../src/lib/components/QuickChatSurface.svelte", import.meta.url)).text(),
    ]);
    const saveSettingsSource = pageSource.slice(
      pageSource.indexOf("async function saveSettings"),
      pageSource.indexOf("function completeOnboarding"),
    );

    expect(saveSettingsSource).toContain('await emit("settings-changed").catch');
    expect(surfaceSource).toContain('listen("settings-changed"');
    expect(surfaceSource).toContain("loadSettings(selectedModel).then(persistPreferences)");
  });

  test("normalizes missing and unsafe shortcuts to the default", () => {
    expect(normalizeQuickChatShortcut(undefined)).toBe(DEFAULT_QUICK_CHAT_SHORTCUT);
    expect(normalizeQuickChatShortcut("KeyK")).toBe(DEFAULT_QUICK_CHAT_SHORTCUT);
    expect(normalizeQuickChatShortcut("Shift+Shift+KeyK")).toBe(DEFAULT_QUICK_CHAT_SHORTCUT);
    expect(normalizeQuickChatShortcut("CommandOrControl+Alt+KeyK")).toBe(
      "CommandOrControl+Alt+KeyK",
    );
  });

  test("captures a portable accelerator from a keyboard event", () => {
    expect(
      captureQuickChatShortcut({
        altKey: true,
        code: "KeyK",
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
      }),
    ).toEqual({ kind: "shortcut", value: "CommandOrControl+Alt+KeyK" });
    expect(
      captureQuickChatShortcut({
        altKey: false,
        code: "KeyK",
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      }),
    ).toEqual({ kind: "error", reason: "modifier_required" });
  });

  test("formats accelerators for the current platform", () => {
    expect(formatQuickChatShortcut("CommandOrControl+Shift+Space", false)).toBe(
      "Ctrl + Shift + Space",
    );
    expect(formatQuickChatShortcut("CommandOrControl+Shift+Space", true)).toBe("⌘ + ⇧ + Space");
  });
});
