export const pinnedProjectsStorageKey = "openagent.sidebar.pinnedProjects";

export function parsePinnedProjectPaths(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(parsed.filter((path): path is string => typeof path === "string" && !!path)),
    ];
  } catch {
    return [];
  }
}

export function togglePinnedProjectPath(paths: string[], path: string): string[] {
  return paths.includes(path) ? paths.filter((item) => item !== path) : [path, ...paths];
}
