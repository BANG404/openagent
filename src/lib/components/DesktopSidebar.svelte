<script lang="ts">
  import type { AgentRole, Conversation } from "$lib/types";
  import { loadSidebarWidth, saveSidebarWidth } from "$lib/sidebarSizing";

  import ConversationList from "$lib/components/ConversationList.svelte";
  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";
  import RoleSelector from "$lib/components/RoleSelector.svelte";
  import SidebarCollapseButton from "$lib/components/SidebarCollapseButton.svelte";
  import SidebarHistoryControls from "$lib/components/SidebarHistoryControls.svelte";
  import SidebarNav from "$lib/components/SidebarNav.svelte";
  import SidebarPrimaryActions from "$lib/components/SidebarPrimaryActions.svelte";
  import SidebarResizeHandle from "$lib/components/SidebarResizeHandle.svelte";
  import { t } from "$lib/i18n";

  let {
    collapsed = $bindable(),
    roles,
    selectedRoleKey,
    canGoBack,
    canGoForward,
    searchQuery,
    conversations,
    activeConversationId,
    streamingConversationIds,
    hasMore,
    loadingMore,
    loading,
    memoryOpen,
    rolesOpen,
    skillsOpen,
    settingsOpen,
    onRoleChange,
    onBack,
    onForward,
    onNew,
    onSearch,
    onLoadMore,
    onSelect,
    onTogglePin,
    onDelete,
    onToggleMemory,
    onToggleRoles,
    onToggleSkills,
    onToggleSettings,
  }: {
    collapsed: boolean;
    roles: AgentRole[];
    selectedRoleKey: string;
    canGoBack: boolean;
    canGoForward: boolean;
    searchQuery: string;
    conversations: Conversation[];
    activeConversationId: string | null;
    streamingConversationIds: Record<string, boolean>;
    hasMore: boolean;
    loadingMore: boolean;
    loading: boolean;
    memoryOpen: boolean;
    rolesOpen: boolean;
    skillsOpen: boolean;
    settingsOpen: boolean;
    onRoleChange: (role: string) => void | Promise<void>;
    onBack: () => void | Promise<void>;
    onForward: () => void | Promise<void>;
    onNew: () => void | Promise<void>;
    onSearch: (query: string) => void;
    onLoadMore: () => void | Promise<void>;
    onSelect: (id: string) => void | Promise<void>;
    onTogglePin: (id: string) => void | Promise<void>;
    onDelete: (id: string) => void | Promise<void>;
    onToggleMemory: () => void | Promise<void>;
    onToggleRoles: () => void | Promise<void>;
    onToggleSkills: () => void | Promise<void>;
    onToggleSettings: () => void | Promise<void>;
  } = $props();

  const collapsedStorageKey = "openagent.sidebar.collapsed";
  let width = $state(loadSidebarWidth());
  let resizing = $state(false);

  function toggle(): void {
    collapsed = !collapsed;
    window.localStorage.setItem(collapsedStorageKey, String(collapsed));
  }
</script>

<aside class="sidebar" class:collapsed class:resizing style:--sidebar-width={`${width}px`}>
  <div class="sidebar-top" data-tauri-drag-region>
    {#if !collapsed}
      <div class="sidebar-navigation-start" data-tauri-drag-region>
        <RoleSelector
          value={selectedRoleKey}
          {roles}
          header
          onChange={(role) => void onRoleChange(role)}
        />
      </div>
      <div class="sidebar-navigation-end" data-tauri-drag-region>
        <SidebarHistoryControls
          {canGoBack}
          {canGoForward}
          onBack={() => void onBack()}
          onForward={() => void onForward()}
        />
        <SidebarCollapseButton {collapsed} onToggle={toggle} />
      </div>
    {:else}
      <SidebarCollapseButton {collapsed} onToggle={toggle} />
    {/if}
  </div>
  {#if !collapsed}
    <SidebarPrimaryActions {searchQuery} {onNew} {onSearch} />
    {#if loading}
      <LoadingSkeleton variant="sidebar" rows={8} label={$t("loadingContent")} />
    {:else}
      <ConversationList
        {conversations}
        {searchQuery}
        activeConvId={activeConversationId}
        streamingConvIds={streamingConversationIds}
        {hasMore}
        {loadingMore}
        onLoadMore={() => void onLoadMore()}
        onSelect={(id) => void onSelect(id)}
        {onTogglePin}
        {onDelete}
      />
    {/if}
    <SidebarNav
      {memoryOpen}
      {rolesOpen}
      {skillsOpen}
      {settingsOpen}
      {onToggleMemory}
      {onToggleRoles}
      {onToggleSkills}
      {onToggleSettings}
    />
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
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--border);
    overflow: visible;
    user-select: none;
    transition: width 180ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .sidebar.collapsed {
    width: 0;
    background: transparent;
    border-right: 0;
    overflow: visible;
  }

  .sidebar.resizing {
    transition: none;
  }

  .sidebar-top {
    min-height: 50px;
    box-sizing: border-box;
    padding: 5px 4px 5px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2px;
  }

  .sidebar-navigation-start {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    overflow: hidden;
  }

  .sidebar-navigation-end {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
  }

  .sidebar.collapsed .sidebar-top {
    position: relative;
    z-index: 11;
    width: 48px;
    justify-content: center;
    padding-left: 4px;
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar {
      transition: none;
    }
  }
</style>
