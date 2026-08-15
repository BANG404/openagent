<script lang="ts">
  import { onMount, tick, type Snippet } from "svelte";
  import { isAssistantTurnEntry, type MessageRenderEntry } from "$lib/toolCallGroups";

  interface Props {
    items: MessageRenderEntry[];
    scrollElement: HTMLElement | null;
    children: Snippet<[MessageRenderEntry]>;
    responsiveColumns?: boolean;
    doubleColumnMinWidth?: number;
    followTail?: boolean;
    tailAnchorToken?: number | null;
    onTailAnchorSettled?: (token: number) => void;
  }

  let {
    items,
    scrollElement,
    children,
    responsiveColumns = false,
    doubleColumnMinWidth = 1200,
    followTail = true,
    tailAnchorToken = null,
    onTailAnchorSettled,
  }: Props = $props();

  let root = $state<HTMLElement | null>(null);
  let rootWidth = $state(0);
  let tailFollowFrame: number | null = null;
  let tailAnchorRunId = 0;
  let useDoubleColumns = $derived(responsiveColumns && rootWidth >= doubleColumnMinWidth);

  function nextFrame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  function pinToTail() {
    if (!scrollElement || !followTail) return;
    if (tailFollowFrame !== null) cancelAnimationFrame(tailFollowFrame);
    tailFollowFrame = requestAnimationFrame(() => {
      tailFollowFrame = null;
      if (scrollElement && followTail) scrollElement.scrollTop = scrollElement.scrollHeight;
    });
  }

  $effect(() => {
    const container = root;
    if (!container) return;
    const syncWidth = () => {
      rootWidth = container.clientWidth;
    };
    syncWidth();
    const observer = new ResizeObserver(syncWidth);
    observer.observe(container);
    return () => observer.disconnect();
  });

  $effect(() => {
    const container = root;
    const shouldFollow = followTail;
    if (!container || !scrollElement || !shouldFollow) return;
    const observer = new ResizeObserver(pinToTail);
    observer.observe(container);
    pinToTail();
    return () => observer.disconnect();
  });

  async function settleTailAnchor(token: number) {
    const runId = ++tailAnchorRunId;
    await tick();
    for (let frame = 0; frame < 2; frame += 1) {
      await nextFrame();
      if (runId !== tailAnchorRunId || tailAnchorToken !== token || !scrollElement) return;
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
    if (runId === tailAnchorRunId && tailAnchorToken === token) onTailAnchorSettled?.(token);
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
    await tick();
    const target = root?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(key)}"]`);
    if (!target || !scrollElement) return;
    const targetTop = target.getBoundingClientRect().top;
    const scrollerTop = scrollElement.getBoundingClientRect().top;
    scrollElement.scrollTop = Math.max(0, scrollElement.scrollTop + targetTop - scrollerTop - 72);
  }

  onMount(() => () => {
    tailAnchorRunId += 1;
    if (tailFollowFrame !== null) cancelAnimationFrame(tailFollowFrame);
  });
</script>

<div bind:this={root} class="transcript-list" class:double-column={useDoubleColumns} role="list">
  {#each items as item, index (item.key)}
    <div
      class="transcript-row"
      class:content-columns={useDoubleColumns && isAssistantTurnEntry(item)}
      role="listitem"
      aria-posinset={index + 1}
      aria-setsize={items.length}
    >
      {@render children(item)}
    </div>
  {/each}
</div>

<style>
  .transcript-list {
    display: flex;
    width: 100%;
    flex: none;
    flex-direction: column;
    gap: 2px;
  }

  .transcript-list.double-column {
    container-type: inline-size;
  }

  .transcript-row {
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: 2px;
  }

  .transcript-row.content-columns {
    display: block;
    column-count: 2;
    column-gap: 32px;
    column-rule: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  }

  .transcript-row :global(.message-record) {
    content-visibility: visible;
    contain-intrinsic-size: none;
  }

  .transcript-row.content-columns
    > :global(.message-record:not(.assistant-msg):not(.thinking-block)),
  .transcript-row.content-columns :global(.pagination-atom),
  .transcript-row.content-columns > :global(.thinking-status) {
    break-inside: avoid-column;
  }

  .transcript-row.content-columns :global(.thinking-block),
  .transcript-row.content-columns :global(.thinking-block pre) {
    break-inside: auto;
  }

  .transcript-row.content-columns :global(.thinking-summary) {
    break-after: avoid-column;
  }

  .transcript-row.content-columns :global(.process-records) {
    break-inside: auto;
  }

  .transcript-row.content-columns :global(.process-record-summary) {
    break-inside: avoid-column;
    break-after: avoid-column;
  }

  .transcript-row.content-columns :global(.process-record-content) {
    display: block;
  }

  .transcript-row.content-columns :global(.pagination-footer) {
    column-span: all;
    break-inside: avoid;
  }

  .transcript-row.content-columns
    :global(.process-record-content > .message-record:not(.assistant-msg):not(.thinking-block)) {
    break-inside: avoid-column;
    margin-bottom: 4px;
  }

  .transcript-row.content-columns :global(details),
  .transcript-row.content-columns :global(pre),
  .transcript-row.content-columns :global(table),
  .transcript-row.content-columns :global(figure),
  .transcript-row.content-columns :global(.tool-call-card),
  .transcript-row.content-columns :global([data-mermaid-expanded]) {
    break-inside: avoid-column;
  }
</style>
