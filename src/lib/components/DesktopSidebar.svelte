<script lang="ts">
  import type { AgentRole, Conversation, RecentWorkspace } from "$lib/types";
  import { loadSidebarWidth, saveSidebarWidth } from "$lib/sidebarSizing";
  import { detectWindowPlatform, type WindowPlatform } from "$lib/windowPlatform";

  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";
  import RoleSelector from "$lib/components/RoleSelector.svelte";
  import SidebarHistoryControls from "$lib/components/SidebarHistoryControls.svelte";
  import SidebarPrimaryActions from "$lib/components/SidebarPrimaryActions.svelte";
  import SidebarResizeHandle from "$lib/components/SidebarResizeHandle.svelte";
  import SidebarWorkspaceBrowser from "$lib/components/SidebarWorkspaceBrowser.svelte";
  import { t } from "$lib/i18n";

  let {
    roles,
    selectedRoleKey,
    canGoBack,
    canGoForward,
    workspacePath,
    workspaceSwitchTarget = null,
    recentWorkspaces,
    pinnedProjectPaths,
    searchQuery,
    conversations,
    recentConversations,
    activeConversationId,
    streamingConversationIds,
    hasMore,
    loadingMore,
    loadingRecentConversations,
    loading,
    onRoleChange,
    onBack,
    onForward,
    onNew,
    onNewProjectConversation,
    onLoadProjectConversations,
    onSearch,
    onLoadMore,
    onSelect,
    onOpenConversation,
    onTogglePin,
    onDelete,
    onSelectWorkspace,
    onToggleProjectPin,
    onOpenProjectFolder,
    onRemoveProject,
    platformOverride,
    windowFocused,
  }: {
    roles: AgentRole[];
    selectedRoleKey: string;
    canGoBack: boolean;
    canGoForward: boolean;
    workspacePath: string;
    workspaceSwitchTarget?: string | null;
    recentWorkspaces: RecentWorkspace[];
    pinnedProjectPaths: string[];
    searchQuery: string;
    conversations: Conversation[];
    recentConversations: Conversation[];
    activeConversationId: string | null;
    streamingConversationIds: Record<string, boolean>;
    hasMore: boolean;
    loadingMore: boolean;
    loadingRecentConversations: boolean;
    loading: boolean;
    onRoleChange: (role: string) => void | Promise<void>;
    onBack: () => void | Promise<void>;
    onForward: () => void | Promise<void>;
    onNew: () => void | Promise<void>;
    onNewProjectConversation: (path: string) => void | Promise<void>;
    onLoadProjectConversations: (path: string, roleKey: string) => Promise<Conversation[]>;
    onSearch: (query: string) => void;
    onLoadMore: () => void | Promise<void>;
    onSelect: (id: string) => void | Promise<void>;
    onOpenConversation: (conversation: Conversation) => void | Promise<void>;
    onTogglePin: (id: string) => void | Promise<void>;
    onDelete: (id: string, workspace?: string) => void | Promise<void>;
    onSelectWorkspace: (path: string) => void | Promise<void>;
    onToggleProjectPin: (path: string) => void;
    onOpenProjectFolder: (path: string) => void | Promise<void>;
    onRemoveProject: (path: string) => void | Promise<void>;
    platformOverride?: WindowPlatform;
    windowFocused: boolean;
  } = $props();

  let platform = $derived(platformOverride ?? detectWindowPlatform());
  let width = $state(loadSidebarWidth());
  let resizing = $state(false);
  let searchOpen = $state(false);

  function changeRole(role: string): void {
    searchOpen = false;
    onSearch("");
    void onRoleChange(role);
  }

  function openConversation(conversation: Conversation): void {
    if (searchOpen) {
      searchOpen = false;
      onSearch("");
    }
    void onOpenConversation(conversation);
  }
</script>

<aside
  class="sidebar"
  class:resizing
  class:macos={platform === "macos"}
  class:window-inactive={!windowFocused}
  style:--sidebar-width={`${width}px`}
>
  <div class="sidebar-top" data-tauri-drag-region>
    <img class="sidebar-app-icon" src="/app-icon.png" alt="OpenAgent" draggable="false" />
  </div>
  <div class="sidebar-content">
    <div class="sidebar-role">
      <RoleSelector value={selectedRoleKey} {roles} header onChange={changeRole} />
      <SidebarHistoryControls
        {canGoBack}
        {canGoForward}
        onBack={() => void onBack()}
        onForward={() => void onForward()}
      />
    </div>
    <SidebarPrimaryActions bind:searchOpen {searchQuery} onNew={() => void onNew()} {onSearch} />
    {#if loading}
      <LoadingSkeleton variant="sidebar" rows={8} label={$t("loadingContent")} />
    {:else}
      <SidebarWorkspaceBrowser
        {workspacePath}
        {workspaceSwitchTarget}
        {selectedRoleKey}
        {recentWorkspaces}
        {pinnedProjectPaths}
        {searchQuery}
        {conversations}
        {recentConversations}
        {activeConversationId}
        {streamingConversationIds}
        {hasMore}
        {loadingMore}
        {loadingRecentConversations}
        searchActive={searchOpen}
        onNewProjectConversation={(path) => void onNewProjectConversation(path)}
        {onLoadProjectConversations}
        onLoadMore={() => void onLoadMore()}
        onSelect={(id) => void onSelect(id)}
        onOpenConversation={openConversation}
        {onTogglePin}
        {onDelete}
        onSelectWorkspace={(path) => void onSelectWorkspace(path)}
        {onToggleProjectPin}
        onOpenProjectFolder={(path) => void onOpenProjectFolder(path)}
        onRemoveProject={(path) => void onRemoveProject(path)}
      />
    {/if}
  </div>
  <SidebarResizeHandle
    {width}
    ariaLabel={$t("resizeSidebar")}
    onResize={(next) => (width = next)}
    onResizeStateChange={(next) => (resizing = next)}
    onResizeEnd={saveSidebarWidth}
  />
</aside>

<style>
  .sidebar {
    position: relative;
    width: var(--sidebar-width);
    padding-top: var(--desktop-titlebar-height);
    box-sizing: border-box;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: transparent;
    overflow: visible;
    user-select: none;
    transition: width 180ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .sidebar.resizing {
    transition: none;
  }

  .sidebar-top {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 11;
    height: var(--desktop-titlebar-height);
    display: flex;
    align-items: center;
    padding: 0 4px 0 6px;
    box-sizing: border-box;
    transition: opacity 120ms ease;
  }

  .sidebar.window-inactive .sidebar-top,
  .sidebar.window-inactive .sidebar-role {
    opacity: 0.55;
  }

  .sidebar.macos .sidebar-top {
    left: 76px;
  }

  .sidebar-app-icon {
    width: 16px;
    height: 16px;
    margin-left: 9px;
    object-fit: contain;
    pointer-events: none;
  }

  .sidebar-content {
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .sidebar-role {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    padding: 5px 8px 1px;
    transition: opacity 120ms ease;
  }

  .sidebar-role :global(.role-selector-trigger.header) {
    min-width: 0;
    max-width: calc(100% - 62px);
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar {
      transition: none;
    }

    .sidebar-top,
    .sidebar-role {
      transition: none;
    }
  }
</style>
