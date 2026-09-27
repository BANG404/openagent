<script lang="ts">
  import { tick } from "svelte";
  import { t } from "$lib/i18n";
  import DotIcon from "./ui/DotIcon.svelte";

  interface Props {
    searchOpen?: boolean;
    searchQuery: string;
    onNew: () => void;
    onSearch: (query: string) => void;
  }

  let { searchOpen = $bindable(false), searchQuery, onNew, onSearch }: Props = $props();
  let searchInput: HTMLInputElement | undefined = $state();

  async function openSearch() {
    searchOpen = true;
    await tick();
    searchInput?.focus();
  }

  function handleNew() {
    closeSearch();
    onNew();
  }

  function closeSearch() {
    searchOpen = false;
    onSearch("");
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
    }
  }

  function handleSearchFocusout(event: FocusEvent) {
    const nextTarget = event.relatedTarget;
    if (
      nextTarget instanceof HTMLElement &&
      ((event.currentTarget instanceof HTMLElement && event.currentTarget.contains(nextTarget)) ||
        nextTarget.closest(".workspace-browser"))
    ) {
      return;
    }
    closeSearch();
  }
</script>

<div class="sidebar-primary-actions">
  <button class="sidebar-primary-action" type="button" onclick={handleNew}>
    <DotIcon name="add" size={18} />
    <span>{$t("newChat")}</span>
  </button>

  {#if searchOpen}
    <div class="sidebar-search-row" onfocusout={handleSearchFocusout}>
      <DotIcon name="search" size={18} />
      <input
        bind:this={searchInput}
        value={searchQuery}
        aria-label={$t("searchConversations")}
        placeholder={$t("searchConversations")}
        oninput={(event) => onSearch(event.currentTarget.value)}
        onkeydown={handleSearchKeydown}
      />
      {#if searchQuery}
        <button
          class="clear-search"
          type="button"
          aria-label={$t("clearSearch")}
          onclick={() => onSearch("")}
        >
          <DotIcon name="close" size={13} />
        </button>
      {/if}
    </div>
  {:else}
    <button class="sidebar-primary-action" type="button" onclick={openSearch}>
      <DotIcon name="search" size={18} />
      <span>{$t("search")}</span>
    </button>
  {/if}
</div>

<style>
  .sidebar-primary-actions {
    display: grid;
    gap: var(--list-item-stack-gap);
    padding: 4px 8px 8px;
  }

  .sidebar-primary-action,
  .sidebar-search-row {
    box-sizing: border-box;
    width: 100%;
    height: var(--list-item-compact-height);
    display: flex;
    align-items: center;
    gap: var(--list-item-compact-content-gap);
    border: 0;
    border-radius: var(--list-item-compact-radius);
    padding: 4px var(--list-item-compact-padding-inline);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: var(--list-item-compact-font-size);
    line-height: var(--list-item-compact-line-height);
  }

  .sidebar-primary-action {
    cursor: pointer;
    text-align: left;
    transition: background var(--motion-fast) var(--ease-standard);
  }

  .sidebar-primary-action:hover,
  .sidebar-primary-action:focus-visible,
  .sidebar-search-row:focus-within {
    background: var(--interactive-state-bg);
    outline: none;
  }

  .sidebar-primary-action:focus-visible,
  .sidebar-search-row:focus-within {
    box-shadow: var(--focus-ring);
  }

  .sidebar-primary-action:active {
    background: color-mix(in srgb, var(--surface2) 78%, var(--text) 6%);
  }

  .sidebar-search-row input {
    min-width: 0;
    flex: 1;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: var(--list-item-compact-font-size);
    line-height: var(--list-item-compact-line-height);
  }

  .sidebar-search-row input::placeholder {
    color: var(--text-muted);
  }

  .clear-search {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    flex: 0 0 22px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .clear-search:hover {
    background: var(--interactive-state-bg);
    color: var(--text);
  }
</style>
