<script lang="ts">
  import { ScrollArea } from "bits-ui";
  import type { Snippet } from "svelte";

  let {
    height,
    scrollHideDelay = 350,
    class: className = "",
    viewport = $bindable(null),
    onscroll,
    onwheel,
    ontouchstart,
    onpointerdown,
    children,
  }: {
    height: string;
    scrollHideDelay?: number;
    class?: string;
    viewport?: HTMLElement | null;
    onscroll?: (event: Event) => void;
    onwheel?: (event: WheelEvent) => void;
    ontouchstart?: (event: TouchEvent) => void;
    onpointerdown?: (event: PointerEvent) => void;
    children?: Snippet;
  } = $props();
</script>

<ScrollArea.Root
  type="hover"
  {scrollHideDelay}
  class={`ui-scroll-area ${className}`}
  style={`height: ${height}`}
>
  <ScrollArea.Viewport
    bind:ref={viewport}
    {onscroll}
    {onwheel}
    {ontouchstart}
    {onpointerdown}
    class="ui-scroll-area-viewport"
  >
    {@render children?.()}
  </ScrollArea.Viewport>
  <ScrollArea.Scrollbar orientation="vertical" class="ui-scroll-area-scrollbar">
    <ScrollArea.Thumb class="ui-scroll-area-thumb" />
  </ScrollArea.Scrollbar>
</ScrollArea.Root>

<style>
  :global(.ui-scroll-area) {
    position: relative;
    min-height: 0;
    overflow: hidden;
  }

  :global(.ui-scroll-area-viewport) {
    width: 100%;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    padding-right: 8px;
  }

  :global(.ui-scroll-area-scrollbar) {
    display: flex;
    width: 8px;
    margin: 0;
    padding: 2px 1px;
    border-radius: 999px;
    background: transparent;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease;
    touch-action: none;
    user-select: none;
  }

  :global(.ui-scroll-area-scrollbar[data-state="visible"]) {
    opacity: 1;
    pointer-events: auto;
  }

  :global(.ui-scroll-area-thumb) {
    position: relative;
    flex: 1;
    min-height: 24px;
    border-radius: inherit;
    background: var(--text-muted);
    opacity: 0.6;
  }

  :global(.ui-scroll-area-thumb:hover) {
    opacity: 0.9;
  }
</style>
