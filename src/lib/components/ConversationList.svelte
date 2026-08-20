<script lang="ts">
  import { ContextMenu } from "bits-ui";
  import { t } from "$lib/i18n";
  import { projectConversationPageSize } from "$lib/sidebarProjects";
  import type { Conversation } from "$lib/types";
  import SidebarConversationTitle from "./SidebarConversationTitle.svelte";

  interface Props {
    conversations: Conversation[];
    searchQuery?: string;
    activeConvId: string | null;
    streamingConvIds: Record<string, boolean>;
    hasMore: boolean;
    loadingMore: boolean;
    onSelect: (id: string) => void;
    onTogglePin: (id: string) => void;
    onDelete: (id: string, workspace?: string) => void;
    onLoadMore: () => void;
    embedded?: boolean;
    compactProject?: boolean;
  }
  let {
    conversations,
    searchQuery = "",
    activeConvId,
    streamingConvIds,
    hasMore,
    loadingMore,
    onSelect,
    onTogglePin,
    onDelete,
    onLoadMore,
    embedded = false,
    compactProject = false,
  }: Props = $props();

  let listElement = $state<HTMLDivElement>();
  let pageSentinel = $state<HTMLDivElement>();
  let revealedRoots = $state(projectConversationPageSize);

  let normalizedSearchQuery = $derived(searchQuery.trim().toLowerCase());
  let searchResults = $derived(
    normalizedSearchQuery
      ? conversations.filter((conversation) =>
          conversation.title.toLowerCase().includes(normalizedSearchQuery),
        )
      : [],
  );

  // A role-filtered delegated conversation retains its durable parent link,
  // even though that parent belongs to another role and is absent here. Treat
  // such an orphan in this projection as a root without changing its lineage.
  let topLevel = $derived.by(() => {
    const visibleIds = new Set(conversations.map((conversation) => conversation.id));
    return conversations
      .filter(
        (conversation) => !conversation.parentConvId || !visibleIds.has(conversation.parentConvId),
      )
      .sort(
        (a, b) =>
          (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
          b.updatedAt - a.updatedAt ||
          b.id.localeCompare(a.id),
      );
  });
  let visibleTopLevel = $derived(compactProject ? topLevel.slice(0, revealedRoots) : topLevel);
  let hasHiddenRoots = $derived(compactProject && revealedRoots < topLevel.length);

  // Map parent_id → sub-conversations (ordered by creation time desc)
  let childMap = $derived.by(() => {
    const map = new Map<string, Conversation[]>();
    for (const c of conversations) {
      if (c.parentConvId) {
        const arr = map.get(c.parentConvId) ?? [];
        arr.push(c);
        map.set(c.parentConvId, arr);
      }
    }
    // Sort each group newest-first
    for (const [k, arr] of map) {
      map.set(
        k,
        arr.sort((a, b) => b.updatedAt - a.updatedAt),
      );
    }
    return map;
  });

  let visibleSubConvMap = $derived.by(() => {
    const map = new Map<string, Conversation[]>();
    for (const root of topLevel) {
      if (activePathFor(root.id).length > 0 && childMap.has(root.id)) {
        map.set(root.id, childMap.get(root.id)!);
      }
    }
    return map;
  });

  function activePathFor(rootId: string): Conversation[] {
    if (!activeConvId) return [];
    const byId = new Map(conversations.map((item) => [item.id, item]));
    const path: Conversation[] = [];
    const visited = new Set<string>();
    let current = byId.get(activeConvId);
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(current);
      if (current.id === rootId) return path;
      current = current.parentConvId ? byId.get(current.parentConvId) : undefined;
    }
    return [];
  }

  function isActiveBranch(conversationId: string): boolean {
    if (!activeConvId) return false;
    const byId = new Map(conversations.map((item) => [item.id, item]));
    const visited = new Set<string>();
    let current = byId.get(activeConvId);
    while (current && !visited.has(current.id)) {
      if (current.id === conversationId) return true;
      visited.add(current.id);
      current = current.parentConvId ? byId.get(current.parentConvId) : undefined;
    }
    return false;
  }

  $effect(() => {
    if (embedded || !listElement || !pageSentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingMore) onLoadMore();
      },
      { root: listElement, rootMargin: "120px 0px" },
    );
    observer.observe(pageSentinel);
    return () => observer.disconnect();
  });

  function revealMore(): void {
    if (hasHiddenRoots) {
      revealedRoots += projectConversationPageSize;
      return;
    }
    onLoadMore();
    revealedRoots += projectConversationPageSize;
  }
</script>

{#snippet delegatedRoleBadge()}
  <span class="role-badge" aria-label={$t("delegatedRoleConversation")}>
    <svg class="role-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.25" r="2.35" />
      <path d="M3.75 13c.35-2.35 1.85-3.65 4.25-3.65s3.9 1.3 4.25 3.65" />
    </svg>
  </span>
{/snippet}

{#snippet conversationTitle(title: string)}
  <SidebarConversationTitle text={title} />
{/snippet}

{#snippet nestedThreadItems(items: Conversation[], depth: number)}
  {#each items as sub (sub.id)}
    <button
      class="sub-conv-item {sub.id === activeConvId ? 'active' : ''} {streamingConvIds[sub.id]
        ? 'streaming'
        : ''}"
      style:padding-left={`${8 + depth * 12}px`}
      onclick={() => onSelect(sub.id)}
    >
      {#if !sub.flowKind}
        {@render delegatedRoleBadge()}
      {/if}
      {@render conversationTitle(sub.title)}
      {#if streamingConvIds[sub.id]}
        <span class="conv-streaming-dot" aria-label="Streaming"></span>
      {:else}
        <span
          class="conv-delete"
          role="button"
          tabindex="0"
          aria-label="Delete sub-conversation"
          onclick={(e) => {
            e.stopPropagation();
            onDelete(sub.id, sub.workspace);
          }}
          onkeydown={(e) =>
            e.key === "Enter" && (e.stopPropagation(), onDelete(sub.id, sub.workspace))}
          >&times;</span
        >
      {/if}
    </button>
    {#if isActiveBranch(sub.id) && childMap.has(sub.id)}
      {@render nestedThreadItems(childMap.get(sub.id)!, depth + 1)}
    {/if}
  {/each}
{/snippet}

<div class="conv-list-shell" class:embedded>
  <div class="conv-list" class:embedded bind:this={listElement}>
    {#if normalizedSearchQuery}
      {#if searchResults.length === 0}
        <div class="search-empty">
          {#if loadingMore}
            <span class="conversation-page-spinner" aria-hidden="true"></span>
            <span>{$t("loadingContent")}</span>
          {:else}
            {$t("noConversationSearchResults")}
          {/if}
        </div>
      {:else}
        <div class="search-results" aria-label={$t("searchResults")}>
          {#each searchResults as conv (conv.id)}
            <button
              class="conv-item {conv.id === activeConvId ? 'active' : ''} {streamingConvIds[conv.id]
                ? 'streaming'
                : ''}"
              onclick={() => onSelect(conv.id)}
            >
              <svg
                class="search-result-icon"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 4.5h10M3 8h7M3 11.5h5" />
              </svg>
              {@render conversationTitle(conv.title)}
              {#if streamingConvIds[conv.id]}
                <span class="conv-streaming-dot" aria-label="Streaming"></span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    {:else if topLevel.length === 0}
      <div class="empty-conversations">
        <div class="empty-conversations-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path d="M7 18.5 3.5 21l1.2-4.2A8 8 0 1 1 20 12" /><path
              d="M8.5 12h.01M12 12h.01M15.5 12h.01"
            /></svg
          >
        </div>
        <strong>{$t("emptyConversationsTitle")}</strong>
      </div>
    {:else}
      {#each visibleTopLevel as conv, i (conv.id)}
        {#if i > 0 && !conv.pinned && topLevel[i - 1].pinned}
          <div class="conv-list-divider"></div>
        {/if}

        <!-- Top-level conversation -->
        <ContextMenu.Root>
          <ContextMenu.Trigger class="conv-context-trigger">
            <button
              class="conv-item {conv.id === activeConvId ? 'active' : ''} {streamingConvIds[conv.id]
                ? 'streaming'
                : ''}"
              onclick={() => onSelect(conv.id)}
            >
              {#if conv.pinned}
                <svg
                  class="conv-pin-icon"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a6 6 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707s.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a6 6 0 0 1 1.013.16l3.134-3.133a3 3 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146"
                  />
                </svg>
              {/if}
              {@render conversationTitle(conv.title)}
              {#if streamingConvIds[conv.id]}
                <span class="conv-streaming-dot" aria-label="Streaming"></span>
              {:else}
                <span
                  class="conv-delete"
                  role="button"
                  tabindex="0"
                  aria-label="Delete conversation"
                  onclick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id, conv.workspace);
                  }}
                  onkeydown={(e) =>
                    e.key === "Enter" && (e.stopPropagation(), onDelete(conv.id, conv.workspace))}
                  >×</span
                >
              {/if}
            </button>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content class="desktop-menu-panel ctx-menu-content">
              <ContextMenu.Item class="ctx-menu-item" onclick={() => onTogglePin(conv.id)}>
                {conv.pinned ? $t("unpinConv") : $t("pinConv")}
              </ContextMenu.Item>
              <div class="ctx-menu-separator"></div>
              <ContextMenu.Item
                class="ctx-menu-item ctx-menu-item-danger"
                onclick={() => onDelete(conv.id, conv.workspace)}
              >
                {$t("deleteConv")}
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>

        <!-- Sub-conversations nested under this parent -->
        {#if visibleSubConvMap.has(conv.id)}
          <div class="sub-conv-group">
            {#each visibleSubConvMap.get(conv.id)! as sub (sub.id)}
              <button
                class="sub-conv-item {sub.id === activeConvId ? 'active' : ''} {streamingConvIds[
                  sub.id
                ]
                  ? 'streaming'
                  : ''}"
                style:padding-left="20px"
                onclick={() => onSelect(sub.id)}
              >
                {#if !sub.flowKind}
                  {@render delegatedRoleBadge()}
                {/if}
                {@render conversationTitle(sub.title)}
                {#if streamingConvIds[sub.id]}
                  <span class="conv-streaming-dot" aria-label="Streaming"></span>
                {:else}
                  <span
                    class="conv-delete"
                    role="button"
                    tabindex="0"
                    aria-label="Delete sub-conversation"
                    onclick={(e) => {
                      e.stopPropagation();
                      onDelete(sub.id, sub.workspace);
                    }}
                    onkeydown={(e) =>
                      e.key === "Enter" && (e.stopPropagation(), onDelete(sub.id, sub.workspace))}
                    >×</span
                  >
                {/if}
              </button>
              {#if isActiveBranch(sub.id) && childMap.has(sub.id)}
                {@render nestedThreadItems(childMap.get(sub.id)!, 2)}
              {/if}
            {/each}
          </div>
        {/if}
      {/each}
    {/if}
    {#if (compactProject && hasHiddenRoots) || (embedded && hasMore)}
      <button
        class="show-more-conversations"
        type="button"
        disabled={loadingMore}
        onclick={revealMore}
      >
        {#if loadingMore}<span class="conversation-page-spinner" aria-hidden="true"></span>{/if}
        <span>{$t("showMore")}</span>
      </button>
    {:else if hasMore}
      <div
        class="conversation-page-sentinel"
        class:loading={loadingMore}
        bind:this={pageSentinel}
        aria-label={loadingMore ? $t("loadingContent") : undefined}
      >
        {#if loadingMore}
          <span class="conversation-page-spinner" aria-hidden="true"></span>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .conv-list-shell {
    position: relative;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: hidden;
  }

  .conv-list-shell.embedded {
    min-height: auto;
    flex: none;
    overflow: visible;
  }

  .conv-list {
    position: relative;
    z-index: 1;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--list-item-stack-gap);
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable;
    padding: 4px 6px;
  }

  .conv-list.embedded {
    height: auto;
    overflow: visible;
    padding: 3px 0 0;
  }

  .conv-list.embedded .conv-item,
  .conv-list.embedded .sub-conv-item {
    height: 27px;
    min-height: 27px;
    font-size: 12px;
  }

  .conv-list.embedded .conv-item {
    padding-left: calc(
      var(--list-item-compact-padding-inline) + 16px + var(--list-item-compact-content-gap)
    );
  }

  .show-more-conversations {
    height: 27px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px var(--list-item-compact-padding-inline) 3px
      calc(var(--list-item-compact-padding-inline) + 16px + var(--list-item-compact-content-gap));
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  .show-more-conversations:hover:not(:disabled),
  .show-more-conversations:focus-visible {
    background: var(--interactive-state-bg);
    color: var(--text);
    outline: none;
  }

  .show-more-conversations:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .empty-conversations {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 42px 18px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .empty-conversations-icon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
  }

  .empty-conversations-icon svg {
    width: 19px;
    height: 19px;
  }
  .empty-conversations strong {
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }
  .search-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 28px 14px;
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
  }

  .search-results {
    display: grid;
    gap: var(--list-item-stack-gap);
  }

  .conversation-page-sentinel {
    display: grid;
    place-items: center;
    min-height: 16px;
    padding: 4px 0;
  }

  .conversation-page-sentinel.loading {
    min-height: 28px;
  }

  .conversation-page-spinner {
    width: 13px;
    height: 13px;
    border: 1.5px solid color-mix(in srgb, var(--text-muted) 28%, transparent);
    border-top-color: var(--text-muted);
    border-radius: 50%;
    animation: conversation-page-spin 0.7s linear infinite;
  }

  @keyframes conversation-page-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .search-result-icon {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    color: var(--text-muted);
  }
  .conv-item {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    height: var(--list-item-compact-height);
    box-sizing: border-box;
    background: none;
    border: none;
    border-radius: var(--list-item-compact-radius);
    padding: 4px var(--list-item-compact-padding-inline);
    cursor: pointer;
    text-align: left;
    color: var(--text-muted);
    font: inherit;
    font-size: var(--list-item-compact-font-size);
    line-height: var(--list-item-compact-line-height);
    gap: var(--list-item-compact-content-gap);
    transition:
      background 0.12s,
      color 0.12s;
  }

  .conv-item:hover:not(.active) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  .conv-item.active {
    background: var(--interactive-state-bg);
    color: var(--text);
    font-weight: 500;
  }

  .conv-item.active::before,
  .sub-conv-item.active::before {
    content: "";
    position: absolute;
    top: 5px;
    bottom: 5px;
    left: 0;
    width: 2px;
    background: var(--primary);
    pointer-events: none;
  }

  .conv-delete {
    display: none;
    font-size: 14px;
    color: var(--text-muted);
    cursor: pointer;
    padding: 1px 4px;
    border-radius: 4px;
    flex-shrink: 0;
    line-height: 1;
    transition: background 0.1s;
  }

  .conv-item:hover .conv-delete,
  .sub-conv-item:hover .conv-delete {
    display: block;
  }

  .conv-delete:hover {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  .conv-streaming-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--primary);
    flex-shrink: 0;
    animation: pulse 1.2s ease-in-out infinite;
  }

  .role-badge {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 22px;
    border-radius: 9999px;
    color: #7c4dbe;
    background: color-mix(in srgb, #7c4dbe 10%, transparent);
  }

  .role-icon {
    width: 14px;
    height: 14px;
    stroke: currentColor;
    stroke-width: 1.45;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  :global(.conv-context-trigger) {
    display: block;
    width: 100%;
  }

  .conv-pin-icon {
    width: 10px;
    height: 10px;
    flex-shrink: 0;
    color: var(--primary);
    opacity: 0.7;
  }

  .conv-list-divider {
    height: 1px;
    background: var(--border);
    margin: 4px 6px;
  }

  /* Sub-conversation styles */
  .sub-conv-group {
    padding-left: 0;
    display: flex;
    flex-direction: column;
    gap: var(--list-item-stack-gap);
  }

  .sub-conv-item {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    height: var(--list-item-compact-height);
    box-sizing: border-box;
    background: none;
    border: none;
    border-radius: var(--list-item-compact-radius);
    padding: 4px 8px;
    cursor: pointer;
    text-align: left;
    color: var(--text-muted);
    font: inherit;
    font-size: var(--list-item-compact-font-size);
    line-height: var(--list-item-compact-line-height);
    gap: var(--list-item-compact-content-gap);
    transition:
      background 0.12s,
      color 0.12s;
  }

  .sub-conv-item:hover:not(.active) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  .sub-conv-item.active {
    background: var(--interactive-state-bg);
    color: var(--text);
    font-weight: 500;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .conv-streaming-dot {
      animation: none;
    }
  }
</style>
