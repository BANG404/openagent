/**
 * Keep JavaScript-driven Svelte transitions aligned with the shared CSS motion
 * contract, including when the user changes the OS preference at runtime.
 */
export function motionDuration(duration: number): number {
  if (typeof window === "undefined") return duration;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : duration;
}
