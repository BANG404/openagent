<script lang="ts">
  import { invoke } from "$lib/openagent/tauriClient";
  import { t } from "$lib/i18n";
  import type { AgentRole, RecentWorkspace } from "$lib/types";
  import type { SettingsNav, SettingsWindowKind } from "$lib/settingsWindows";
  import { detectWindowPlatform, type WindowPlatform } from "$lib/windowPlatform";
  import ApplicationMenuBar from "$lib/components/ApplicationMenuBar.svelte";
  import CheckpointFlowToggleButton from "$lib/components/CheckpointFlowToggleButton.svelte";
  import WindowControls from "$lib/components/WindowControls.svelte";

  let {
    workspacePath,
    recentWorkspaces,
    roles,
    selectedRoleKey,
    tauriAvailable,
    memorySyncing,
    conversationDetailsAvailable,
    checkpointFlowPanelCollapsed,
    onPickWorkspace,
    onPickWsl,
    onSelectWorkspace,
    onNewConversation,
    onNewWindow,
    onOpenSettings,
    onOpenSettingsWindow,
    onCreateRole,
    onConfigureRole,
    onOpenAbout,
    onQuit,
    onToggleCheckpointFlowPanel,
    onMinimize,
    onMaximize,
    onClose,
    platformOverride,
    windowFocused,
  }: {
    workspacePath: string;
    recentWorkspaces: RecentWorkspace[];
    roles: AgentRole[];
    selectedRoleKey: string;
    tauriAvailable: boolean;
    memorySyncing: boolean;
    conversationDetailsAvailable: boolean;
    checkpointFlowPanelCollapsed: boolean;
    onPickWorkspace: () => void | Promise<void>;
    onPickWsl: () => void | Promise<void>;
    onSelectWorkspace: (path: string) => void | Promise<void>;
    onNewConversation: () => void | Promise<void>;
    onNewWindow: () => void | Promise<void>;
    onOpenSettings: () => void | Promise<void>;
    onOpenSettingsWindow: (kind: SettingsWindowKind, section?: SettingsNav) => void | Promise<void>;
    onCreateRole: () => void;
    onConfigureRole: (role: AgentRole) => void;
    onOpenAbout: () => void | Promise<void>;
    onQuit: () => void;
    onToggleCheckpointFlowPanel: () => void;
    onMinimize: () => void;
    onMaximize: () => void | Promise<void>;
    onClose: () => void;
    platformOverride?: WindowPlatform;
    windowFocused: boolean;
  } = $props();

  let platform = $derived(platformOverride ?? detectWindowPlatform());

  async function openWorkspaceLocation(): Promise<void> {
    if (!tauriAvailable || !workspacePath) return;
    await invoke("open_path", { path: workspacePath }).catch((error) => {
      console.warn("Failed to open workspace location", error);
    });
  }
</script>

<header
  class="title-bar"
  class:macos={platform === "macos"}
  class:window-inactive={!windowFocused}
  data-tauri-drag-region
>
  {#if platform === "macos"}
    <div class="mac-window-controls">
      <WindowControls {platform} {onMinimize} {onMaximize} {onClose} />
    </div>
  {/if}

  <div class="title-bar-menu" data-tauri-drag-region>
    <ApplicationMenuBar
      {recentWorkspaces}
      {workspacePath}
      {roles}
      {selectedRoleKey}
      onNewConversation={() => void onNewConversation()}
      onNewWindow={() => void onNewWindow()}
      onPickWorkspace={() => void onPickWorkspace()}
      onPickWsl={() => void onPickWsl()}
      onSelectWorkspace={(path) => void onSelectWorkspace(path)}
      onOpenWorkspaceLocation={() => void openWorkspaceLocation()}
      onOpenSettings={() => void onOpenSettings()}
      onOpenSettingsWindow={(kind, section) => void onOpenSettingsWindow(kind, section)}
      {onCreateRole}
      {onConfigureRole}
      onOpenAbout={() => void onOpenAbout()}
      onCloseWindow={onClose}
      {onQuit}
      {platform}
    />
  </div>

  <div class="title-bar-drag-handle" data-tauri-drag-region aria-hidden="true"></div>

  <div class="title-actions">
    {#if memorySyncing}<span class="sync-dot" aria-label={$t("syncing")}></span>{/if}
    {#if conversationDetailsAvailable}
      <CheckpointFlowToggleButton
        collapsed={checkpointFlowPanelCollapsed}
        onToggle={onToggleCheckpointFlowPanel}
      />
    {/if}
    {#if platform === "windows"}
      <WindowControls {platform} {onMinimize} {onMaximize} {onClose} />
    {/if}
  </div>
</header>

<style>
  .title-bar {
    position: fixed;
    inset: 0 0 auto;
    z-index: 10;
    display: flex;
    align-items: center;
    height: var(--desktop-titlebar-height);
    box-sizing: border-box;
    background: var(--app-chrome-bg);
    user-select: none;
  }

  .title-bar-menu {
    height: 100%;
    margin-left: 39px;
    flex: 0 0 auto;
  }

  .title-bar.macos .title-bar-menu {
    margin-left: 124px;
  }

  .mac-window-controls {
    position: absolute;
    left: 13px;
    top: 4px;
    z-index: 2;
    height: 27px;
  }

  .title-bar-drag-handle {
    min-width: 80px;
    align-self: stretch;
    flex: 1 1 auto;
  }

  .title-bar-menu,
  .mac-window-controls,
  .title-actions {
    transition: opacity 120ms ease;
  }

  .title-bar.window-inactive .title-bar-menu,
  .title-bar.window-inactive .mac-window-controls,
  .title-bar.window-inactive .title-actions {
    opacity: 0.55;
  }

  .title-actions {
    display: flex;
    align-self: stretch;
    align-items: center;
    flex: 0 0 auto;
  }

  .title-actions :global(.checkpoint-flow-toggle) {
    margin: 0 6px;
  }

  .sync-dot {
    width: 6px;
    height: 6px;
    margin: 0 10px;
    border-radius: 50%;
    background: var(--primary);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .title-bar-menu,
    .mac-window-controls,
    .title-actions {
      transition: none;
    }
  }
</style>
