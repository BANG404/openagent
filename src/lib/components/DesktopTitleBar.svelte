<script lang="ts">
  import type { AgentRole, RecentWorkspace, WorkspaceContext } from "$lib/types";
  import { t } from "$lib/i18n";
  import RoleSelector from "$lib/components/RoleSelector.svelte";
  import Tooltip from "$lib/components/Tooltip.svelte";
  import WindowControls from "$lib/components/WindowControls.svelte";
  import WorkspaceSwitcher from "$lib/components/WorkspaceSwitcher.svelte";

  let {
    sidebarCollapsed,
    workspace,
    workspacePath,
    recentWorkspaces,
    tauriAvailable,
    browserModeNotice,
    selectedRoleKey,
    roles,
    memorySyncing,
    onPickWorkspace,
    onPickWsl,
    onSelectWorkspace,
    onNewConversation,
    onRoleChange,
    onMinimize,
    onMaximize,
    onClose,
  }: {
    sidebarCollapsed: boolean;
    workspace: WorkspaceContext | null;
    workspacePath: string;
    recentWorkspaces: RecentWorkspace[];
    tauriAvailable: boolean;
    browserModeNotice: string;
    selectedRoleKey: string;
    roles: AgentRole[];
    memorySyncing: boolean;
    onPickWorkspace: () => void | Promise<void>;
    onPickWsl: () => void | Promise<void>;
    onSelectWorkspace: (path: string) => void | Promise<void>;
    onNewConversation: () => void | Promise<void>;
    onRoleChange: (role: string) => void | Promise<void>;
    onMinimize: () => void;
    onMaximize: () => void | Promise<void>;
    onClose: () => void;
  } = $props();
</script>

<header class="title-bar" class:sidebar-collapsed={sidebarCollapsed} data-tauri-drag-region>
  <div class="title-bar-left">
    <WorkspaceSwitcher
      {workspace}
      {workspacePath}
      {recentWorkspaces}
      {tauriAvailable}
      {browserModeNotice}
      onPick={onPickWorkspace}
      {onPickWsl}
      onSelect={onSelectWorkspace}
    />
    {#if sidebarCollapsed}
      <Tooltip text={$t("newChat")} side="bottom">
        <button
          class="title-new-conversation"
          type="button"
          aria-label={$t("newChat")}
          onclick={() => void onNewConversation()}
        >
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
        </button>
      </Tooltip>
      <RoleSelector
        value={selectedRoleKey}
        {roles}
        compact
        onChange={(role) => void onRoleChange(role)}
      />
    {/if}
    {#if workspace?.git_branch}
      <Tooltip text={`${$t("gitBranch")}: ${workspace.git_branch}`}>
        <span class="branch-pill">⎇ {workspace.git_branch}</span>
      </Tooltip>
    {/if}
  </div>
  <div class="title-bar-drag-handle" data-tauri-drag-region aria-hidden="true"></div>
  <div class="title-actions">
    {#if memorySyncing}
      <Tooltip text="Memory syncing"><span class="sync-dot">●</span></Tooltip>
    {/if}
    <WindowControls {onMinimize} {onMaximize} {onClose} />
  </div>
</header>

<style>
  .title-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    height: 48px;
    background: linear-gradient(to bottom, var(--bg) 0%, var(--bg) 80%, transparent 100%);
    user-select: none;
  }
  .title-bar.sidebar-collapsed {
    padding-left: 56px;
  }
  .title-bar-left {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
  }
  .title-bar-drag-handle {
    align-self: stretch;
    flex: 1 1 96px;
    min-width: 64px;
    margin: 0 8px;
  }
  .title-new-conversation {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition:
      background 120ms ease,
      color 120ms ease;
  }
  .title-new-conversation:hover,
  .title-new-conversation:focus-visible {
    background: var(--surface2);
    color: var(--text);
    outline: none;
  }
  .title-new-conversation:focus-visible {
    box-shadow: var(--focus-ring);
  }
  .title-new-conversation:active {
    background: color-mix(in srgb, var(--surface2) 78%, var(--text) 6%);
  }
  .title-new-conversation svg {
    width: 18px;
    height: 18px;
  }
  .branch-pill {
    font-size: 11px;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    color: var(--text-muted);
    background: var(--surface2);
    border: 0;
    border-radius: 12px;
    padding: 2px 8px;
    white-space: nowrap;
    letter-spacing: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: min(220px, 32vw);
    flex-shrink: 1;
  }
  .title-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .sync-dot {
    color: var(--primary);
    font-size: 10px;
    margin-right: 2px;
    animation: pulse 1.5s ease-in-out infinite;
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
</style>
