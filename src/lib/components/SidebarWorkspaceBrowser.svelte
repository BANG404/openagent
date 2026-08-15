<script lang="ts">
  import { DropdownMenu } from "bits-ui";
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
    pinnedProjectPaths,
    searchQuery,
    activeConversationId,
    streamingConversationIds,
    hasMore,
    loadingMore,
    searchActive,
    onNewProjectConversation,
    onLoadMore,
    onSelect,
    onOpenConversation,
    onTogglePin,
    onDelete,
    onSelectWorkspace,
    onToggleProjectPin,
    onOpenProjectFolder,
    onRemoveProject,
  }: {
    workspacePath: string;
    recentWorkspaces: RecentWorkspace[];
    conversations: Conversation[];
    recentConversations: Conversation[];
    pinnedProjectPaths: string[];
    searchQuery: string;
    activeConversationId: string | null;
    streamingConversationIds: Record<string, boolean>;
    hasMore: boolean;
    loadingMore: boolean;
    searchActive: boolean;
    onNewProjectConversation: (path: string) => void;
    onLoadMore: () => void;
    onSelect: (id: string) => void;
    onOpenConversation: (conversation: Conversation) => void;
    onTogglePin: (id: string) => void;
    onDelete: (id: string) => void;
    onSelectWorkspace: (path: string) => void;
    onToggleProjectPin: (path: string) => void;
    onOpenProjectFolder: (path: string) => void;
    onRemoveProject: (path: string) => void;
  } = $props();

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
    const pinnedPaths = new Set(pinnedProjectPaths);
    return [...byPath.values()]
      .sort(
        (left, right) => Number(pinnedPaths.has(right.path)) - Number(pinnedPaths.has(left.path)),
      )
      .slice(0, 6);
  });

  function conversationsForProject(path: string): Conversation[] {
    return allRecentConversations.filter((item) => item.workspace === path).slice(0, 4);
  }

  function selectSearchResult(id: string): void {
    const conversation = conversations.find((item) => item.id === id);
    if (conversation) onOpenConversation(conversation);
  }
</script>

<div class="workspace-browser">
  <div class="workspace-browser-scroll">
    {#if searchActive}
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
      <div class="section-heading">
        <span>{$t("projects")}</span>
      </div>
      <div class="project-list">
        {#each projectEntries as project (project.path)}
          <section class="project-group" aria-label={project.name}>
            <div class="project-row-shell" class:active={project.path === workspacePath}>
              <button
                class="project-row"
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
                {#if pinnedProjectPaths.includes(project.path)}
                  <svg class="project-pin" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="m5.25 3.25 5.5 5.5M9.5 2l4.5 4.5-2.25 1.25-2.5 2.5L8 12.5 3.5 8l2.25-1.25 2.5-2.5zM6.5 9.5 3 13"
                    />
                  </svg>
                {/if}
              </button>
              <div class="project-row-actions">
                <Tooltip text={$t("newChat")} side="bottom">
                  <button
                    class="project-row-action"
                    type="button"
                    aria-label={`${$t("newChat")}: ${project.name}`}
                    onclick={() => onNewProjectConversation(project.path)}
                  >
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M9.25 3.25h-4A1.75 1.75 0 0 0 3.5 5v6A1.75 1.75 0 0 0 5.25 12.75h5.5A1.75 1.75 0 0 0 12.5 11V7"
                      />
                      <path d="m8 8 4.75-4.75M10.25 3.25h2.5v2.5" />
                    </svg>
                  </button>
                </Tooltip>
                <DropdownMenu.Root>
                  <Tooltip text={$t("projectActions")} side="bottom">
                    <DropdownMenu.Trigger
                      class="project-row-action"
                      aria-label={`${$t("projectActions")}: ${project.name}`}
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <circle cx="3" cy="8" r="1" />
                        <circle cx="8" cy="8" r="1" />
                        <circle cx="13" cy="8" r="1" />
                      </svg>
                    </DropdownMenu.Trigger>
                  </Tooltip>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      class="desktop-menu-panel project-menu"
                      sideOffset={4}
                      align="end"
                    >
                      <DropdownMenu.Item
                        class="project-menu-item"
                        onSelect={() => onToggleProjectPin(project.path)}
                      >
                        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path
                            d="m5.25 3.25 5.5 5.5M9.5 2l4.5 4.5-2.25 1.25-2.5 2.5L8 12.5 3.5 8l2.25-1.25 2.5-2.5zM6.5 9.5 3 13"
                          />
                        </svg>
                        <span
                          >{$t(
                            pinnedProjectPaths.includes(project.path)
                              ? "unpinProject"
                              : "pinProject",
                          )}</span
                        >
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        class="project-menu-item"
                        onSelect={() => onOpenProjectFolder(project.path)}
                      >
                        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path
                            d="M2.25 5.5h4l1.2 1.4h6.3v5.35a1.5 1.5 0 0 1-1.5 1.5h-8.5a1.5 1.5 0 0 1-1.5-1.5z"
                          />
                          <path d="M2.25 5.75v-1a1.5 1.5 0 0 1 1.5-1.5H6.5l1.2 1.4h4.55" />
                        </svg>
                        <span>{$t("openProjectFolder")}</span>
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator class="project-menu-separator" />
                      <DropdownMenu.Item
                        class="project-menu-item danger"
                        onSelect={() => onRemoveProject(project.path)}
                      >
                        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M3.25 4.5h9.5M6 4.5V3.25h4V4.5M5 6.5l.5 6.25h5L11 6.5" />
                        </svg>
                        <span>{$t("removeProject")}</span>
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            </div>

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
    min-width: 0;
    flex: 1;
    height: 30px;
    gap: 7px;
    padding: 4px 8px;
    border-radius: 7px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }

  .project-row-shell:hover,
  .project-row-shell:focus-within,
  .project-row-shell.active,
  .project-row:hover,
  .project-row:focus-visible,
  .project-row-shell.active .project-row {
    background: var(--surface2);
    outline: none;
  }

  .project-row-shell {
    position: relative;
    display: flex;
    height: 30px;
    border-radius: 7px;
  }

  .project-row-shell:hover .project-row,
  .project-row-shell:focus-within .project-row,
  .project-row-shell.active .project-row {
    padding-right: 62px;
  }

  .project-row-actions {
    position: absolute;
    top: 2px;
    right: 3px;
    display: flex;
    gap: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .project-row-shell:hover .project-row-actions,
  .project-row-shell:focus-within .project-row-actions,
  .project-row-shell.active .project-row-actions {
    opacity: 1;
    pointer-events: auto;
  }

  :global(.project-row-action) {
    width: 26px;
    height: 26px;
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

  :global(.project-row-action:hover),
  :global(.project-row-action:focus-visible),
  :global(.project-row-action[data-state="open"]) {
    background: var(--bg);
    color: var(--text);
  }

  :global(.project-row-action:focus-visible) {
    box-shadow: var(--focus-ring);
  }

  :global(.project-row-action svg) {
    width: 14px;
    height: 14px;
  }

  :global(.project-row-action path) {
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
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

  .project-row .project-pin {
    width: 12px;
    height: 12px;
    margin-left: auto;
    flex: 0 0 12px;
  }

  :global(.project-menu-item) {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  :global(.project-menu-item > svg) {
    width: 15px;
    height: 15px;
    flex: 0 0 15px;
    stroke: currentColor;
    stroke-width: 1.25;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  :global(.project-menu-item.danger) {
    color: var(--danger);
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
