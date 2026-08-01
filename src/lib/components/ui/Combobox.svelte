<script lang="ts">
  import { Combobox } from "bits-ui";

  type Item = { value: string; label: string; disabled?: boolean };

  let {
    value = $bindable<string>(""),
    items,
    placeholder = "",
    disabled = false,
    ariaLabel,
  }: {
    value?: string;
    items: Item[];
    placeholder?: string;
    disabled?: boolean;
    ariaLabel?: string;
  } = $props();

  let inputValue = $state("");

  let filteredItems = $derived.by(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.label.toLowerCase().includes(q));
  });

  function handleOpenChange(open: boolean) {
    if (open) {
      inputValue = "";
    } else {
      const selected = items.find((it) => it.value === value);
      inputValue = selected?.label ?? "";
    }
  }

  $effect(() => {
    const selected = items.find((it) => it.value === value);
    if (selected && inputValue === "") {
      inputValue = selected.label;
    }
  });
</script>

<Combobox.Root
  type="single"
  bind:value
  {inputValue}
  items={filteredItems}
  {disabled}
  onOpenChange={handleOpenChange}
  allowDeselect={false}
>
  <div class="ui-combobox-wrap">
    <Combobox.Input
      class="ui-combobox-input"
      {placeholder}
      aria-label={ariaLabel}
      oninput={(e) => (inputValue = e.currentTarget.value)}
    />
    <Combobox.Trigger class="ui-combobox-trigger" aria-label={ariaLabel}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4 6l4 4 4-4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </Combobox.Trigger>
  </div>
  <Combobox.Portal>
    <Combobox.Content class="ui-combobox-content" sideOffset={6}>
      <Combobox.Viewport class="ui-combobox-viewport">
        {#if filteredItems.length === 0}
          <div class="ui-combobox-empty">无匹配项</div>
        {:else}
          {#each filteredItems as item (item.value)}
            <Combobox.Item
              value={item.value}
              label={item.label}
              disabled={item.disabled}
              class="ui-combobox-item"
            >
              <span class="ui-combobox-item-label">{item.label}</span>
            </Combobox.Item>
          {/each}
        {/if}
      </Combobox.Viewport>
    </Combobox.Content>
  </Combobox.Portal>
</Combobox.Root>

<style>
  .ui-combobox-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  :global(.ui-combobox-input) {
    width: 100%;
    box-sizing: border-box;
    background: var(--control-surface);
    border: 0;
    border-radius: 6px;
    padding: 6px 36px 6px 12px;
    color: var(--text);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    box-shadow: var(--control-shadow);
    transition: box-shadow 0.2s;
  }
  :global(.ui-combobox-input::placeholder) {
    color: var(--text-muted, #888);
  }
  :global(.ui-combobox-input:focus),
  :global(.ui-combobox-input[data-state="open"]) {
    box-shadow: var(--control-shadow), var(--focus-ring);
  }
  :global(.ui-combobox-trigger) {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text-muted, #888);
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }
  :global(.ui-combobox-trigger:hover) {
    background: var(--surface2);
    color: var(--text);
  }
  :global(.ui-combobox-trigger svg) {
    width: 14px;
    height: 14px;
    transition: transform 0.15s;
  }
  :global(.ui-combobox-trigger[data-state="open"] svg) {
    transform: rotate(180deg);
  }
  :global(.ui-combobox-content) {
    z-index: 1000;
    min-width: var(--bits-combobox-anchor-width);
    max-height: var(--bits-combobox-content-available-height, 320px);
    background: var(--control-surface);
    border: 0;
    border-radius: var(--menu-content-radius);
    -webkit-backdrop-filter: blur(12px) saturate(1.08);
    backdrop-filter: blur(12px) saturate(1.08);
    box-shadow: var(--raised-shadow);
    padding: var(--menu-content-padding);
    outline: none;
    overflow: hidden;
  }
  :global(.ui-combobox-viewport) {
    max-height: inherit;
    overflow-y: auto;
  }
  :global(.ui-combobox-empty) {
    min-height: var(--menu-item-min-height);
    padding: var(--menu-item-padding-block) var(--menu-item-padding-inline);
    font-size: var(--menu-item-font-size);
    line-height: var(--menu-item-line-height);
    color: var(--text-muted, #888);
    text-align: center;
  }
  :global(.ui-combobox-item) {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--menu-item-gap);
    min-height: var(--menu-item-min-height);
    padding: var(--menu-item-padding-block) var(--menu-item-padding-inline);
    border-radius: var(--menu-item-radius);
    font-size: var(--menu-item-font-size);
    line-height: var(--menu-item-line-height);
    color: var(--text);
    cursor: pointer;
    outline: none;
    user-select: none;
  }
  :global(.ui-combobox-item + .ui-combobox-item) {
    margin-top: var(--menu-item-stack-gap);
  }
  :global(.ui-combobox-item[data-highlighted]:not([data-selected])),
  :global(.ui-combobox-item:hover:not([data-selected])) {
    background: var(--bg);
  }
  :global(.ui-combobox-item[data-selected]) {
    background: var(--bg);
    color: var(--text);
  }
  :global(.ui-combobox-item[data-selected]::before) {
    content: "";
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 0;
    width: 2px;
    background: var(--primary);
    pointer-events: none;
  }
  :global(.ui-combobox-item[data-disabled]) {
    opacity: 0.4;
    cursor: not-allowed;
  }
  :global(.ui-combobox-item-label) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
