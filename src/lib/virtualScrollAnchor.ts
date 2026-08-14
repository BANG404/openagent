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

export interface VirtualMeasurementScroll {
  followingTail: boolean;
  scrollTop: number;
  scrollHeight: number;
  anchorBeforeTop?: number;
  anchorAfterTop?: number;
}

/** Resolve one scroll destination for a measured virtual-layout update. */
export function virtualMeasurementScrollTop({
  followingTail,
  scrollTop,
  scrollHeight,
  anchorBeforeTop,
  anchorAfterTop,
}: VirtualMeasurementScroll): number | null {
  if (followingTail) return Math.max(0, scrollHeight);
  if (anchorBeforeTop === undefined || anchorAfterTop === undefined) return null;
  return anchoredScrollTop(scrollTop, anchorBeforeTop, anchorAfterTop);
}
