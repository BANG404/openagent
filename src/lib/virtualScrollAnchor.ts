export interface VirtualScrollAnchorCandidate {
  key: string;
  top: number;
  bottom: number;
}

/** Pick the first rendered row that intersects or follows the viewport start. */
export function selectVirtualScrollAnchor(
  candidates: VirtualScrollAnchorCandidate[],
  viewportTop: number,
): string | null {
  let anchor: VirtualScrollAnchorCandidate | null = null;
  for (const candidate of candidates) {
    if (candidate.bottom <= viewportTop) continue;
    if (!anchor || candidate.top < anchor.top) anchor = candidate;
  }
  return anchor?.key ?? null;
}

/** Keep an anchor at the same viewport coordinate after virtual layout changes. */
export function anchoredScrollTop(scrollTop: number, beforeTop: number, afterTop: number) {
  return Math.max(0, scrollTop + afterTop - beforeTop);
}
