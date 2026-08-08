// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { resolveListSelection } from "../src/lib/listSelection";

const items = [
  { id: "first", label: "First" },
  { id: "second", label: "Second" },
];

describe("list selection fallback", () => {
  test("keeps the current item and refreshes its object", () => {
    expect(resolveListSelection(items, { id: "second", label: "Old" }, (item) => item.id)).toBe(
      items[1],
    );
  });

  test("selects the first item when the current item is missing", () => {
    expect(
      resolveListSelection(items, { id: "removed", label: "Removed" }, (item) => item.id),
    ).toBe(items[0]);
  });

  test("returns null only when the list is empty", () => {
    expect(resolveListSelection([], null, (item: { id: string }) => item.id)).toBeNull();
  });
});
