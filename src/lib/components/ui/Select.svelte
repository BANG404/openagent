<script lang="ts">
  import { Select } from "bits-ui";

  type Item = {
    value: string;
    label: string;
    description?: string;
    selectedLabel?: string;
    icon?: string;
    iconFallback?: string;
    disabled?: boolean;
  };

  let {
    value = $bindable<string>(""),
    items,
    placeholder = "",
    disabled = false,
    triggerClass = "",
    contentClass = "",
    searchable = false,
    searchPlaceholder = "",
    emptyText = "",
    contentSide = "bottom",
    contentSideOffset = 6,
    contentAlign = "center",
    contentAvoidCollisions = true,
    id,
    name,
    ariaLabel,
    onValueChange,
    onOpenChange,
  }: {
    value?: string;
    items: Item[];
    placeholder?: string;
    disabled?: boolean;
    triggerClass?: string;
    contentClass?: string;
    searchable?: boolean;
    searchPlaceholder?: string;
    emptyText?: string;
    contentSide?: "top" | "right" | "bottom" | "left";
    contentSideOffset?: number;
    contentAlign?: "start" | "center" | "end";
    contentAvoidCollisions?: boolean;
    id?: string;
    name?: string;
    ariaLabel?: string;
    onValueChange?: (value: string) => void;
    onOpenChange?: (open: boolean) => void;
  } = $props();

  let searchQuery = $state("");

  const selectedItem = $derived(items.find((item) => item.value === value));
  const selectedLabel = $derived(selectedItem?.selectedLabel ?? selectedItem?.label ?? "");

  const filteredItems = $derived.by(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!searchable || !query) return items;
    return items.filter((item) => item.label.toLocaleLowerCase().includes(query));
  });

  function handleOpenStateChange(open: boolean) {
    searchQuery = "";
    onOpenChange?.(open);
  }
</script>

<Select.Root
  type="single"
  bind:value
  {items}
  {disabled}
  {name}
  allowDeselect={false}
  onOpenChange={handleOpenStateChange}
  {onValueChange}
>
  <Select.Trigger {id} class="ui-select-trigger {triggerClass}" aria-label={ariaLabel}>
    <span class="ui-select-value" class:placeholder={!selectedLabel}>
      {#if selectedItem?.icon || selectedItem?.iconFallback}
        <span class="ui-select-item-icon" aria-hidden="true">
          {#if selectedItem.icon}
            <img src={selectedItem.icon} alt="" />
          {:else}
            <span>{selectedItem.iconFallback}</span>
          {/if}
        </span>
      {/if}
      <span class="ui-select-value-label">{selectedLabel || placeholder}</span>
    </span>
    <svg class="ui-select-caret" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </Select.Trigger>
  <Select.Portal>
    <Select.Content
      class="desktop-menu-panel ui-select-content {contentClass}"
      side={contentSide}
      sideOffset={contentSideOffset}
      align={contentAlign}
      avoidCollisions={contentAvoidCollisions}
    >
      {#if searchable}
        <div class="ui-select-search-wrap">
          <svg class="ui-select-search-icon" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path
              d="m10.25 10.25 3 3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
          <input
            class="ui-select-search"
            type="search"
            value={searchQuery}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            oninput={(event) => (searchQuery = event.currentTarget.value)}
            onkeydown={(event) => event.stopPropagation()}
          />
        </div>
      {/if}
      <Select.Viewport class="ui-select-viewport">
        {#if filteredItems.length === 0}
          <div class="ui-select-empty">{emptyText}</div>
        {:else}
          {#each filteredItems as item (item.value)}
            <Select.Item
              value={item.value}
              label={item.label}
              disabled={item.disabled}
              class="ui-select-item"
            >
              {#if item.icon || item.iconFallback}
                <span class="ui-select-item-icon" aria-hidden="true">
                  {#if item.icon}
                    <img src={item.icon} alt="" />
                  {:else}
                    <span>{item.iconFallback}</span>
                  {/if}
                </span>
              {/if}
              <span class="ui-select-item-copy">
                <span class="ui-select-item-label">{item.label}</span>
                {#if item.description}
                  <span class="ui-select-item-description">{item.description}</span>
                {/if}
              </span>
            </Select.Item>
          {/each}
        {/if}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>

<style>
  :global(.ui-select-trigger) {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
    background: var(--mica-surface);
    border: 1px solid var(--mica-border);
    border-radius: 6px;
    padding: 6px 12px;
    color: var(--text);
    font-size: 13px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    outline: none;
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
    box-shadow: var(--mica-shadow);
    transition: box-shadow 0.2s;
  }
  :global(.ui-select-trigger:focus-visible),
  :global(.ui-select-trigger[data-state="open"]) {
    box-shadow: var(--mica-shadow), var(--focus-ring);
  }
  :global(.ui-select-trigger.composer-model-trigger),
  :global(.ui-select-trigger.reasoning-effort-trigger),
  :global(.ui-select-trigger.quick-select-trigger) {
    border: 0;
    background: transparent;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    box-shadow: none;
  }
  :global(.ui-select-trigger.composer-model-trigger:hover:not(:disabled)),
  :global(.ui-select-trigger.composer-model-trigger[data-state="open"]),
  :global(.ui-select-trigger.reasoning-effort-trigger:hover:not(:disabled)),
  :global(.ui-select-trigger.reasoning-effort-trigger[data-state="open"]) {
    background: var(--border);
    box-shadow: none;
  }
  :global(.ui-select-trigger.quick-select-trigger:hover:not(:disabled)),
  :global(.ui-select-trigger.quick-select-trigger:focus-visible),
  :global(.ui-select-trigger.quick-select-trigger[data-state="open"]) {
    background: color-mix(in srgb, var(--text) 7%, transparent);
    box-shadow: none;
  }
  :global(.ui-select-trigger.composer-model-trigger:focus-visible),
  :global(.ui-select-trigger.reasoning-effort-trigger:focus-visible) {
    background: transparent;
    box-shadow: var(--focus-ring);
  }
  :global(.ui-select-trigger:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }
  :global(.ui-select-value.placeholder) {
    color: var(--text-muted, #888);
  }
  :global(.ui-select-value) {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 8px;
  }
  :global(.ui-select-value-label) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.ui-select-item-icon) {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    flex: 0 0 22px;
    border-radius: 6px;
    background: #fff;
    color: #475569;
    box-shadow: 0 0 0 1px rgb(15 23 42 / 8%);
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
  }
  :global(.ui-select-item-icon img) {
    display: block;
    width: 16px;
    height: 16px;
    object-fit: contain;
  }
  :global(.ui-select-caret) {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--text-muted, #888);
    transition: transform 0.15s;
  }
  :global(.ui-select-trigger[data-state="open"] .ui-select-caret) {
    transform: rotate(180deg);
  }
  :global(.ui-select-content) {
    z-index: 1000;
    display: flex;
    flex-direction: column;
    width: min(var(--bits-select-anchor-width), calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    box-sizing: border-box;
    max-height: var(--bits-select-content-available-height, 320px);
    overflow: hidden;
  }
  :global(.ui-select-viewport) {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
  }
  .ui-select-search-wrap {
    position: relative;
    padding: 2px 2px 6px;
  }
  .ui-select-search-icon {
    position: absolute;
    left: 12px;
    top: calc(50% - 2px);
    width: 14px;
    height: 14px;
    color: var(--text-muted, #888);
    transform: translateY(-50%);
    pointer-events: none;
  }
  .ui-select-search {
    width: 100%;
    box-sizing: border-box;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: var(--menu-item-font-size);
    line-height: var(--menu-item-line-height);
    outline: none;
    box-shadow: none;
    padding: 7px 10px 7px 30px;
  }
  .ui-select-search:focus-visible {
    box-shadow: var(--focus-ring);
  }
  .ui-select-search::placeholder {
    color: var(--text-muted, #888);
  }
  .ui-select-search::-webkit-search-cancel-button {
    cursor: pointer;
  }
  .ui-select-empty {
    min-height: var(--menu-item-min-height);
    padding: var(--menu-item-padding-block) var(--menu-item-padding-inline);
    color: var(--text-muted, #888);
    font-size: var(--menu-item-font-size);
    line-height: var(--menu-item-line-height);
    text-align: center;
  }
  :global(.ui-select-item) {
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
  :global(.ui-select-item + .ui-select-item) {
    margin-top: var(--menu-item-stack-gap);
  }
  :global(.ui-select-item[data-highlighted]:not([data-selected])),
  :global(.ui-select-item:hover:not([data-selected])) {
    background: var(--bg);
  }
  :global(.ui-select-item[data-selected]) {
    background: var(--bg);
    color: var(--text);
  }
  :global(.ui-select-item[data-selected]::before) {
    content: "";
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 0;
    width: 2px;
    background: var(--primary);
    pointer-events: none;
  }
  :global(.ui-select-item[data-disabled]) {
    opacity: 0.4;
    cursor: not-allowed;
  }
  :global(.ui-select-item-label) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.ui-select-item-copy) {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  :global(.ui-select-item-description) {
    color: var(--text-muted, #888);
    font-size: var(--menu-item-description-size);
    line-height: var(--menu-item-description-line-height);
  }
  :global(.ui-select-item[data-selected] .ui-select-item-description) {
    color: var(--text-muted, #888);
  }
</style>
