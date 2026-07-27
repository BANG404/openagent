<script lang="ts">
  import { ScrollArea } from "bits-ui";
  import type { Snippet } from "svelte";

  let {
    height,
    class: className = "",
    children,
  }: {
    height: string;
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<ScrollArea.Root type="hover" class={`ui-scroll-area ${className}`} style={`height: ${height}`}>
  <ScrollArea.Viewport class="ui-scroll-area-viewport">
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
  }

  :global(.ui-scroll-area-viewport) {
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  :global(.ui-scroll-area-scrollbar) {
    display: flex;
    width: 8px;
    margin: 3px;
    padding: 1px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface2) 72%, transparent);
    touch-action: none;
    user-select: none;
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
