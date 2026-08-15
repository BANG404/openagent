// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { parsePinnedProjectPaths, togglePinnedProjectPath } from "../src/lib/sidebarProjects";

describe("sidebar project pins", () => {
  test("loads only unique non-empty paths", () => {
    expect(parsePinnedProjectPaths('["C:/one","","C:/one","C:/two",3]')).toEqual([
      "C:/one",
      "C:/two",
    ]);
    expect(parsePinnedProjectPaths("not json")).toEqual([]);
  });

  test("adds a new pin first and removes an existing pin", () => {
    expect(togglePinnedProjectPath(["C:/one"], "C:/two")).toEqual(["C:/two", "C:/one"]);
    expect(togglePinnedProjectPath(["C:/one", "C:/two"], "C:/one")).toEqual(["C:/two"]);
  });
});
