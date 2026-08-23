export type AppNavigationSurface = "chat" | "settings";

export interface AppNavigationLocation {
  workspacePath: string;
  surface: AppNavigationSurface;
  conversationId: string | null;
  roleKey: string;
}

export interface AppNavigationHistory {
  entries: AppNavigationLocation[];
  index: number;
}

export function createNavigationHistory(): AppNavigationHistory {
  return { entries: [], index: -1 };
}

function navigationLocationKey(location: AppNavigationLocation): string {
  return [
    location.workspacePath,
    location.surface,
    location.conversationId ?? "",
    location.roleKey,
  ].join("\u0000");
}

export function recordNavigationLocation(
  history: AppNavigationHistory,
  location: AppNavigationLocation,
  maximumEntries = 50,
): AppNavigationHistory {
  const current = history.entries[history.index];
  if (current && navigationLocationKey(current) === navigationLocationKey(location)) {
    return history;
  }

  const entries = [...history.entries.slice(0, history.index + 1), location];
  const boundedEntries = entries.slice(-Math.max(1, maximumEntries));
  return {
    entries: boundedEntries,
    index: boundedEntries.length - 1,
  };
}

export function moveNavigationHistory(
  history: AppNavigationHistory,
  offset: -1 | 1,
): { history: AppNavigationHistory; location: AppNavigationLocation } | null {
  const index = history.index + offset;
  const location = history.entries[index];
  if (!location) return null;
  return {
    history: { ...history, index },
    location,
  };
}

export function removeNavigationLocations(
  history: AppNavigationHistory,
  shouldRemove: (location: AppNavigationLocation) => boolean,
): AppNavigationHistory {
  const entries = history.entries.filter((location) => !shouldRemove(location));
  if (entries.length === history.entries.length) return history;
  const removedBeforeOrAtCurrent = history.entries
    .slice(0, history.index + 1)
    .filter(shouldRemove).length;
  return {
    entries,
    index: Math.min(entries.length - 1, history.index - removedBeforeOrAtCurrent),
  };
}
