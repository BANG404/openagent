<script lang="ts">
  import { Select } from "bits-ui";
  import { t } from "$lib/i18n";
  import type { AgentRole } from "$lib/types";

  let {
    value,
    roles,
    compact = false,
    header = false,
    onChange,
  }: {
    value: string;
    roles: AgentRole[];
    compact?: boolean;
    header?: boolean;
    onChange: (value: string) => void;
  } = $props();

  const defaultRoleKey = "openagent";
  let query = $state("");
  let items = $derived([
    {
      value: defaultRoleKey,
      label: $t("defaultRoleName"),
      description: $t("defaultRoleDescription"),
    },
    ...roles.map((role) => ({
      value: role.id,
      label: role.name,
      description: role.description,
    })),
  ]);
  let selected = $derived(items.find((item) => item.value === value) ?? items[0]);
  let filteredItems = $derived.by(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      `${item.label} ${item.description}`.toLocaleLowerCase().includes(normalized),
    );
  });
</script>

<Select.Root
  type="single"
  {items}
  value={selected.value}
  allowDeselect={false}
  onValueChange={(next) => next && onChange(next)}
  onOpenChange={() => (query = "")}
>
  <Select.Trigger
    class="role-selector-trigger {compact ? 'compact' : ''} {header ? 'header' : ''}"
    aria-label={$t("selectRole")}
    title={compact ? `${$t("selectRole")}: ${selected.label}` : undefined}
  >
    {#if !header}
      <svg class="role-selector-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="6.25" r="2.75" />
        <path d="M4.75 16c.4-3 2.15-4.7 5.25-4.7s4.85 1.7 5.25 4.7" />
      </svg>
    {/if}
    {#if !compact}
      <span class="role-selector-copy">
        {#if !header}
          <span class="role-selector-label">{$t("roleConversationLabel")}</span>
        {/if}
        <span class="role-selector-name">{selected.label}</span>
      </span>
    {/if}
    <svg class="role-selector-caret" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  </Select.Trigger>
  <Select.Portal>
    <Select.Content
      class="role-selector-content {compact ? 'compact' : ''}"
      side="bottom"
      sideOffset={6}
    >
      <div class="role-selector-search-wrap">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="4.25" />
          <path d="m10.25 10.25 3 3" />
        </svg>
        <input
          type="search"
          value={query}
          placeholder={$t("roleSelectorSearch")}
          aria-label={$t("roleSelectorSearch")}
          oninput={(event) => (query = event.currentTarget.value)}
          onkeydown={(event) => event.stopPropagation()}
        />
      </div>
      <Select.Viewport class="role-selector-viewport">
        {#if filteredItems.length === 0}
          <div class="role-selector-empty">{$t("noMatchingRoles")}</div>
        {:else}
          {#each filteredItems as item (item.value)}
            <Select.Item value={item.value} label={item.label} class="role-selector-item">
              {#snippet children({ selected: itemSelected })}
                <span class="role-selector-item-copy">
                  <span class="role-selector-item-name">{item.label}</span>
                  <span class="role-selector-item-description">{item.description}</span>
                </span>
                {#if itemSelected}
                  <svg class="role-selector-check" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                {/if}
              {/snippet}
            </Select.Item>
          {/each}
        {/if}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>

<style>
  :global(.role-selector-trigger) {
    width: 100%;
    min-height: 34px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-sizing: border-box;
    padding: 6px 8px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--text);
    font: inherit;
    cursor: pointer;
    outline: none;
    text-align: left;
  }
  :global(.role-selector-trigger:hover),
  :global(.role-selector-trigger:focus-visible),
  :global(.role-selector-trigger[data-state="open"]) {
    background: var(--surface2);
  }

  :global(.role-selector-trigger:focus-visible) {
    box-shadow: var(--focus-ring);
  }
  :global(.role-selector-trigger.compact) {
    width: 32px;
    height: 28px;
    min-height: 28px;
    justify-content: center;
    gap: 0;
    padding: 0;
    color: var(--text-muted);
  }
  :global(.role-selector-trigger.compact:hover),
  :global(.role-selector-trigger.compact:focus-visible),
  :global(.role-selector-trigger.compact[data-state="open"]) {
    color: var(--text);
  }
  :global(.role-selector-trigger.header) {
    min-width: 0;
    flex: 1;
    padding-inline: 8px;
    font-size: 14px;
    font-weight: 600;
  }
  :global(.role-selector-trigger.header .role-selector-copy) {
    font-size: 14px;
  }
  :global(.role-selector-trigger.header .role-selector-name) {
    font-size: 14px;
  }
  .role-selector-icon {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }
  .role-selector-copy {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 5px;
    font-size: 13px;
  }
  .role-selector-label {
    flex: none;
    color: var(--text);
  }
  .role-selector-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
  .role-selector-caret {
    width: 13px;
    height: 13px;
    flex: 0 0 13px;
    color: var(--text-muted);
  }
  .role-selector-caret path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  :global(.role-selector-trigger.compact .role-selector-caret) {
    display: none;
  }
  :global(.role-selector-content) {
    z-index: 1000;
    display: flex;
    flex-direction: column;
    width: min(var(--bits-select-anchor-width), calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    box-sizing: border-box;
    max-height: min(420px, var(--bits-select-content-available-height, 420px));
    padding: var(--menu-content-padding);
    border-radius: var(--menu-content-radius);
    background: color-mix(in srgb, var(--surface) 76%, transparent);
    box-shadow: var(--raised-shadow);
    -webkit-backdrop-filter: blur(12px) saturate(1.08);
    backdrop-filter: blur(12px) saturate(1.08);
    outline: none;
    overflow: hidden;
  }
  :global(.role-selector-content.compact) {
    width: min(240px, calc(100vw - 24px));
  }
  .role-selector-search-wrap {
    position: relative;
    padding: 2px 2px 6px;
  }
  .role-selector-search-wrap svg {
    position: absolute;
    width: 14px;
    height: 14px;
    left: 12px;
    top: 12px;
    stroke: var(--text-muted);
    stroke-width: 1.5;
    stroke-linecap: round;
    pointer-events: none;
  }
  .role-selector-search-wrap input {
    width: 100%;
    box-sizing: border-box;
    border: 0;
    border-radius: 6px;
    padding: 7px 10px 7px 30px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: var(--menu-item-font-size);
    line-height: var(--menu-item-line-height);
    outline: none;
    box-shadow: none;
  }
  .role-selector-search-wrap input:focus-visible {
    box-shadow: var(--focus-ring);
  }
  :global(.role-selector-viewport) {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
  }
  :global(.role-selector-item) {
    display: flex;
    align-items: center;
    gap: var(--menu-item-gap);
    min-height: var(--menu-item-min-height);
    padding: var(--menu-item-padding-block) var(--menu-item-padding-inline);
    border-radius: var(--menu-item-radius);
    font-size: var(--menu-item-font-size);
    line-height: var(--menu-item-line-height);
    color: var(--text);
    outline: none;
    cursor: pointer;
  }
  :global(.role-selector-item[data-highlighted]:not([data-selected])) {
    background: color-mix(in srgb, var(--text) 7%, transparent);
  }
  :global(.role-selector-item[data-selected]) {
    background: color-mix(in srgb, var(--text) 12%, transparent);
    color: var(--text);
  }
  :global(.role-selector-item[data-selected][data-highlighted]) {
    background: color-mix(in srgb, var(--text) 16%, transparent);
  }
  .role-selector-empty {
    min-height: var(--menu-item-min-height);
    padding: var(--menu-item-padding-block) var(--menu-item-padding-inline);
    color: var(--text-muted);
    font-size: var(--menu-item-font-size);
    line-height: var(--menu-item-line-height);
    text-align: center;
  }
  .role-selector-item-copy {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 2px;
  }
  .role-selector-item-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--menu-item-font-size);
  }
  .role-selector-item-description {
    display: -webkit-box;
    overflow: hidden;
    color: var(--text-muted);
    font-size: var(--menu-item-description-size);
    line-height: var(--menu-item-description-line-height);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .role-selector-check {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    color: var(--primary);
  }
  .role-selector-check path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
