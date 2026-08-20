<script lang="ts">
  import type { AgentRole, Conversation, RecentWorkspace } from "$lib/types";
  import { loadSidebarWidth, saveSidebarWidth } from "$lib/sidebarSizing";
  import { detectWindowPlatform, type WindowPlatform } from "$lib/windowPlatform";

  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";
  import RoleSelector from "$lib/components/RoleSelector.svelte";
  import SidebarCollapseButton from "$lib/components/SidebarCollapseButton.svelte";
  import SidebarHistoryControls from "$lib/components/SidebarHistoryControls.svelte";
  import SidebarPrimaryActions from "$lib/components/SidebarPrimaryActions.svelte";
  import SidebarResizeHandle from "$lib/components/SidebarResizeHandle.svelte";
  import SidebarSettingsAction from "$lib/components/SidebarSettingsAction.svelte";
  import SidebarWorkspaceBrowser from "$lib/components/SidebarWorkspaceBrowser.svelte";
  import { t } from "$lib/i18n";

  let {
    collapsed = $bindable(),
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
    settingsOpen,
    onRoleChange,
    onBack,
    onForward,
    onNew,
    onNewProjectConversation,
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
    onToggleSettings,
    platformOverride,
    windowFocused,
  }: {
    collapsed: boolean;
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
    settingsOpen: boolean;
    onRoleChange: (role: string) => void | Promise<void>;
    onBack: () => void | Promise<void>;
    onForward: () => void | Promise<void>;
    onNew: () => void | Promise<void>;
    onNewProjectConversation: (path: string) => void | Promise<void>;
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
    onToggleSettings: () => void | Promise<void>;
    platformOverride?: WindowPlatform;
    windowFocused: boolean;
  } = $props();

  const collapsedStorageKey = "openagent.sidebar.collapsed";
  let platform = $derived(platformOverride ?? detectWindowPlatform());
  let width = $state(loadSidebarWidth());
  let resizing = $state(false);
  let searchOpen = $state(false);

  function toggle(): void {
    collapsed = !collapsed;
    window.localStorage.setItem(collapsedStorageKey, String(collapsed));
  }

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
  class:collapsed
  class:resizing
  class:macos={platform === "macos"}
  class:window-inactive={!windowFocused}
  style:--sidebar-width={`${width}px`}
>
  <div class="sidebar-top" data-tauri-drag-region>
    <SidebarCollapseButton {collapsed} onToggle={toggle} />
    <SidebarHistoryControls
      {canGoBack}
      {canGoForward}
      onBack={() => void onBack()}
      onForward={() => void onForward()}
    />
  </div>
  {#if !collapsed}
    <div class="sidebar-content">
      <div class="sidebar-role">
        <RoleSelector value={selectedRoleKey} {roles} header onChange={changeRole} />
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
      <SidebarSettingsAction active={settingsOpen} onToggle={() => void onToggleSettings()} />
    </div>
    <SidebarResizeHandle
      {width}
      ariaLabel={$t("resizeSidebar")}
      onResize={(next) => (width = next)}
      onResizeStateChange={(next) => (resizing = next)}
      onResizeEnd={saveSidebarWidth}
    />
  {/if}
</aside>

<style>
  .sidebar {
    position: relative;
    width: var(--sidebar-width);
    padding-top: 40px;
    box-sizing: border-box;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--app-chrome-bg);
    border-right: 1px solid var(--border);
    overflow: visible;
    user-select: none;
    transition: width 180ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .sidebar.collapsed {
    width: 0;
    padding-top: 0;
    background: transparent;
    border-right: 0;
  }

  .sidebar.resizing {
    transition: none;
  }

  .sidebar-top {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 11;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 0 4px 0 6px;
    box-sizing: border-box;
    transition: opacity 120ms ease;
  }

  .sidebar.window-inactive .sidebar-top {
    opacity: 0.55;
  }

  .sidebar.macos .sidebar-top {
    left: 76px;
  }

  .sidebar-top :global(.sidebar-collapse-button) {
    width: 34px;
    height: 32px;
    flex-basis: 34px;
  }

  .sidebar-content {
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .sidebar-role {
    flex: 0 0 auto;
    padding: 5px 8px 1px;
  }

  .sidebar-role :global(.role-selector) {
    max-width: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar {
      transition: none;
    }

    .sidebar-top {
      transition: none;
    }
  }
</style>
