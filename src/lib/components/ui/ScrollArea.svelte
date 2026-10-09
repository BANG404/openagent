<script lang="ts">
  import { ScrollArea } from "bits-ui";
  import type { Snippet } from "svelte";

  let {
    height = "auto",
    maxHeight,
    scrollHideDelay = 350,
    class: className = "",
    viewport = $bindable(null),
    onscroll,
    onwheel,
    ontouchstart,
    onpointerdown,
    children,
  }: {
    height?: string;
    /** Cap an intrinsic-height viewport without reserving empty space. */
    maxHeight?: string;
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
  type="scroll"
  {scrollHideDelay}
  class={`ui-scroll-area ${className}`}
  style={`height: ${height};${maxHeight ? ` max-height: ${maxHeight};` : ""}`}
>
  <ScrollArea.Viewport
    bind:ref={viewport}
    {onscroll}
    {onwheel}
    {ontouchstart}
    {onpointerdown}
    class="ui-scroll-area-viewport"
    style={maxHeight ? `max-height: ${maxHeight};` : undefined}
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
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  :global(.ui-scroll-area-viewport::-webkit-scrollbar) {
    display: none;
    width: 0;
    height: 0;
  }

  :global(.ui-scroll-area-scrollbar) {
    display: flex;
    z-index: 1;
    width: 8px;
    margin: 0;
    padding: 2px 1px;
    border-radius: 999px;
    background: transparent;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--motion-fast) var(--ease-standard);
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
    background: var(--interactive-state-bg);
    opacity: 1;
  }

  :global(.ui-scroll-area-thumb:hover) {
    opacity: 1;
  }
</style>
