<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import { tick } from "svelte";
  import { t } from "$lib/i18n";
  import type { Conversation, RecentWorkspace } from "$lib/types";
  import { workspaceFolderName } from "$lib/workspacePath";
  import ConversationList from "./ConversationList.svelte";
  import Tooltip from "./Tooltip.svelte";

  let {
    workspacePath,
    recentWorkspaces,
    conversations,
    recentConversations,
    searchQuery,
    activeConversationId,
    streamingConversationIds,
    hasMore,
    loadingMore,
    onNew,
    onSearch,
    onLoadMore,
    onSelect,
    onOpenConversation,
    onTogglePin,
    onDelete,
    onPickWorkspace,
    onPickWsl,
    onSelectWorkspace,
  }: {
    workspacePath: string;
    recentWorkspaces: RecentWorkspace[];
    conversations: Conversation[];
    recentConversations: Conversation[];
    searchQuery: string;
    activeConversationId: string | null;
    streamingConversationIds: Record<string, boolean>;
    hasMore: boolean;
    loadingMore: boolean;
    onNew: () => void;
    onSearch: (query: string) => void;
    onLoadMore: () => void;
    onSelect: (id: string) => void;
    onOpenConversation: (conversation: Conversation) => void;
    onTogglePin: (id: string) => void;
    onDelete: (id: string) => void;
    onPickWorkspace: () => void;
    onPickWsl: () => void;
    onSelectWorkspace: (path: string) => void;
  } = $props();

  let searchOpen = $state(false);
  let searchInput = $state<HTMLInputElement>();

  let allRecentConversations = $derived.by(() => {
    const byId = new Map(recentConversations.map((item) => [item.id, item]));
    for (const item of conversations) {
      byId.set(item.id, { ...item, workspace: item.workspace ?? workspacePath });
    }
    return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id));
  });

  let projectEntries = $derived.by(() => {
    const byPath = new Map<string, RecentWorkspace>();
    if (workspacePath) {
      byPath.set(workspacePath, {
        path: workspacePath,
        name: workspaceFolderName(workspacePath),
      });
    }
    for (const item of recentWorkspaces) {
      if (!byPath.has(item.path)) byPath.set(item.path, item);
    }
    for (const conversation of allRecentConversations) {
      if (conversation.workspace && !byPath.has(conversation.workspace)) {
        byPath.set(conversation.workspace, {
          path: conversation.workspace,
          name: workspaceFolderName(conversation.workspace),
        });
      }
    }
    return [...byPath.values()].slice(0, 6);
  });

  function conversationsForProject(path: string): Conversation[] {
    return allRecentConversations.filter((item) => item.workspace === path).slice(0, 4);
  }

  async function openSearch(): Promise<void> {
    searchOpen = true;
    await tick();
    searchInput?.focus();
  }

  function closeSearch(): void {
    searchOpen = false;
    onSearch("");
  }

  function selectSearchResult(id: string): void {
    const conversation = conversations.find((item) => item.id === id);
    if (conversation) onOpenConversation(conversation);
  }
</script>

<div class="workspace-browser">
  <div class="workspace-browser-scroll">
    <div class="section-heading">
      <span>{$t("projects")}</span>
      <div class="section-actions">
        <DropdownMenu.Root>
          <Tooltip text={$t("projectActions")} side="bottom">
            <DropdownMenu.Trigger class="section-action" aria-label={$t("projectActions")}>
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"
                ><circle cx="3" cy="8" r="1" /><circle cx="8" cy="8" r="1" /><circle
                  cx="13"
                  cy="8"
                  r="1"
                /></svg
              >
            </DropdownMenu.Trigger>
          </Tooltip>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              class="desktop-menu-panel project-menu"
              sideOffset={4}
              align="end"
            >
              <DropdownMenu.Item class="project-menu-item" onSelect={onNew}
                >{$t("newChat")}</DropdownMenu.Item
              >
              <DropdownMenu.Item class="project-menu-item" onSelect={() => void openSearch()}
                >{$t("searchConversations")}</DropdownMenu.Item
              >
              <DropdownMenu.Separator class="project-menu-separator" />
              <DropdownMenu.Item class="project-menu-item" onSelect={onPickWsl}
                >{$t("openWslFolder")}</DropdownMenu.Item
              >
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <Tooltip text={$t("newProject")} side="bottom">
          <button
            class="section-action"
            type="button"
            aria-label={$t("newProject")}
            onclick={onPickWorkspace}
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg
            >
          </button>
        </Tooltip>
      </div>
    </div>

    {#if searchOpen}
      <div class="sidebar-search-row">
        <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"
          ><circle cx="8" cy="8" r="4.75" /><path d="m11.5 11.5 3.5 3.5" /></svg
        >
        <input
          bind:this={searchInput}
          value={searchQuery}
          aria-label={$t("searchConversations")}
          placeholder={$t("searchConversations")}
          oninput={(event) => onSearch(event.currentTarget.value)}
          onkeydown={(event) => event.key === "Escape" && closeSearch()}
        />
        <button type="button" aria-label={$t("clearSearch")} onclick={closeSearch}>×</button>
      </div>
      <ConversationList
        embedded
        {conversations}
        {searchQuery}
        activeConvId={activeConversationId}
        streamingConvIds={streamingConversationIds}
        {hasMore}
        {loadingMore}
        {onLoadMore}
        onSelect={selectSearchResult}
        {onTogglePin}
        {onDelete}
      />
    {:else}
      <div class="project-list">
        {#each projectEntries as project (project.path)}
          <section class="project-group" aria-label={project.name}>
            <button
              class="project-row"
              class:active={project.path === workspacePath}
              type="button"
              onclick={() => onSelectWorkspace(project.path)}
            >
              <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"
                ><path
                  d="M2.75 5.75h4l1.2 1.5h7.3v6.25a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5z"
                /><path
                  d="M2.75 6V4.75a1.5 1.5 0 0 1 1.5-1.5h3l1.2 1.5h5.3a1.5 1.5 0 0 1 1.5 1.5v1"
                /></svg
              >
              <span>{project.name || workspaceFolderName(project.path)}</span>
            </button>

            {#if project.path === workspacePath}
              <ConversationList
                embedded
                compactProject
                {conversations}
                activeConvId={activeConversationId}
                streamingConvIds={streamingConversationIds}
                {hasMore}
                {loadingMore}
                {onLoadMore}
                {onSelect}
                {onTogglePin}
                {onDelete}
              />
            {:else}
              <div class="project-conversations">
                {#each conversationsForProject(project.path) as conversation (conversation.id)}
                  <button
                    class="workspace-conversation-row"
                    type="button"
                    onclick={() => onOpenConversation(conversation)}
                  >
                    <span>{conversation.title}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </section>
        {/each}
      </div>

      {#if allRecentConversations.length > 0}
        <div class="section-heading recents-heading">
          <span>{$t("recents")}</span>
        </div>
        <div class="recent-conversations" aria-label={$t("recentConversations")}>
          {#each allRecentConversations.slice(0, 12) as conversation (conversation.id)}
            <button
              class="workspace-conversation-row recent-row"
              class:active={conversation.id === activeConversationId}
              type="button"
              onclick={() => onOpenConversation(conversation)}
            >
              <span>{conversation.title}</span>
              {#if streamingConversationIds[conversation.id]}
                <i aria-label="Streaming"></i>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .workspace-browser {
    min-height: 0;
    flex: 1;
    overflow: hidden;
  }

  .workspace-browser-scroll {
    height: 100%;
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable;
    padding: 4px 6px 10px;
  }

  .section-heading {
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 0 6px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .section-actions {
    display: flex;
    align-items: center;
    gap: 1px;
  }

  :global(.section-action) {
    width: 25px;
    height: 25px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    outline: none;
  }

  :global(.section-action:hover),
  :global(.section-action:focus-visible),
  :global(.section-action[data-state="open"]) {
    background: var(--surface2);
    color: var(--text);
  }

  :global(.section-action:focus-visible) {
    box-shadow: var(--focus-ring);
  }

  :global(.section-action svg) {
    width: 14px;
    height: 14px;
  }

  :global(.section-action path) {
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
  }

  :global(.project-menu) {
    min-width: 180px;
    z-index: 242;
  }

  :global(.project-menu-item) {
    min-height: var(--menu-item-min-height);
    box-sizing: border-box;
    padding: var(--menu-item-padding-block) var(--menu-item-padding-inline);
    border-radius: var(--menu-item-radius);
    color: var(--text);
    font-size: var(--menu-item-font-size);
    line-height: var(--menu-item-line-height);
    outline: none;
  }

  :global(.project-menu-item[data-highlighted]) {
    background: var(--bg);
  }

  :global(.project-menu-item + .project-menu-item) {
    margin-top: var(--menu-item-stack-gap);
  }

  :global(.project-menu-separator) {
    height: 1px;
    margin: var(--menu-separator-margin);
    background: var(--border);
  }

  .sidebar-search-row,
  .project-row,
  .workspace-conversation-row {
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    border: 0;
    color: var(--text-muted);
    font: inherit;
    text-align: left;
  }

  .sidebar-search-row {
    height: 30px;
    gap: 7px;
    margin-bottom: 4px;
    padding: 0 8px;
    border-radius: 7px;
    background: var(--surface2);
  }

  .sidebar-search-row > svg {
    width: 15px;
    height: 15px;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
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
    font-size: 12px;
  }

  .sidebar-search-row button {
    border: 0;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .project-list,
  .project-conversations,
  .recent-conversations {
    display: grid;
    gap: var(--list-item-stack-gap);
  }

  .project-group + .project-group {
    margin-top: 7px;
  }

  .project-row {
    height: 30px;
    gap: 7px;
    padding: 4px 8px;
    border-radius: 7px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }

  .project-row:hover,
  .project-row:focus-visible,
  .project-row.active {
    background: var(--surface2);
    outline: none;
  }

  .project-row:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .project-row svg {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .project-row span,
  .workspace-conversation-row span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-conversations {
    margin-top: 3px;
  }

  .workspace-conversation-row {
    position: relative;
    height: 27px;
    padding: 3px 10px 3px 26px;
    border-radius: 6px;
    background: transparent;
    font-size: 12px;
    line-height: 18px;
    cursor: pointer;
    outline: none;
  }

  .workspace-conversation-row:hover,
  .workspace-conversation-row:focus-visible,
  .workspace-conversation-row.active {
    background: var(--surface2);
    color: var(--text);
  }

  .workspace-conversation-row:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .workspace-conversation-row.active::before {
    content: "";
    position: absolute;
    inset: 5px auto 5px 0;
    width: 2px;
    background: var(--primary);
  }

  .recents-heading {
    margin-top: 14px;
  }

  .recent-row {
    height: 29px;
    padding-left: 10px;
  }

  .recent-row i {
    width: 6px;
    height: 6px;
    margin-left: auto;
    flex: 0 0 6px;
    border-radius: 50%;
    background: var(--primary);
  }
</style>
