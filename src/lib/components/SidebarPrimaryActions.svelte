<script lang="ts">
  import { tick } from "svelte";
  import { t } from "$lib/i18n";

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
</script>

<div class="sidebar-primary-actions">
  <button class="sidebar-primary-action" type="button" onclick={handleNew}>
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path
        d="M11.75 4.25H5.5A1.75 1.75 0 0 0 3.75 6v8.5a1.75 1.75 0 0 0 1.75 1.75H14a1.75 1.75 0 0 0 1.75-1.75V8.25"
      />
      <path d="m9 11 6.35-6.35M12.75 4.25h3v3" />
    </svg>
    <span>{$t("newChat")}</span>
  </button>

  {#if searchOpen}
    <div class="sidebar-search-row">
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="8.75" cy="8.75" r="5.25" />
        <path d="m12.65 12.65 3.85 3.85" />
      </svg>
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
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      {/if}
    </div>
  {:else}
    <button class="sidebar-primary-action" type="button" onclick={openSearch}>
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="8.75" cy="8.75" r="5.25" />
        <path d="m12.65 12.65 3.85 3.85" />
      </svg>
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
    transition: background 120ms ease;
  }

  .sidebar-primary-action:hover,
  .sidebar-primary-action:focus-visible,
  .sidebar-search-row:focus-within {
    background: var(--surface2);
    outline: none;
  }

  .sidebar-primary-action:focus-visible,
  .sidebar-search-row:focus-within {
    box-shadow: var(--focus-ring);
  }

  .sidebar-primary-action:active {
    background: color-mix(in srgb, var(--surface2) 78%, var(--text) 6%);
  }

  .sidebar-primary-action > svg,
  .sidebar-search-row > svg {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
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
    background: var(--border);
    color: var(--text);
  }

  .clear-search svg {
    width: 13px;
    height: 13px;
  }
</style>
