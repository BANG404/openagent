/** Scoped observer seam. Replay targets never import native capture capabilities. */
let observer: ((payload: Record<string, unknown>) => void) | null = null;
let deliveredEventDepth = 0;
export function setFrontendActionObserver(value: typeof observer): void {
  observer = value;
}
export function observeFrontendAction(payload: Record<string, unknown>): void {
  // The event's real handler will perform its own synchronous child actions on replay.
  if (deliveredEventDepth === 0) observer?.(payload);
}
export function duringFrontendEvent<T>(receive: () => T): T {
  deliveredEventDepth += 1;
  try {
    return receive();
  } finally {
    deliveredEventDepth -= 1;
  }
}

/** Host effects outside the target re-enter through their recorded projection action. */
export function duringIndependentFrontendAction<T>(receive: () => T): T {
  const depth = deliveredEventDepth;
  deliveredEventDepth = 0;
  try {
    return receive();
  } finally {
    deliveredEventDepth = depth;
  }
}
