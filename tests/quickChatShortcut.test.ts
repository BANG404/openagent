// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";

import {
  DEFAULT_QUICK_CHAT_SHORTCUT,
  captureQuickChatShortcut,
  formatQuickChatShortcut,
  normalizeQuickChatShortcut,
} from "../src/lib/quickChatShortcut";

describe("quick chat shortcut", () => {
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
