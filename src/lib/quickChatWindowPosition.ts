export interface QuickChatWindowPosition {
  x: number;
  y: number;
}

export interface PhysicalRect {
  position: QuickChatWindowPosition;
  size: {
    width: number;
    height: number;
  };
}

const storageKey = "openagent.quick-chat-window-position:v1";
const minimumVisibleWidth = 96;
const minimumVisibleHeight = 64;

export function loadQuickChatWindowPosition(storage: Storage): QuickChatWindowPosition | null {
  try {
    const value = JSON.parse(storage.getItem(storageKey) ?? "null");
    if (
      !value ||
      typeof value !== "object" ||
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y)
    ) {
      return null;
    }
    return { x: value.x, y: value.y };
  } catch {
    return null;
  }
}

export function saveQuickChatWindowPosition(
  storage: Storage,
  position: QuickChatWindowPosition,
): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
  storage.setItem(storageKey, JSON.stringify(position));
}

export function clearQuickChatWindowPosition(storage: Storage): void {
  storage.removeItem(storageKey);
}

export function isQuickChatWindowPositionVisible(
  position: QuickChatWindowPosition,
  windowSize: PhysicalRect["size"],
  monitorWorkAreas: readonly PhysicalRect[],
): boolean {
  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(windowSize.width) ||
    !Number.isFinite(windowSize.height) ||
    windowSize.width <= 0 ||
    windowSize.height <= 0
  ) {
    return false;
  }

  const windowRight = position.x + windowSize.width;
  const windowBottom = position.y + windowSize.height;
  return monitorWorkAreas.some((area) => {
    const areaRight = area.position.x + area.size.width;
    const areaBottom = area.position.y + area.size.height;
    const visibleWidth = Math.min(windowRight, areaRight) - Math.max(position.x, area.position.x);
    const visibleHeight =
      Math.min(windowBottom, areaBottom) - Math.max(position.y, area.position.y);
    return visibleWidth >= minimumVisibleWidth && visibleHeight >= minimumVisibleHeight;
  });
}
