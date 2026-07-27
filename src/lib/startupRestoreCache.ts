export type CachedRestoreSurface = "conversation" | "new-conversation";

export interface StartupRestoreHint {
  workspace: string;
  surface: CachedRestoreSurface;
  conversationId: string | null;
}

const STORAGE_KEY = "openagent.startup-restore:v1";

interface StartupRestoreCache {
  last: StartupRestoreHint | null;
  workspaces: Record<string, StartupRestoreHint>;
}

function readCache(): StartupRestoreCache {
  if (typeof window === "undefined") return { last: null, workspaces: {} };
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as StartupRestoreCache | null;
    return value
      && value.workspaces
      && typeof value.workspaces === "object"
      && !Array.isArray(value.workspaces)
      ? value
      : { last: null, workspaces: {} };
  } catch {
    return { last: null, workspaces: {} };
  }
}

function validHint(value: StartupRestoreHint | null | undefined): StartupRestoreHint | null {
  if (
    !value
    || typeof value.workspace !== "string"
    || (value.surface !== "conversation" && value.surface !== "new-conversation")
    || (value.conversationId !== null && typeof value.conversationId !== "string")
    || (value.surface === "conversation" && !value.conversationId)
    || (value.surface === "new-conversation" && value.conversationId !== null)
  ) {
    return null;
  }
  return value;
}

export function readStartupRestoreHint(): StartupRestoreHint | null {
  return validHint(readCache().last);
}

export function readWorkspaceRestoreHint(workspace: string): StartupRestoreHint | null {
  return validHint(readCache().workspaces[workspace]);
}

export function writeStartupRestoreHint(hint: StartupRestoreHint): void {
  if (typeof window === "undefined") return;
  const cache = readCache();
  cache.last = hint;
  cache.workspaces[hint.workspace] = hint;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // The durable SQLite selection remains authoritative when storage is unavailable.
  }
}
