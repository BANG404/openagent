export const BROWSER_DESKTOP_VIEWPORT_WIDTH = 1280;

export function browserViewportScale(containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 1;
  return Math.min(1, containerWidth / BROWSER_DESKTOP_VIEWPORT_WIDTH);
}
