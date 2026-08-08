<script lang="ts">
  import { onDestroy } from "svelte";

  let {
    width,
    min,
    max,
    ariaLabel,
    onResize,
    onResizeEnd,
  }: {
    width: number;
    min: number;
    max: number;
    ariaLabel: string;
    onResize: (width: number) => void;
    onResizeEnd: (width: number) => void;
  } = $props();

  let activePointerId: number | null = $state(null);
  let startX = 0;
  let startWidth = 0;
  let resizedWidth = 0;
  let previousCursor = "";
  let previousUserSelect = "";

  function clamp(width: number): number {
    return Math.min(max, Math.max(min, Math.round(width)));
  }

  function beginResize(event: PointerEvent): void {
    if (event.button !== 0 || activePointerId !== null) return;
    activePointerId = event.pointerId;
    startX = event.clientX;
    startWidth = width;
    resizedWidth = width;
    previousCursor = document.documentElement.style.cursor;
    previousUserSelect = document.documentElement.style.userSelect;
    document.documentElement.style.cursor = "col-resize";
    document.documentElement.style.userSelect = "none";
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  }

  function resize(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) return;
    resizedWidth = clamp(startWidth + event.clientX - startX);
    onResize(resizedWidth);
  }

  function finishResize(event?: PointerEvent): void {
    if (activePointerId === null || (event && event.pointerId !== activePointerId)) return;
    activePointerId = null;
    document.documentElement.style.cursor = previousCursor;
    document.documentElement.style.userSelect = previousUserSelect;
    onResizeEnd(resizedWidth);
  }

  function handleKeydown(event: KeyboardEvent): void {
    let nextWidth = width;
    if (event.key === "ArrowLeft") nextWidth -= 10;
    else if (event.key === "ArrowRight") nextWidth += 10;
    else if (event.key === "Home") nextWidth = min;
    else if (event.key === "End") nextWidth = max;
    else return;

    event.preventDefault();
    nextWidth = clamp(nextWidth);
    resizedWidth = nextWidth;
    onResize(nextWidth);
    onResizeEnd(nextWidth);
  }

  onDestroy(() => finishResize());
</script>

<span class="pane-resize-shell">
  <input
    class="pane-resize-handle"
    class:dragging={activePointerId !== null}
    type="range"
    aria-label={ariaLabel}
    {min}
    {max}
    value={width}
    onpointerdown={beginResize}
    onpointermove={resize}
    onpointerup={finishResize}
    onpointercancel={finishResize}
    onlostpointercapture={finishResize}
    onkeydown={handleKeydown}
  />
  <span class="pane-resize-line" aria-hidden="true"></span>
</span>

<style>
  .pane-resize-shell {
    position: absolute;
    z-index: 10;
    top: 0;
    right: -4px;
    bottom: 0;
    width: 8px;
  }

  .pane-resize-handle {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    appearance: none;
    background: transparent;
    cursor: col-resize;
    opacity: 0;
    touch-action: none;
    outline: none;
  }

  .pane-resize-line {
    position: absolute;
    top: 10px;
    bottom: 10px;
    left: 3px;
    width: 1px;
    background: color-mix(in srgb, var(--border) 55%, transparent);
    pointer-events: none;
    transition:
      width 120ms ease,
      background 120ms ease;
  }

  .pane-resize-handle:hover + .pane-resize-line,
  .pane-resize-handle:focus-visible + .pane-resize-line,
  .pane-resize-handle.dragging + .pane-resize-line {
    width: 2px;
    background: color-mix(in srgb, var(--primary) 70%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .pane-resize-line {
      transition: none;
    }
  }
</style>
