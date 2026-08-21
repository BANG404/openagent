import type { Conversation, RecentWorkspace } from "./types";
import { workspaceFolderName } from "./workspacePath";

export const pinnedProjectsStorageKey = "openagent.sidebar.pinnedProjects";
export const projectConversationPageSize = 5;
export const recentConversationLimit = 20;

export type ProjectConversationSnapshots = Record<string, Conversation[]>;

function sortRecentConversations(conversations: Conversation[]): Conversation[] {
  return conversations.sort(
    (left, right) => right.updatedAt - left.updatedAt || right.id.localeCompare(left.id),
  );
}

export function promoteRecentConversation(
  previous: Conversation[],
  conversation: Conversation,
  workspacePath: string,
): Conversation[] {
  const promoted = {
    ...conversation,
    workspace: conversation.workspace ?? workspacePath,
  };
  return sortRecentConversations([
    promoted,
    ...previous.filter((item) => item.id !== conversation.id),
  ]).slice(0, recentConversationLimit);
}

export function mergeRecentConversationRefresh(
  previous: Conversation[],
  incoming: Conversation[],
): Conversation[] {
  const refreshedById = new Map(incoming.map((conversation) => [conversation.id, conversation]));
  const oldestIncomingUpdatedAt = incoming.at(-1)?.updatedAt ?? Number.NEGATIVE_INFINITY;

  for (const conversation of previous) {
    const refreshed = refreshedById.get(conversation.id);
    if (refreshed) {
      if (conversation.updatedAt > refreshed.updatedAt) {
        refreshedById.set(conversation.id, conversation);
      }
      continue;
    }
    if (
      incoming.length < recentConversationLimit ||
      conversation.updatedAt >= oldestIncomingUpdatedAt
    ) {
      refreshedById.set(conversation.id, conversation);
    }
  }

  return sortRecentConversations([...refreshedById.values()]).slice(0, recentConversationLimit);
}

export function removeProjectConversationSnapshot(
  previous: ProjectConversationSnapshots,
  workspacePath: string,
  conversationId: string,
): ProjectConversationSnapshots {
  const conversations = previous[workspacePath];
  if (!conversations?.some((conversation) => conversation.id === conversationId)) return previous;
  return {
    ...previous,
    [workspacePath]: conversations.filter((conversation) => conversation.id !== conversationId),
  };
}

function mergeProjectConversations(
  previous: Conversation[],
  incoming: Conversation[],
  workspacePath: string,
): Conversation[] {
  const byId = new Map(previous.map((conversation) => [conversation.id, conversation]));
  for (const conversation of incoming) {
    byId.set(
      conversation.id,
      conversation.workspace === workspacePath
        ? conversation
        : { ...conversation, workspace: workspacePath },
    );
  }
  return [...byId.values()];
}

export function updateProjectConversationSnapshots(
  previous: ProjectConversationSnapshots,
  workspacePath: string,
  conversations: Conversation[],
  recentConversations: Conversation[],
): ProjectConversationSnapshots {
  const next = { ...previous };
  const recentsByWorkspace = new Map<string, Conversation[]>();

  for (const conversation of recentConversations) {
    if (!conversation.workspace) continue;
    const workspaceConversations = recentsByWorkspace.get(conversation.workspace) ?? [];
    workspaceConversations.push(conversation);
    recentsByWorkspace.set(conversation.workspace, workspaceConversations);
  }

  for (const [path, workspaceConversations] of recentsByWorkspace) {
    if (path === workspacePath) continue;
    next[path] = mergeProjectConversations(next[path] ?? [], workspaceConversations, path);
  }

  if (workspacePath) {
    next[workspacePath] = mergeProjectConversations([], conversations, workspacePath);
  }

  return next;
}

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
