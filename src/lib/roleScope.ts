import type { SkillMetadata } from "$lib/types";

export function globalRoleSkills(skills: SkillMetadata[]): SkillMetadata[] {
  return skills.filter((skill) => skill.scope === "global");
}

export function globalRoleSkillIds(skillIds: string[]): string[] {
  return skillIds.filter((skillId) => skillId.startsWith("global:"));
}

/** Add or remove one association, keeping the list free of duplicates. */
export function toggleSelection(selected: string[], value: string, checked: boolean): string[] {
  return checked ? [...new Set([...selected, value])] : selected.filter((item) => item !== value);
}

/**
 * Select or clear every candidate association.
 *
 * The role editor's columns narrow what a role can reach, so a bulk action must
 * never touch associations outside the rows it was offered — an active search
 * filters the candidates and leaves the rest of the role's selection alone.
 */
export function setAllSelected(
  selected: string[],
  candidates: string[],
  checked: boolean,
): string[] {
  if (checked) return [...new Set([...selected, ...candidates])];
  const cleared = new Set(candidates);
  return selected.filter((item) => !cleared.has(item));
}

/** Whether every candidate association is already selected. */
export function hasAllSelected(selected: string[], candidates: string[]): boolean {
  return candidates.length > 0 && candidates.every((item) => selected.includes(item));
}
