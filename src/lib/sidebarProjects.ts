import type { RecentWorkspace } from "./types";
import { workspaceFolderName } from "./workspacePath";

export const pinnedProjectsStorageKey = "openagent.sidebar.pinnedProjects";
export const projectConversationPageSize = 5;

export function addWorkspaceToPersistedOrder(
  workspaces: RecentWorkspace[],
  path: string,
): RecentWorkspace[] {
  if (!path || workspaces.some((workspace) => workspace.path === path)) return workspaces;
  return [{ path, name: workspaceFolderName(path, path) }, ...workspaces];
}

export function projectsInPersistedOrder(
  recentWorkspaces: RecentWorkspace[],
  workspacePath: string,
): RecentWorkspace[] {
  const byPath = new Map<string, RecentWorkspace>();
  for (const workspace of recentWorkspaces) {
    if (!byPath.has(workspace.path)) byPath.set(workspace.path, workspace);
  }
  if (!workspacePath || byPath.has(workspacePath)) return [...byPath.values()];

  return [
    { path: workspacePath, name: workspaceFolderName(workspacePath, workspacePath) },
    ...byPath.values(),
  ];
}

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
