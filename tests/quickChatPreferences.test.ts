// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";

import {
  loadQuickChatPreferences,
  resolveQuickChatModel,
  saveQuickChatPreferences,
} from "../src/lib/quickChatPreferences";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("quick chat preferences", () => {
  test("round-trips the launcher-owned model, role, and workspace", () => {
    const storage = memoryStorage();
    const preferences = {
      model: "provider:model",
      role: "reviewer",
      workspace: "C:\\work\\project",
    };

    saveQuickChatPreferences(storage, preferences);

    expect(loadQuickChatPreferences(storage)).toEqual(preferences);
  });

  test("ignores malformed and non-string values", () => {
    const storage = memoryStorage();
    storage.setItem(
      "openagent.quick-chat-preferences:v1",
      JSON.stringify({ model: 1, role: null, workspace: "C:\\work" }),
    );

    expect(loadQuickChatPreferences(storage)).toEqual({
      model: undefined,
      role: undefined,
      workspace: "C:\\work",
    });
  });

  test("preserves an available launcher model when settings change", () => {
    expect(
      resolveQuickChatModel("provider:preferred", "provider:default", [
        "provider:default",
        "provider:preferred",
      ]),
    ).toBe("provider:preferred");
  });

  test("falls back after the launcher model becomes unavailable", () => {
    expect(
      resolveQuickChatModel("provider:removed", "provider:default", [
        "provider:first",
        "provider:default",
      ]),
    ).toBe("provider:default");
    expect(resolveQuickChatModel("provider:removed", "provider:removed", ["provider:first"])).toBe(
      "provider:first",
    );
    expect(resolveQuickChatModel("provider:removed", "provider:removed", [])).toBe("");
  });
});
