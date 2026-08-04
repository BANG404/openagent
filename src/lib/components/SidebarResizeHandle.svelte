<script lang="ts">
  import { onDestroy } from "svelte";
  import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, clampSidebarWidth } from "$lib/sidebarSizing";

  let {
    width,
    ariaLabel,
    onResize,
    onResizeStateChange,
    onResizeEnd,
  }: {
    width: number;
    ariaLabel: string;
    onResize: (width: number) => void;
    onResizeStateChange: (resizing: boolean) => void;
    onResizeEnd: (width: number) => void;
  } = $props();

  let activePointerId: number | null = $state(null);
  let startX = 0;
  let startWidth = 0;
  let resizedWidth = 0;
  let previousCursor = "";
  let previousUserSelect = "";

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
    onResizeStateChange(true);
    event.preventDefault();
  }

  function resize(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) return;
    resizedWidth = clampSidebarWidth(startWidth + event.clientX - startX);
    onResize(resizedWidth);
  }

  function finishResize(event?: PointerEvent): void {
    if (activePointerId === null || (event && event.pointerId !== activePointerId)) return;
    activePointerId = null;
    document.documentElement.style.cursor = previousCursor;
    document.documentElement.style.userSelect = previousUserSelect;
    onResizeStateChange(false);
    onResizeEnd(resizedWidth);
  }

  function handleKeydown(event: KeyboardEvent): void {
    let nextWidth = width;
    if (event.key === "ArrowLeft") nextWidth -= 10;
    else if (event.key === "ArrowRight") nextWidth += 10;
    else if (event.key === "Home") nextWidth = SIDEBAR_MIN_WIDTH;
    else if (event.key === "End") nextWidth = SIDEBAR_MAX_WIDTH;
    else return;

    event.preventDefault();
    nextWidth = clampSidebarWidth(nextWidth);
    resizedWidth = nextWidth;
    onResize(nextWidth);
    onResizeEnd(nextWidth);
  }

  onDestroy(() => finishResize());
</script>

<span class="sidebar-resize-shell">
  <input
    class="sidebar-resize-handle"
    class:dragging={activePointerId !== null}
    type="range"
    aria-label={ariaLabel}
    min={SIDEBAR_MIN_WIDTH}
    max={SIDEBAR_MAX_WIDTH}
    value={width}
    onpointerdown={beginResize}
    onpointermove={resize}
    onpointerup={finishResize}
    onpointercancel={finishResize}
    onlostpointercapture={finishResize}
    onkeydown={handleKeydown}
  />
  <span class="sidebar-resize-line" aria-hidden="true"></span>
</span>

<style>
  .sidebar-resize-shell {
    position: absolute;
    z-index: 20;
    top: 0;
    right: -4px;
    bottom: 0;
    width: 8px;
  }

  .sidebar-resize-handle {
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

  .sidebar-resize-line {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 3px;
    width: 2px;
    background: var(--primary);
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease;
  }

  .sidebar-resize-handle:hover + .sidebar-resize-line,
  .sidebar-resize-handle:focus-visible + .sidebar-resize-line,
  .sidebar-resize-handle.dragging + .sidebar-resize-line {
    opacity: 0.7;
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar-resize-line {
      transition: none;
    }
  }
</style>
