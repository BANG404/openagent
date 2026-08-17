<script lang="ts">
  import { invoke } from "$lib/openagent/tauriClient";
  import { t } from "$lib/i18n";
  import type { RecentWorkspace, WorkspaceContext } from "$lib/types";
  import { workspaceFolderName } from "$lib/workspacePath";
  import { detectWindowPlatform, type WindowPlatform } from "$lib/windowPlatform";
  import ApplicationMenuBar from "$lib/components/ApplicationMenuBar.svelte";
  import CheckpointFlowToggleButton from "$lib/components/CheckpointFlowToggleButton.svelte";
  import Tooltip from "$lib/components/Tooltip.svelte";
  import WindowControls from "$lib/components/WindowControls.svelte";

  let {
    workspace,
    workspacePath,
    recentWorkspaces,
    tauriAvailable,
    memorySyncing,
    checkpointFlowAvailable,
    checkpointFlowPanelCollapsed,
    onPickWorkspace,
    onPickWsl,
    onSelectWorkspace,
    onNewConversation,
    onNewWindow,
    onOpenMemory,
    onOpenRoles,
    onOpenSkills,
    onOpenSettings,
    onOpenAbout,
    onQuit,
    onToggleCheckpointFlowPanel,
    onMinimize,
    onMaximize,
    onClose,
    platformOverride,
    windowFocused,
  }: {
    workspace: WorkspaceContext | null;
    workspacePath: string;
    recentWorkspaces: RecentWorkspace[];
    tauriAvailable: boolean;
    memorySyncing: boolean;
    checkpointFlowAvailable: boolean;
    checkpointFlowPanelCollapsed: boolean;
    onPickWorkspace: () => void | Promise<void>;
    onPickWsl: () => void | Promise<void>;
    onSelectWorkspace: (path: string) => void | Promise<void>;
    onNewConversation: () => void | Promise<void>;
    onNewWindow: () => void | Promise<void>;
    onOpenMemory: () => void | Promise<void>;
    onOpenRoles: () => void | Promise<void>;
    onOpenSkills: () => void | Promise<void>;
    onOpenSettings: () => void | Promise<void>;
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
  let folderName = $derived(workspaceFolderName(workspace?.path));
  let workspaceLabel = $derived(
    workspace?.environment.kind === "wsl"
      ? `${folderName} · ${workspace.environment.distribution}`
      : folderName,
  );

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
      onNewConversation={() => void onNewConversation()}
      onNewWindow={() => void onNewWindow()}
      onPickWorkspace={() => void onPickWorkspace()}
      onPickWsl={() => void onPickWsl()}
      onSelectWorkspace={(path) => void onSelectWorkspace(path)}
      onOpenWorkspaceLocation={() => void openWorkspaceLocation()}
      onOpenMemory={() => void onOpenMemory()}
      onOpenRoles={() => void onOpenRoles()}
      onOpenSkills={() => void onOpenSkills()}
      onOpenSettings={() => void onOpenSettings()}
      onOpenAbout={() => void onOpenAbout()}
      onCloseWindow={onClose}
      {onQuit}
      {platform}
    />
  </div>

  <div class="title-bar-drag-handle" data-tauri-drag-region aria-hidden="true"></div>

  <Tooltip text={workspace?.path ?? workspaceLabel} side="bottom">
    <div class="workspace-environment" aria-label={workspaceLabel}>
      <span class="workspace-name">{workspaceLabel}</span>
      {#if workspace?.environment.kind === "wsl"}<span class="wsl-badge">WSL</span>{/if}
      {#if workspace?.git_branch}<span class="branch-name">{workspace.git_branch}</span>{/if}
    </div>
  </Tooltip>

  <div class="title-actions">
    {#if memorySyncing}<span class="sync-dot" aria-label={$t("syncing")}></span>{/if}
    {#if checkpointFlowAvailable}
      <CheckpointFlowToggleButton
        collapsed={checkpointFlowPanelCollapsed}
        onToggle={onToggleCheckpointFlowPanel}
      />
    {/if}
    {#if platform !== "macos"}
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
    height: 40px;
    box-sizing: border-box;
    background: var(--app-chrome-bg);
    border-bottom: 1px solid var(--border);
    user-select: none;
  }

  .title-bar-menu {
    height: 100%;
    margin-left: 118px;
    flex: 0 0 auto;
  }

  .title-bar.macos .title-bar-menu {
    margin-left: 190px;
  }

  .mac-window-controls {
    position: absolute;
    left: 13px;
    top: 6px;
    z-index: 2;
    height: 28px;
  }

  .title-bar-drag-handle {
    min-width: 80px;
    align-self: stretch;
    flex: 1 1 auto;
  }

  .title-bar-menu,
  .mac-window-controls,
  .workspace-environment,
  .title-actions {
    transition: opacity 120ms ease;
  }

  .title-bar.window-inactive .title-bar-menu,
  .title-bar.window-inactive .mac-window-controls,
  .title-bar.window-inactive .workspace-environment,
  .title-bar.window-inactive .title-actions {
    opacity: 0.55;
  }

  .workspace-environment {
    position: absolute;
    left: 50%;
    top: 50%;
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: min(380px, 34vw);
    padding: 3px 8px;
    border-radius: 5px;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 18px;
    pointer-events: none;
    transform: translate(-50%, -50%);
  }

  .workspace-name,
  .branch-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workspace-name {
    color: var(--text);
    font-weight: 600;
  }

  .branch-name {
    max-width: 150px;
    padding-left: 7px;
    border-left: 1px solid var(--border);
    font-family: "JetBrains Mono", "Fira Code", monospace;
    font-size: 10px;
  }

  .wsl-badge {
    flex: 0 0 auto;
    padding: 0 4px;
    border: 1px solid color-mix(in srgb, var(--primary) 42%, transparent);
    border-radius: 4px;
    color: var(--primary);
    font-size: 8px;
    font-weight: 700;
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

  @media (max-width: 760px) {
    .workspace-environment {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .title-bar-menu,
    .mac-window-controls,
    .workspace-environment,
    .title-actions {
      transition: none;
    }
  }
</style>
