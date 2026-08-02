<script lang="ts">
  import { invoke } from "$lib/openagent/tauriClient";
  import { DropdownMenu } from "bits-ui";
  import type { WorkspaceContext, RecentWorkspace } from "$lib/types";
  import { t } from "$lib/i18n";
  import { isWslWorkspacePath, workspaceFolderName } from "$lib/workspacePath";
  import Tooltip from "./Tooltip.svelte";

  interface Props {
    workspace: WorkspaceContext | null;
    workspacePath: string;
    recentWorkspaces: RecentWorkspace[];
    tauriAvailable: boolean;
    browserModeNotice: string;
    onPick: () => void;
    onPickWsl: () => void;
    onSelect: (path: string) => void;
  }
  let {
    workspace,
    workspacePath,
    recentWorkspaces,
    tauriAvailable,
    browserModeNotice,
    onPick,
    onPickWsl,
    onSelect,
  }: Props = $props();

  let open = $state(false);

  let folderName = $derived(workspaceFolderName(workspace?.path));
  let workspaceTooltip = $derived(
    workspace?.environment.kind === "wsl"
      ? `${workspace.environment.distribution}:${workspace.environment.linux_path}`
      : (workspace?.path ?? $t("switchWorkspace")),
  );

  let otherRecent = $derived(recentWorkspaces.filter((w) => w.path !== workspacePath));

  async function openWorkspaceLocation(path: string) {
    if (!tauriAvailable) return;
    try {
      await invoke("open_path", { path });
    } catch (error) {
      console.warn("Failed to open workspace location", error);
    }
  }
</script>

<div class="workspace-switcher">
  <DropdownMenu.Root bind:open>
    <Tooltip text={tauriAvailable ? workspaceTooltip : browserModeNotice} side="bottom">
      <DropdownMenu.Trigger
        class="workspace-btn"
        aria-label={`${$t("currentWorkspace")}: ${workspaceTooltip}`}
      >
        <span class="folder-name">{folderName}</span>
        {#if workspace?.environment.kind === "wsl"}
          <span class="wsl-badge">WSL</span>
        {/if}
      </DropdownMenu.Trigger>
    </Tooltip>
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        class="ws-dropdown"
        sideOffset={4}
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenu.Item class="ws-dropdown-item ws-open-folder" onSelect={onPick}>
          {$t("openFolder")}
        </DropdownMenu.Item>
        <DropdownMenu.Item class="ws-dropdown-item ws-open-folder" onSelect={onPickWsl}>
          {$t("openWslFolder")}
        </DropdownMenu.Item>
        {#if workspacePath}
          <DropdownMenu.Item
            class="ws-dropdown-item"
            disabled={!tauriAvailable}
            onSelect={() => openWorkspaceLocation(workspacePath)}
          >
            {$t("openCurrentWorkspaceLocation")}
          </DropdownMenu.Item>
        {/if}
        {#if otherRecent.length > 0}
          <DropdownMenu.Separator class="ws-dropdown-divider" />
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger
              class="ws-dropdown-item ws-recent-trigger"
              textValue={$t("recentWorkspaces")}
            >
              <span class="ws-dropdown-name">{$t("recentWorkspaces")}</span>
              <svg class="ws-submenu-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="m6 4 4 4-4 4" />
              </svg>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                class="ws-dropdown ws-recent-submenu"
                sideOffset={6}
                alignOffset={-6}
              >
                <div class="ws-recent-list">
                  {#each otherRecent as ws (ws.path)}
                    <div class="ws-recent-row">
                      <Tooltip text={ws.path} side="right" block>
                        <DropdownMenu.Item
                          class="ws-dropdown-item"
                          onSelect={() => onSelect(ws.path)}
                        >
                          {#if isWslWorkspacePath(ws.path)}
                            <span class="wsl-badge">WSL</span>
                          {/if}
                          <span class="ws-workspace-path">{ws.path}</span>
                        </DropdownMenu.Item>
                      </Tooltip>
                    </div>
                  {/each}
                </div>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
</div>

<style>
  .workspace-switcher {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }

  :global(.workspace-btn) {
    display: flex;
    align-items: center;
    gap: 6px;
    width: auto;
    min-width: 0;
    max-width: min(240px, 38vw);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    color: inherit;
    transition: background 0.12s;
  }

  :global(.workspace-btn:hover),
  :global(.workspace-btn[data-state="open"]) {
    background: var(--surface2);
  }

  .folder-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }

  .wsl-badge {
    flex-shrink: 0;
    border: 1px solid color-mix(in srgb, var(--primary) 45%, transparent);
    border-radius: 4px;
    padding: 1px 4px;
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    color: var(--primary);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.35px;
    line-height: 1.2;
  }

  :global(.ws-dropdown) {
    background: var(--control-surface);
    border: 0;
    border-radius: var(--menu-content-radius);
    padding: var(--menu-content-padding);
    min-width: 200px;
    max-width: 340px;
    z-index: 201;
    -webkit-backdrop-filter: blur(12px) saturate(1.08);
    backdrop-filter: blur(12px) saturate(1.08);
    box-shadow: var(--raised-shadow);
    outline: none;
  }

  :global(.ws-dropdown-item) {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--menu-item-gap);
    width: 100%;
    background: none;
    border: none;
    border-radius: var(--menu-item-radius);
    min-height: var(--menu-item-min-height);
    padding: var(--menu-item-padding-block) var(--menu-item-padding-inline);
    font-size: var(--menu-item-font-size);
    line-height: var(--menu-item-line-height);
    color: var(--text);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s;
    outline: none;
  }

  :global(.ws-dropdown-item + .ws-dropdown-item),
  .ws-recent-row + .ws-recent-row {
    margin-top: var(--menu-item-stack-gap);
  }

  :global(.ws-recent-trigger) {
    justify-content: space-between;
  }

  :global(.ws-recent-trigger[data-state="open"]) {
    background: var(--bg);
  }

  :global(.ws-submenu-chevron) {
    width: 12px;
    height: 12px;
    margin-left: auto;
    color: var(--text-muted);
  }

  :global(.ws-submenu-chevron path) {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .ws-recent-row {
    display: block;
  }

  .ws-recent-list {
    max-height: min(240px, calc(100vh - 160px));
    overflow-y: auto;
    overscroll-behavior: contain;
    margin-right: calc(-1 * var(--menu-content-padding));
    padding-right: var(--menu-content-padding);
  }

  :global(.ws-recent-submenu) {
    width: min(460px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
  }

  .ws-recent-row :global(.ws-dropdown-item) {
    min-width: 0;
  }

  :global(.ws-dropdown-item[data-highlighted]:not([data-selected])),
  :global(.ws-dropdown-item:hover:not([data-selected])) {
    background: var(--bg);
  }

  :global(.ws-dropdown-item[data-selected]) {
    background: var(--bg);
    color: var(--text);
  }

  :global(.ws-dropdown-item[data-selected]::before) {
    content: "";
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 0;
    width: 2px;
    background: var(--primary);
    pointer-events: none;
  }

  .ws-dropdown-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ws-workspace-path {
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 16px;
  }

  :global(.ws-dropdown-divider) {
    height: 1px;
    background: var(--border);
    margin: var(--menu-separator-margin);
  }
</style>
