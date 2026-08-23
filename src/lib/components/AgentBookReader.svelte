<script lang="ts">
  import { Dialog } from "bits-ui";
  import { tick } from "svelte";
  import { t } from "$lib/i18n";
  import {
    groupStreamItems,
    partitionAssistantSegments,
    type StreamItemSegment,
  } from "$lib/toolCallGroups";
  import type { CheckpointTurnStatus, HtmlPreviewConfig, StreamItem } from "$lib/types";
  import type { MermaidConfig } from "$lib/mermaidTheme";
  import ProcessRecordGroup from "./ProcessRecordGroup.svelte";
  import StreamItemRenderer from "./StreamItemRenderer.svelte";
  import ToolCallGroup from "./ToolCallGroup.svelte";
  import Tooltip from "./Tooltip.svelte";

  export interface AgentBookTurn {
    key: string;
    items: StreamItem[];
    status: CheckpointTurnStatus;
  }

  interface Props {
    turns: AgentBookTurn[];
    activeKey: string;
    shikiTheme: string;
    mermaidConfig: MermaidConfig;
    htmlPreviewConfig?: HtmlPreviewConfig;
    fontSize?: number;
    onClose: () => void;
    onSubmitUserInput: (requestId: string, values: Record<string, unknown>) => void;
    onCancelUserInput: (requestId: string) => void;
  }

  let {
    turns,
    activeKey,
    shikiTheme,
    mermaidConfig,
    htmlPreviewConfig,
    fontSize = 17,
    onClose,
    onSubmitUserInput,
    onCancelUserInput,
  }: Props = $props();

  let dialogOpen = $state(true);
  let pageElement = $state<HTMLElement | null>(null);
  let pageIndex = $state(0);
  let pageCount = $state(1);
  let pageStride = 0;
  let paginationFrame: number | null = null;
  let selectedIndex = $derived(
    Math.max(
      0,
      turns.findIndex((turn) => turn.key === activeKey),
    ),
  );
  let selectedTurn = $derived(turns[selectedIndex] ?? null);
  let selectedSegments = $derived(selectedTurn ? groupStreamItems(selectedTurn.items) : []);
  let partitionedSegments = $derived(
    partitionAssistantSegments(selectedSegments, selectedTurn?.status ?? "completed"),
  );
  let processSegments = $derived(partitionedSegments.processSegments);
  let finalSegments = $derived(partitionedSegments.finalSegments);

  $effect(() => {
    if (!dialogOpen) onClose();
  });

  $effect(() => {
    activeKey;
    pageIndex = 0;
    void tick().then(schedulePagination);
  });

  $effect(() => {
    fontSize;
    void tick().then(schedulePagination);
  });

  $effect(() => {
    const element = pageElement;
    if (!element) return;
    const handleEmbeddedLoad = () => schedulePagination();
    const resizeObserver = new ResizeObserver(schedulePagination);
    const mutationObserver = new MutationObserver(() => {
      void tick().then(schedulePagination);
    });
    resizeObserver.observe(element);
    mutationObserver.observe(element, {
      attributes: true,
      attributeFilter: ["open", "hidden"],
      childList: true,
      subtree: true,
    });
    element.addEventListener("load", handleEmbeddedLoad, true);
    element.addEventListener("loadedmetadata", handleEmbeddedLoad, true);
    schedulePagination();
    return () => {
      cancelScheduledPagination();
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      element.removeEventListener("load", handleEmbeddedLoad, true);
      element.removeEventListener("loadedmetadata", handleEmbeddedLoad, true);
    };
  });

  function cancelScheduledPagination() {
    if (paginationFrame === null) return;
    cancelAnimationFrame(paginationFrame);
    paginationFrame = null;
  }

  function schedulePagination() {
    if (typeof requestAnimationFrame === "undefined") return;
    cancelScheduledPagination();
    paginationFrame = requestAnimationFrame(() => {
      paginationFrame = null;
      recalculatePagination();
    });
  }

  function setPageProperty(element: HTMLElement, property: string, value: number) {
    const nextValue = `${value}px`;
    if (element.style.getPropertyValue(property) !== nextValue) {
      element.style.setProperty(property, nextValue);
    }
  }

  function recalculatePagination() {
    const element = pageElement;
    if (!element?.isConnected || element.clientWidth === 0) return;
    const styles = getComputedStyle(element);
    const paddingInline = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const paddingBlock = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const columnGap = parseFloat(styles.columnGap) || 0;
    const columnsPerPage = element.clientWidth <= 640 ? 1 : 2;
    const contentWidth = Math.max(1, element.clientWidth - paddingInline);
    const columnWidth = Math.max(
      1,
      (contentWidth - columnGap * (columnsPerPage - 1)) / columnsPerPage,
    );
    setPageProperty(element, "--book-column-width", columnWidth);
    const pageContentHeight = Math.max(160, element.clientHeight - paddingBlock);
    setPageProperty(element, "--book-page-content-height", pageContentHeight);
    setPageProperty(element, "--book-embed-max-height", Math.max(160, pageContentHeight - 64));

    const overflowContentWidth = Math.max(1, element.scrollWidth - paddingInline);
    const columnCount = Math.max(
      1,
      Math.round((overflowContentWidth + columnGap) / (columnWidth + columnGap)),
    );
    pageCount = Math.max(1, Math.ceil(columnCount / columnsPerPage));
    pageStride = columnsPerPage * (columnWidth + columnGap);
    pageIndex = Math.min(pageIndex, pageCount - 1);
    const pageOffset = pageIndex * pageStride;
    if (Math.abs(element.scrollLeft - pageOffset) > 0.5) {
      element.scrollTo({ left: pageOffset, behavior: "auto" });
    }
  }

  function movePage(offset: number) {
    if (!pageElement) return;
    const nextIndex = Math.max(0, Math.min(pageCount - 1, pageIndex + offset));
    if (nextIndex === pageIndex) return;
    pageIndex = nextIndex;
    pageElement.scrollTo({
      left: pageIndex * pageStride,
      behavior: "smooth",
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowLeft" && pageIndex > 0) {
      event.preventDefault();
      movePage(-1);
    } else if (event.key === "ArrowRight" && pageIndex < pageCount - 1) {
      event.preventDefault();
      movePage(1);
    }
  }
</script>

{#snippet renderSegments(segments: StreamItemSegment[])}
  {#each segments as segment (`book-${selectedTurn?.key}-${segment.startIndex}`)}
    {#if segment.kind === "tool_group"}
      <div class="book-record">
        <ToolCallGroup
          items={segment.items}
          {htmlPreviewConfig}
          {onSubmitUserInput}
          {onCancelUserInput}
        />
      </div>
    {:else}
      <StreamItemRenderer
        item={segment.item}
        itemKey={`book-${selectedTurn?.key}-${segment.startIndex}`}
        isLastText={segment.item.type === "text" &&
          !selectedTurn?.items.slice(segment.startIndex + 1).some((next) => next.type === "text")}
        {shikiTheme}
        {mermaidConfig}
        {htmlPreviewConfig}
        {onSubmitUserInput}
        {onCancelUserInput}
      />
    {/if}
  {/each}
{/snippet}

<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="agent-book-overlay" />
    <Dialog.Content class="agent-book-dialog" onkeydown={handleKeydown}>
      <div
        class="agent-book-window-edge-drag-region"
        data-tauri-drag-region
        aria-hidden="true"
      ></div>
      <header class="agent-book-toolbar" data-tauri-drag-region>
        <div class="agent-book-drag-region" data-tauri-drag-region aria-hidden="true"></div>
        <div class="agent-book-heading">
          <Dialog.Title>{$t("bookMode")}</Dialog.Title>
          <Dialog.Description>
            {$t("agentMessage")}
            {selectedIndex + 1} / {turns.length}
          </Dialog.Description>
        </div>
        <div class="agent-book-controls">
          <Tooltip text={$t("closeBookMode")}>
            {#snippet trigger(props)}
              <Dialog.Close {...props} class="book-close" aria-label={$t("closeBookMode")}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M6 3H3v3M10 13h3v-3M3 6l4-4M13 10l-4 4" />
                </svg>
              </Dialog.Close>
            {/snippet}
          </Tooltip>
        </div>
      </header>

      <div class="agent-book-spread">
        <button
          class="page-turn page-turn-previous"
          type="button"
          disabled={pageIndex === 0}
          aria-label={$t("previousPage")}
          onclick={() => movePage(-1)}
        >
          <svg viewBox="0 0 18 18" aria-hidden="true"><path d="m11.5 3.5-5.5 5.5 5.5 5.5" /></svg>
        </button>
        <article
          bind:this={pageElement}
          class="agent-book-page"
          aria-label={$t("agentMessage")}
          style="--book-font-size: {fontSize}px"
        >
          {#if selectedTurn}
            {#if selectedTurn.status === "completed" && processSegments.length > 0}
              <ProcessRecordGroup>
                {@render renderSegments(processSegments)}
              </ProcessRecordGroup>
              {@render renderSegments(finalSegments)}
            {:else}
              {@render renderSegments(selectedSegments)}
            {/if}
          {/if}
        </article>
        <button
          class="page-turn page-turn-next"
          type="button"
          disabled={pageIndex === pageCount - 1}
          aria-label={$t("nextPage")}
          onclick={() => movePage(1)}
        >
          <svg viewBox="0 0 18 18" aria-hidden="true"><path d="m6.5 3.5 5.5 5.5-5.5 5.5" /></svg>
        </button>
        <span class="page-indicator">{pageIndex + 1} / {pageCount}</span>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.agent-book-overlay) {
    position: fixed;
    z-index: 2147483646;
    inset: 0;
    background: var(--surface);
  }

  :global(.agent-book-dialog) {
    position: fixed;
    z-index: 2147483647;
    inset: 0;
    width: 100vw;
    height: 100vh;
    padding: 16px;
    box-sizing: border-box;
    border: 0;
    outline: none;
    background: var(--surface);
    color: var(--text);
  }

  .agent-book-toolbar {
    position: absolute;
    z-index: 3;
    top: 24px;
    right: 24px;
    left: 24px;
    display: flex;
    min-width: 0;
    height: 32px;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding-left: 8px;
    background: transparent;
  }

  .agent-book-window-edge-drag-region {
    position: absolute;
    z-index: 4;
    top: 0;
    right: 0;
    left: 0;
    height: 24px;
  }

  .agent-book-heading {
    display: flex;
    min-width: 0;
    align-items: baseline;
    gap: 10px;
  }

  .agent-book-drag-region {
    position: absolute;
    z-index: 1;
    inset: 0 42px 0 0;
  }

  .agent-book-heading :global([data-dialog-title]) {
    font-size: 14px;
    font-weight: 600;
  }

  .agent-book-heading :global([data-dialog-description]) {
    color: var(--text-muted);
    font-size: 12px;
  }

  .agent-book-controls {
    position: relative;
    z-index: 2;
    display: flex;
    flex: none;
    align-items: center;
    gap: 5px;
  }

  :global(.book-close) {
    display: inline-flex;
    width: 30px;
    height: 30px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  :global(.book-close:hover),
  :global(.book-close:focus-visible) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  :global(.book-close:focus-visible) {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  :global(.book-close svg) {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .agent-book-spread {
    position: relative;
    display: flex;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 10px;
    overscroll-behavior: contain;
  }

  .agent-book-page {
    width: 100%;
    height: 100%;
    margin: 0 auto;
    padding: clamp(56px, 5vw, 76px) clamp(48px, 6vw, 104px) 58px;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    column-width: var(--book-column-width, 480px);
    column-count: auto;
    column-fill: auto;
    column-gap: clamp(56px, 7vw, 108px);
    scroll-behavior: auto;
  }

  :global(.agent-book-page .assistant-msg) {
    font-size: var(--book-font-size);
    line-height: 1.7;
    letter-spacing: -0.22px;
  }

  :global(.agent-book-page .message-record) {
    content-visibility: visible;
    contain-intrinsic-size: none;
  }

  :global(.agent-book-page .message-record:not(.assistant-msg):not(.thinking-block)),
  .book-record {
    break-inside: avoid-column;
  }

  :global(.agent-book-page .thinking-block),
  :global(.agent-book-page .thinking-block pre),
  :global(.agent-book-page .process-records) {
    break-inside: auto;
  }

  :global(.agent-book-page .process-record-summary) {
    break-inside: avoid-column;
    break-after: avoid-column;
  }

  :global(.agent-book-page .process-record-content) {
    display: block;
  }

  :global(
    .agent-book-page
      .process-record-content
      > .message-record:not(.assistant-msg):not(.thinking-block)
  ) {
    margin-bottom: 4px;
  }

  :global(.agent-book-page [data-streamdown-table]) {
    max-width: 100%;
    overflow: visible;
    break-inside: auto;
  }

  :global(.agent-book-page [data-streamdown-table] table),
  :global(.agent-book-page [data-streamdown-table] tbody) {
    width: 100%;
    table-layout: fixed;
    break-inside: auto;
  }

  :global(.agent-book-page [data-streamdown-table] thead) {
    break-inside: avoid;
    break-after: avoid;
  }

  :global(.agent-book-page [data-streamdown-table] tr) {
    break-inside: avoid;
  }

  :global(.agent-book-page [data-streamdown-table] th),
  :global(.agent-book-page [data-streamdown-table] td) {
    min-width: 0;
    max-width: none;
    padding: 8px 10px;
  }

  :global(.agent-book-page .html-card),
  :global(.agent-book-page .agui-media),
  :global(.agent-book-page [data-streamdown-image]),
  :global(.agent-book-page .chart-card),
  :global(.agent-book-page [data-streamdown-mermaid]) {
    max-width: 100%;
    break-inside: avoid;
  }

  :global(.agent-book-page .preview-scroll-area) {
    max-height: var(--book-embed-max-height) !important;
  }

  :global(.agent-book-page [data-streamdown-image] img),
  :global(.agent-book-page .agui-media img),
  :global(.agent-book-page .agui-media video),
  :global(.agent-book-page .chart-canvas),
  :global(.agent-book-page [data-streamdown-mermaid]) {
    max-height: var(--book-embed-max-height) !important;
    object-fit: contain;
  }

  :global(.agent-book-page .agui-media video) {
    min-height: 0;
  }

  :global(.agent-book-page pre) {
    max-height: var(--book-embed-max-height);
    overflow: auto;
    break-inside: avoid;
  }

  .book-record {
    width: 100%;
  }

  .page-turn {
    position: absolute;
    z-index: 2;
    top: 50%;
    display: inline-flex;
    width: 38px;
    height: 28px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface2) 72%, transparent);
    color: var(--text-muted);
    cursor: pointer;
    transform: translateY(-50%);
  }

  .page-turn-previous {
    left: 14px;
  }

  .page-turn-next {
    right: 14px;
  }

  .page-turn:hover:not(:disabled),
  .page-turn:focus-visible {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  .page-turn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .page-turn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .page-turn svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .page-indicator {
    position: absolute;
    z-index: 2;
    bottom: 18px;
    left: 50%;
    color: var(--text-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    transform: translateX(-50%);
  }

  @media (max-width: 640px) {
    :global(.agent-book-dialog) {
      padding: 8px;
    }

    .agent-book-toolbar {
      top: 12px;
      right: 12px;
      left: 12px;
      padding-left: 6px;
    }

    .agent-book-spread {
      padding: 0;
    }

    .agent-book-page {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 54px 22px 56px;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      column-width: var(--book-column-width, 100%);
      column-count: auto;
      column-gap: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.agent-book-dialog),
    :global(.agent-book-overlay) {
      animation: none;
    }
  }
</style>
