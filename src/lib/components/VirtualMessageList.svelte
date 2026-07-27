<script lang="ts">
  import { onMount, tick, type Snippet } from "svelte";
  import type { MessageRenderEntry } from "$lib/toolCallGroups";

  interface Props {
    items: MessageRenderEntry[];
    scrollElement: HTMLElement | null;
    estimateSize: (item: MessageRenderEntry) => number;
    children: Snippet<[MessageRenderEntry]>;
    overscan?: number;
    responsiveColumns?: boolean;
    doubleColumnMinWidth?: number;
  }

  let {
    items,
    scrollElement,
    estimateSize,
    children,
    overscan = 800,
    responsiveColumns = false,
    doubleColumnMinWidth = 1200,
  }: Props = $props();

  const ITEM_GAP = 2;
  const COLUMN_GAP = 32;
  let root = $state<HTMLElement | null>(null);
  let rootWidth = $state(0);
  let scrollTop = $state(0);
  let viewportHeight = $state(0);
  let measurementRevision = $state(0);
  let pinnedIndex = $state<number | null>(null);
  let navigationRunId = 0;
  let suppressScrollAnchoring = false;
  const measuredSizes = new Map<string, number>();
  const observers = new Map<string, ResizeObserver>();
  const renderedNodes = new Map<string, HTMLElement>();
  let columnCount = $derived(responsiveColumns && rootWidth >= doubleColumnMinWidth ? 2 : 1);

  let layout = $derived.by(() => {
    measurementRevision;
    const starts: number[] = new Array(items.length);
    const sizes: number[] = new Array(items.length);
    const rows: number[] = new Array(items.length);
    const rowStarts: number[] = [];
    const rowSizes: number[] = [];
    let totalSize = 0;
    for (let row = 0; row * columnCount < items.length; row += 1) {
      const rowStartIndex = row * columnCount;
      let rowSize = 0;
      rowStarts[row] = totalSize;
      for (let column = 0; column < columnCount; column += 1) {
        const index = rowStartIndex + column;
        const item = items[index];
        if (!item) break;
        const size = measuredSizes.get(item.key) ?? estimateSize(item);
        starts[index] = totalSize;
        sizes[index] = size;
        rows[index] = row;
        rowSize = Math.max(rowSize, size);
      }
      rowSizes[row] = rowSize;
      totalSize += rowSize;
    }
    return { starts, sizes, rows, rowStarts, rowSizes, totalSize };
  });

  function lowerBoundRow(target: number) {
    let low = 0;
    let high = layout.rowStarts.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const end = layout.rowStarts[middle] + layout.rowSizes[middle];
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
    const startRow = Math.max(0, lowerBoundRow(Math.max(0, localTop - overscan)));
    const endRow = Math.min(layout.rowStarts.length, lowerBoundRow(localBottom + overscan) + 1);
    const start = Math.min(items.length, startRow * columnCount);
    const end = Math.min(items.length, endRow * columnCount);
    return { start, end };
  });

  let visibleItems = $derived.by(() => {
    const visible = items
      .slice(visibleRange.start, visibleRange.end)
      .map((item, offset) => ({
        item,
        index: visibleRange.start + offset,
      }));
    if (
      pinnedIndex !== null
      && pinnedIndex >= 0
      && pinnedIndex < items.length
      && (pinnedIndex < visibleRange.start || pinnedIndex >= visibleRange.end)
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
    const syncWidth = () => { rootWidth = container.clientWidth; };
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
      const row = itemIndex >= 0 ? layout.rows[itemIndex] : -1;
      const previousRowSize = row >= 0 ? layout.rowSizes[row] : previousSize;
      const isAboveViewport = itemTop + previousRowSize + rootTop <= (scrollElement?.scrollTop ?? 0);
      measuredSizes.set(item.key, nextSize);
      const rowStartIndex = row * columnCount;
      let nextRowSize = 0;
      for (let column = 0; row >= 0 && column < columnCount; column += 1) {
        const rowItem = items[rowStartIndex + column];
        if (!rowItem) break;
        nextRowSize = Math.max(nextRowSize, measuredSizes.get(rowItem.key) ?? estimateSize(rowItem));
      }
      measurementRevision += 1;
      if (isAboveViewport && scrollElement && !suppressScrollAnchoring) {
        scrollElement.scrollTop += nextRowSize - previousRowSize;
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

  export async function scrollToKey(key: string) {
    const index = items.findIndex((item) =>
      item.kind === "tool_group"
        ? item.messages.some((message) => message.id === key)
        : item.kind === "message"
          ? item.msg.id === key
          : item.key === key
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
        scrollElement.scrollTop = Math.max(
          0,
          scrollElement.scrollTop + correction,
        );
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
      style:transform={`translateY(${layout.starts[virtual.index]}px)`}
      style:left={columnCount === 2 && virtual.index % 2 === 1 ? `calc(50% + ${COLUMN_GAP / 2}px)` : "0"}
      style:width={columnCount === 2 ? `calc(50% - ${COLUMN_GAP / 2}px)` : "100%"}
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
</style>
