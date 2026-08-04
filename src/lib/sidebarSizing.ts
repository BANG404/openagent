export const SIDEBAR_DEFAULT_WIDTH = 220;
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 360;

const SIDEBAR_WIDTH_STORAGE_KEY = "openagent.sidebar.width";

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

export function normalizeStoredSidebarWidth(value: string | null): number {
  if (value === null || value.trim() === "") return SIDEBAR_DEFAULT_WIDTH;
  const width = Number(value);
  return Number.isFinite(width) ? clampSidebarWidth(width) : SIDEBAR_DEFAULT_WIDTH;
}

export function loadSidebarWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
  try {
    return normalizeStoredSidebarWidth(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

export function saveSidebarWidth(width: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clampSidebarWidth(width)));
  } catch {
    // Keep resizing available when storage is blocked or unavailable.
  }
}
