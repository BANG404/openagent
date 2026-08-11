// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";

import {
  clearQuickChatWindowPosition,
  isQuickChatWindowPositionVisible,
  loadQuickChatWindowPosition,
  saveQuickChatWindowPosition,
} from "../src/lib/quickChatWindowPosition";

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

describe("quick chat window position", () => {
  test("round-trips and clears a dragged physical position", () => {
    const storage = memoryStorage();
    saveQuickChatWindowPosition(storage, { x: -620, y: 84 });
    expect(loadQuickChatWindowPosition(storage)).toEqual({ x: -620, y: 84 });
    clearQuickChatWindowPosition(storage);
    expect(loadQuickChatWindowPosition(storage)).toBeNull();
  });

  test("rejects malformed legacy storage", () => {
    const storage = memoryStorage();
    storage.setItem("openagent.quick-chat-window-position:v1", '{"x":"12","y":null}');
    expect(loadQuickChatWindowPosition(storage)).toBeNull();
  });

  test("accepts positions with a usable portion on any current monitor", () => {
    const monitors = [
      { position: { x: -1920, y: 0 }, size: { width: 1920, height: 1040 } },
      { position: { x: 0, y: 0 }, size: { width: 2560, height: 1400 } },
    ];
    expect(
      isQuickChatWindowPositionVisible({ x: -600, y: 80 }, { width: 760, height: 532 }, monitors),
    ).toBe(true);
    expect(
      isQuickChatWindowPositionVisible({ x: 2500, y: 120 }, { width: 760, height: 532 }, monitors),
    ).toBe(false);
  });

  test("rejects a position from a disconnected monitor", () => {
    const monitors = [{ position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } }];
    expect(
      isQuickChatWindowPositionVisible({ x: 2400, y: 100 }, { width: 760, height: 532 }, monitors),
    ).toBe(false);
  });
});
