<script lang="ts">
  import { Command } from "bits-ui";
  import { tick } from "svelte";

  export interface PaletteItem {
    id: string;
    /** Text inserted into the composer; defaults to id. */
    insertText?: string;
    label: string;
    /** Short hint text shown to the right of the label. */
    hint?: string;
    /** Optional non-text visual mark shown at the end of the row. */
    mark?: "goal" | "graph";
    /** Optional path/description shown on a second line. */
    detail?: string;
  }

  interface Props {
    items: PaletteItem[];
    activeIdx: number;
    loading?: boolean;
    emptyText: string;
    onSelect: (item: PaletteItem) => void;
    onHover: (idx: number) => void;
  }

  let { items, activeIdx, loading = false, emptyText, onSelect, onHover }: Props = $props();
  let listEl = $state<HTMLElement | null>(null);

  // Translate parent's index-based active selection into Command's value-based one.
  let activeValue = $derived(items[activeIdx]?.id ?? "");

  $effect(() => {
    const focusedIdx = activeIdx;
    const itemCount = items.length;
    if (!listEl || itemCount === 0 || focusedIdx < 0) return;

    tick().then(() => {
      if (!listEl || focusedIdx !== activeIdx) return;
      const focusedItem = listEl.querySelectorAll<HTMLElement>(".palette-row")[focusedIdx];
      if (!focusedItem) return;

      const listRect = listEl.getBoundingClientRect();
      const itemRect = focusedItem.getBoundingClientRect();
      if (itemRect.top < listRect.top) {
        listEl.scrollTop -= listRect.top - itemRect.top;
      } else if (itemRect.bottom > listRect.bottom) {
        listEl.scrollTop += itemRect.bottom - listRect.bottom;
      }
    });
  });

  function handleValueChange(next: string) {
    if (!next) return;
    const idx = items.findIndex((it) => it.id === next);
    if (idx >= 0 && idx !== activeIdx) onHover(idx);
  }
</script>

<Command.Root
  shouldFilter={false}
  value={activeValue}
  onValueChange={handleValueChange}
  loop
  disableInitialScroll
  class="palette"
  label="Suggestions"
>
  <Command.List bind:ref={listEl} class="palette-list">
    {#if loading && items.length === 0}
      <div class="palette-loading" role="status">
        <span class="palette-spinner" aria-hidden="true"></span>
        <span>{emptyText}</span>
      </div>
    {:else if items.length === 0}
      <Command.Empty class="palette-empty">{emptyText}</Command.Empty>
    {:else}
      {#each items as item (item.id)}
        <Command.Item
          value={item.id}
          onSelect={() => onSelect(item)}
          class="palette-row"
        >
          <span class="palette-label">{item.label}</span>
          {#if item.detail}
            <span class="palette-detail">{item.detail}</span>
          {/if}
          {#if item.hint}
            <span class="palette-hint">{item.hint}</span>
          {/if}
          {#if item.mark}
            <span class="palette-mark palette-mark-{item.mark}" aria-hidden="true">
              {#if item.mark === "goal"}
                <svg class="palette-mark-icon" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="5.5" />
                  <circle cx="8" cy="8" r="2" />
                </svg>
              {:else}
                <svg class="palette-mark-icon" viewBox="0 0 16 16" fill="none">
                  <circle cx="4" cy="5" r="1.7" />
                  <circle cx="11.5" cy="4" r="1.7" />
                  <circle cx="8.5" cy="11.5" r="1.7" />
                  <path d="M5.6 4.8 9.8 4.2M5 6.2l2.6 4M10.4 5.5 9 9.9" />
                </svg>
              {/if}
            </span>
          {/if}
        </Command.Item>
      {/each}
    {/if}
  </Command.List>
</Command.Root>

<style>
  :global(.palette) {
    background: var(--control-surface);
    border: 0;
    border-radius: 18px;
    padding: 6px;
    max-height: 240px;
    overflow: hidden;
    outline: none;
    -webkit-backdrop-filter: blur(12px) saturate(1.08);
    backdrop-filter: blur(12px) saturate(1.08);
    box-shadow: var(--raised-shadow);
  }

  :global(.palette-list) {
    max-height: 228px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  :global(.palette-empty) {
    padding: 12px 10px;
    font-size: 14px;
    line-height: 1.43;
    color: var(--text-muted);
    text-align: center;
  }

  .palette-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 10px;
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1.43;
  }

  .palette-spinner {
    width: 12px;
    height: 12px;
    border: 1.5px solid color-mix(in srgb, currentColor 28%, transparent);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: palette-spin 0.75s linear infinite;
  }

  @keyframes palette-spin {
    to { transform: rotate(360deg); }
  }

  :global(.palette-row) {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    background: transparent;
    border: none;
    border-radius: 8px;
    min-height: 34px;
    padding: 5px 10px;
    cursor: pointer;
    text-align: left;
    outline: none;
    user-select: none;
  }

  :global(.palette-row:hover:not([data-selected])) {
    background: var(--bg);
  }

  :global(.palette-row[data-selected]) {
    background: var(--item-selected-bg);
  }

  :global(.palette-row[data-selected]:hover) {
    background: var(--item-selected-hover-bg);
  }

  :global(.palette-label) {
    font-size: 14px;
    font-weight: 400;
    line-height: 1.43;
    letter-spacing: -0.224px;
    color: var(--text);
    white-space: nowrap;
    flex-shrink: 0;
  }

  :global(.palette-detail) {
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-grow: 1;
  }

  :global(.palette-hint) {
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
    margin-left: auto;
  }

  :global(.palette-mark) {
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-left: auto;
    border: 1px solid rgba(0, 102, 204, 0.22);
    border-radius: 9999px;
    background: rgba(0, 102, 204, 0.08);
    color: var(--primary);
  }

  :global(.palette-mark-icon) {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  :global(.palette-mark-icon circle) {
    stroke: currentColor;
  }

  :global(.palette-mark-graph) {
    background: transparent;
  }
</style>
