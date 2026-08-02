<script lang="ts">
  import type { ChatAttachment } from "$lib/types";
  import { t } from "$lib/i18n";
  import Tooltip from "./Tooltip.svelte";

  interface QueueItem {
    text: string;
    attachments: ChatAttachment[];
  }

  interface Props {
    items: QueueItem[];
    onRemove: (index: number) => void;
    onClear: () => void;
  }

  let { items, onRemove, onClear }: Props = $props();

  function itemSummary(item: QueueItem): string {
    const text = item.text.trim();
    if (text) return text;
    return item.attachments.map((attachment) => attachment.name).join(", ");
  }
</script>

{#if items.length > 0}
  <section class="chat-queue" aria-label={$t("messageQueue")}>
    <div class="queue-header">
      <span class="queue-title"
        >{$t("messageQueue")} <span class="queue-count">{items.length}</span></span
      >
      <button class="clear-btn" type="button" onclick={onClear}>{$t("clearQueue")}</button>
    </div>
    <ol class="queue-items">
      {#each items as item, index (index)}
        <li class="queue-item">
          <span class="queue-index">{index + 1}</span>
          <Tooltip text={itemSummary(item)}>
            {#snippet trigger(props)}
              <span {...props} class="queue-summary">{itemSummary(item)}</span>
            {/snippet}
          </Tooltip>
          {#if item.attachments.length > 0}
            <Tooltip text={item.attachments.map((attachment) => attachment.name).join(", ")}>
              {#snippet trigger(props)}
                <span {...props} class="attachment-count">📎 {item.attachments.length}</span>
              {/snippet}
            </Tooltip>
          {/if}
          <Tooltip text={$t("removeQueuedMessage")}>
            {#snippet trigger(props)}
              <button
                {...props}
                class="remove-btn"
                type="button"
                aria-label={$t("removeQueuedMessage")}
                onclick={() => onRemove(index)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
              </button>
            {/snippet}
          </Tooltip>
        </li>
      {/each}
    </ol>
  </section>
{/if}

<style>
  .chat-queue {
    margin: 0 0 8px;
    overflow: hidden;
    border: 0;
    border-radius: 12px;
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    box-shadow: var(--control-shadow);
  }

  .queue-header,
  .queue-item {
    display: flex;
    align-items: center;
  }

  .queue-header {
    justify-content: space-between;
    min-height: 32px;
    padding: 0 10px 0 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    color: var(--text-muted);
    font-size: 11px;
  }

  .queue-title {
    font-weight: 600;
  }
  .queue-count {
    display: inline-flex;
    min-width: 16px;
    justify-content: center;
    margin-left: 4px;
    padding: 1px 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    color: var(--primary);
  }

  .clear-btn,
  .remove-btn {
    border: 0;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .clear-btn {
    padding: 3px 5px;
    font: inherit;
  }
  .clear-btn:hover,
  .clear-btn:focus-visible,
  .remove-btn:hover,
  .remove-btn:focus-visible {
    color: var(--text);
  }
  .clear-btn:focus-visible,
  .remove-btn:focus-visible {
    box-shadow: var(--focus-ring);
    outline: none;
  }

  .queue-items {
    display: flex;
    flex-direction: column;
    gap: var(--list-item-stack-gap);
    margin: 0;
    padding: 4px;
    list-style: none;
  }
  .queue-item {
    min-width: 0;
    gap: 8px;
    padding: 5px 6px;
    border-radius: 8px;
    font-size: 12px;
  }
  .queue-item:hover {
    background: var(--surface2);
  }
  .queue-index {
    width: 15px;
    flex: none;
    color: var(--text-muted);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .queue-summary {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: var(--text);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .attachment-count {
    flex: none;
    color: var(--text-muted);
    font-size: 11px;
    white-space: nowrap;
  }
  .remove-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: 5px;
  }
  .remove-btn:hover,
  .remove-btn:focus-visible {
    background: color-mix(in srgb, var(--border) 72%, transparent);
  }
  .remove-btn svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-width: 1.5;
  }
</style>
