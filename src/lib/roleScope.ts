import type { SkillMetadata } from "$lib/types";

export function globalRoleSkills(skills: SkillMetadata[]): SkillMetadata[] {
  return skills.filter((skill) => skill.scope === "global");
}

export function globalRoleSkillIds(skillIds: string[]): string[] {
  return skillIds.filter((skillId) => skillId.startsWith("global:"));
}
