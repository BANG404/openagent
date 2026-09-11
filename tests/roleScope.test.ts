// @ts-nocheck -- Bun's test runtime is available without @types/bun in the app tsconfig.
import { describe, expect, test } from "bun:test";
import { globalRoleSkillIds, globalRoleSkills } from "../src/lib/roleScope";
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
