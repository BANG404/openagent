<script lang="ts">
  import { onMount, tick, type Snippet } from "svelte";
  import { isAssistantTurnEntry, type MessageRenderEntry } from "$lib/toolCallGroups";

  interface Props {
    items: MessageRenderEntry[];
    scrollElement: HTMLElement | null;
    estimateSize: (item: MessageRenderEntry) => number;
    children: Snippet<[MessageRenderEntry]>;
    overscan?: number;
    responsiveColumns?: boolean;
    doubleColumnMinWidth?: number;
    tailAnchorToken?: number | null;
    onTailAnchorSettled?: (token: number) => void;
  }

  let {
    items,
    scrollElement,
    estimateSize,
    children,
    overscan = 800,
    responsiveColumns = false,
    doubleColumnMinWidth = 1200,
    tailAnchorToken = null,
    onTailAnchorSettled,
  }: Props = $props();

  const ITEM_GAP = 2;
  let root = $state<HTMLElement | null>(null);
  let rootWidth = $state(0);
  let scrollTop = $state(0);
  let viewportHeight = $state(0);
  let measurementRevision = $state(0);
  let pinnedIndex = $state<number | null>(null);
  let navigationRunId = 0;
  let tailAnchorRunId = 0;
  let suppressScrollAnchoring = false;
  const measuredSizes = new Map<string, number>();
  const observers = new Map<string, ResizeObserver>();
  const renderedNodes = new Map<string, HTMLElement>();
  let columnCount = $derived(responsiveColumns && rootWidth >= doubleColumnMinWidth ? 2 : 1);

  let layout = $derived.by(() => {
    measurementRevision;
    const starts: number[] = new Array(items.length);
    const sizes: number[] = new Array(items.length);
    let totalSize = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      starts[index] = totalSize;
      sizes[index] = measuredSizes.get(item.key) ?? estimateSize(item);
      totalSize += sizes[index];
    }
    return { starts, sizes, totalSize };
  });

  function lowerBound(target: number) {
    let low = 0;
    let high = items.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const end = layout.starts[middle] + layout.sizes[middle];
      if (end < target) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  let visibleRange = $derived.by(() => {
    if (items.length === 0) return { start: 0, end: 0 };
    const rootTop = root?.offsetTop ?? 0;
    const localTop = Math.max(0, scrollTop - rootTop);
    const localBottom = Math.max(localTop, scrollTop + viewportHeight - rootTop);
    const start = Math.max(0, lowerBound(Math.max(0, localTop - overscan)));
    const end = Math.min(items.length, lowerBound(localBottom + overscan) + 1);
    return { start, end };
  });

  let visibleItems = $derived.by(() => {
    const visible = items.slice(visibleRange.start, visibleRange.end).map((item, offset) => ({
      item,
      index: visibleRange.start + offset,
    }));
    if (
      pinnedIndex !== null &&
      pinnedIndex >= 0 &&
      pinnedIndex < items.length &&
      (pinnedIndex < visibleRange.start || pinnedIndex >= visibleRange.end)
    ) {
      visible.push({ item: items[pinnedIndex], index: pinnedIndex });
      visible.sort((left, right) => left.index - right.index);
    }
    return visible;
  });

  function syncViewport() {
    if (!scrollElement) return;
    scrollTop = scrollElement.scrollTop;
    viewportHeight = scrollElement.clientHeight;
  }

  $effect(() => {
    const scroller = scrollElement;
    if (!scroller) return;
    syncViewport();
    scroller.addEventListener("scroll", syncViewport, { passive: true });
    const resizeObserver = new ResizeObserver(syncViewport);
    resizeObserver.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", syncViewport);
      resizeObserver.disconnect();
    };
  });

  $effect(() => {
    const container = root;
    if (!container) return;
    const syncWidth = () => {
      rootWidth = container.clientWidth;
    };
    syncWidth();
    const resizeObserver = new ResizeObserver(syncWidth);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  });

  let measuredColumnCount = 1;
  $effect(() => {
    const nextColumnCount = columnCount;
    if (nextColumnCount === measuredColumnCount) return;
    measuredColumnCount = nextColumnCount;
    measuredSizes.clear();
    measurementRevision += 1;
  });

  $effect(() => {
    const keys = new Set(items.map((item) => item.key));
    for (const key of measuredSizes.keys()) {
      if (!keys.has(key)) measuredSizes.delete(key);
    }
  });

  function measure(node: HTMLElement, item: MessageRenderEntry) {
    const update = () => {
      const nextSize = Math.ceil(node.getBoundingClientRect().height) + ITEM_GAP;
      const previousSize = measuredSizes.get(item.key) ?? estimateSize(item);
      if (nextSize === measuredSizes.get(item.key)) return;

      const itemIndex = items.findIndex((candidate) => candidate.key === item.key);
      const rootTop = root?.offsetTop ?? 0;
      const itemTop = itemIndex >= 0 ? layout.starts[itemIndex] : 0;
      const isAboveViewport = itemTop + previousSize + rootTop <= (scrollElement?.scrollTop ?? 0);
      measuredSizes.set(item.key, nextSize);
      measurementRevision += 1;
      if (isAboveViewport && scrollElement && !suppressScrollAnchoring) {
        scrollElement.scrollTop += nextSize - previousSize;
      }
    };

    const observer = new ResizeObserver(update);
    observers.set(item.key, observer);
    renderedNodes.set(item.key, node);
    observer.observe(node);
    update();
    return {
      destroy() {
        observer.disconnect();
        observers.delete(item.key);
        renderedNodes.delete(item.key);
      },
    };
  }

  function nextFrame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function settleTailAnchor(token: number) {
    const runId = ++tailAnchorRunId;
    await tick();
    // The live row can first switch identity and then receive its measured
    // durable height. Keep the tail pinned across both layout frames.
    for (let frame = 0; frame < 2; frame += 1) {
      await nextFrame();
      if (runId !== tailAnchorRunId || tailAnchorToken !== token || !scrollElement) return;
      scrollElement.scrollTop = scrollElement.scrollHeight;
      syncViewport();
    }
    if (runId === tailAnchorRunId && tailAnchorToken === token) {
      onTailAnchorSettled?.(token);
    }
  }

  $effect(() => {
    const token = tailAnchorToken;
    if (token === null) {
      tailAnchorRunId += 1;
      return;
    }
    void settleTailAnchor(token);
  });

  export async function scrollToKey(key: string) {
    const index = items.findIndex((item) =>
      item.kind === "tool_group"
        ? item.messages.some((message) => message.id === key)
        : item.kind === "assistant_turn"
          ? item.messages.some((message) => message.id === key)
          : item.kind === "message"
            ? item.msg.id === key
            : item.key === key,
    );
    if (index < 0 || !scrollElement) return;

    const runId = ++navigationRunId;
    const itemKey = items[index].key;
    pinnedIndex = index;
    suppressScrollAnchoring = true;
    try {
      // Pin the target into the rendered set before changing the viewport.
      // This mounts only the destination row, not every virtual slice between
      // the current position and it.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await tick();
        await nextFrame();
        if (runId !== navigationRunId || !scrollElement) return;

        const targetNode = renderedNodes.get(itemKey);
        if (!targetNode) continue;
        const targetRect = targetNode.getBoundingClientRect();
        const scrollerRect = scrollElement.getBoundingClientRect();
        const correction = targetRect.top - scrollerRect.top - 72;
        if (Math.abs(correction) < 1) break;
        scrollElement.scrollTop = Math.max(0, scrollElement.scrollTop + correction);
        syncViewport();
      }
    } finally {
      if (runId === navigationRunId) {
        pinnedIndex = null;
        suppressScrollAnchoring = false;
      }
    }
  }

  onMount(() => () => {
    navigationRunId += 1;
    tailAnchorRunId += 1;
    for (const observer of observers.values()) observer.disconnect();
    observers.clear();
    renderedNodes.clear();
  });
</script>

<div
  bind:this={root}
  class="virtual-message-list"
  class:double-column={columnCount === 2}
  style:height={`${layout.totalSize}px`}
  role="list"
>
  {#each visibleItems as virtual (virtual.item.key)}
    <div
      class="virtual-message-row"
      class:content-columns={columnCount === 2 && isAssistantTurnEntry(virtual.item)}
      style:transform={`translateY(${layout.starts[virtual.index]}px)`}
      use:measure={virtual.item}
      role="listitem"
      aria-posinset={virtual.index + 1}
      aria-setsize={items.length}
    >
      {@render children(virtual.item)}
    </div>
  {/each}
</div>

<style>
  .virtual-message-list {
    position: relative;
    width: 100%;
    flex: none;
    overflow-anchor: none;
  }

  .virtual-message-list.double-column {
    container-type: inline-size;
  }

  .virtual-message-row {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: 2px;
    will-change: transform;
  }

  .virtual-message-row.content-columns {
    display: block;
    column-count: 2;
    column-gap: 32px;
    column-rule: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  }

  .virtual-message-row.content-columns > :global(.message-record) {
    content-visibility: visible;
    contain-intrinsic-size: none;
  }

  .virtual-message-row.content-columns
    > :global(.message-record:not(.assistant-msg):not(.thinking-block)),
  .virtual-message-row.content-columns :global(.pagination-atom),
  .virtual-message-row.content-columns > :global(.thinking-status) {
    break-inside: avoid-column;
  }

  .virtual-message-row.content-columns :global(.thinking-block),
  .virtual-message-row.content-columns :global(.thinking-block pre) {
    break-inside: auto;
  }

  .virtual-message-row.content-columns :global(.thinking-summary) {
    break-after: avoid-column;
  }

  .virtual-message-row.content-columns :global(details),
  .virtual-message-row.content-columns :global(pre),
  .virtual-message-row.content-columns :global(table),
  .virtual-message-row.content-columns :global(figure),
  .virtual-message-row.content-columns :global(.tool-call-card),
  .virtual-message-row.content-columns :global([data-mermaid-expanded]) {
    break-inside: avoid-column;
  }
</style>
