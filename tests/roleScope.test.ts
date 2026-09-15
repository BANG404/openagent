// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  globalRoleSkillIds,
  globalRoleSkills,
  hasAllSelected,
  setAllSelected,
  toggleSelection,
} from "../src/lib/roleScope";
import type { SkillMetadata } from "../src/lib/types";

function skill(scope: SkillMetadata["scope"], dirName: string): SkillMetadata {
  return {
    name: dirName,
    description: `${dirName} description`,
    dir_name: dirName,
    path: `/skills/${dirName}`,
    scope,
  };
}

describe("global role skill associations", () => {
  test("offers only global skills", () => {
    expect(
      globalRoleSkills([
        skill("local", "workspace-skill"),
        skill("global", "global-skill"),
        skill("plugin:example", "plugin-skill"),
      ]).map((item) => item.dir_name),
    ).toEqual(["global-skill"]);
  });

  test("drops legacy non-global associations when editing", () => {
    expect(
      globalRoleSkillIds(["local:workspace-skill", "global:global-skill", "plugin:example:skill"]),
    ).toEqual(["global:global-skill"]);
  });
});

describe("role resource bulk selection", () => {
  test("selects and clears every listed association by default", () => {
    expect(setAllSelected([], ["a", "b"], true)).toEqual(["a", "b"]);
    expect(setAllSelected(["a", "b"], ["a", "b"], false)).toEqual([]);
  });

  test("never touches associations outside the offered rows", () => {
    // A search narrows the visible rows; the rest of the role stays selected.
    expect(setAllSelected(["a", "b"], ["a"], false)).toEqual(["b"]);
    expect(setAllSelected(["a"], ["b"], true)).toEqual(["a", "b"]);
  });

  test("keeps one entry per association", () => {
    expect(setAllSelected(["a"], ["a", "b"], true)).toEqual(["a", "b"]);
    expect(toggleSelection(["a"], "a", true)).toEqual(["a"]);
    expect(toggleSelection(["a", "b"], "a", false)).toEqual(["b"]);
  });

  test("reports a complete selection only for a listed, fully selected column", () => {
    expect(hasAllSelected(["a", "b"], ["a", "b"])).toBe(true);
    expect(hasAllSelected(["a"], ["a", "b"])).toBe(false);
    expect(hasAllSelected([], [])).toBe(false);
  });
});
