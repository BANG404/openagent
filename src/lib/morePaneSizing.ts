export const MORE_PANE_DEFAULT_WIDTH = 220;
export const MORE_PANE_MIN_WIDTH = 180;
export const MORE_PANE_MAX_WIDTH = 360;

const MORE_PANE_WIDTH_STORAGE_KEY = "openagent.more-pane.width";

export function clampMorePaneWidth(width: number): number {
  return Math.min(MORE_PANE_MAX_WIDTH, Math.max(MORE_PANE_MIN_WIDTH, Math.round(width)));
}

export function normalizeStoredMorePaneWidth(value: string | null): number {
  if (value === null || value.trim() === "") return MORE_PANE_DEFAULT_WIDTH;
  const width = Number(value);
  return Number.isFinite(width) ? clampMorePaneWidth(width) : MORE_PANE_DEFAULT_WIDTH;
}

export function loadMorePaneWidth(): number {
  if (typeof window === "undefined") return MORE_PANE_DEFAULT_WIDTH;
  try {
    return normalizeStoredMorePaneWidth(window.localStorage.getItem(MORE_PANE_WIDTH_STORAGE_KEY));
  } catch {
    return MORE_PANE_DEFAULT_WIDTH;
  }
}

export function saveMorePaneWidth(width: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MORE_PANE_WIDTH_STORAGE_KEY, String(clampMorePaneWidth(width)));
  } catch {
    // Resizing remains available when local storage is blocked.
  }
}
