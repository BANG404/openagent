<script lang="ts">
  import { invoke } from "$lib/openagent/tauriClient";
  import { DropdownMenu } from "bits-ui";
  import type { WorkspaceContext, RecentWorkspace } from "$lib/types";
  import { t } from "$lib/i18n";
  import { detectWindowPlatform, type WindowPlatform } from "$lib/windowPlatform";
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
    variant?: "title" | "composer";
    platformOverride?: WindowPlatform;
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
    variant = "title",
    platformOverride,
  }: Props = $props();

  let open = $state(false);
  let platform = $derived(platformOverride ?? detectWindowPlatform());

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
    <Tooltip
      text={tauriAvailable ? workspaceTooltip : browserModeNotice}
      side={variant === "composer" ? "top" : "bottom"}
    >
      {#snippet trigger(props)}
        <DropdownMenu.Trigger
          class="interactive-control workspace-btn {variant === 'composer'
            ? 'composer-workspace-btn'
            : ''}"
          aria-label={`${$t("currentWorkspace")}: ${workspaceTooltip}`}
          {...props}
        >
          {#if variant === "composer"}
            <svg class="workspace-folder-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2.5 5.25h3.6l1.15 1.4h6.25v5.6a1.25 1.25 0 0 1-1.25 1.25h-8.5a1.25 1.25 0 0 1-1.25-1.25z"
              />
              <path
                d="M2.5 5.5V4.25A1.25 1.25 0 0 1 3.75 3h2.8L7.7 4.4h4.55a1.25 1.25 0 0 1 1.25 1.25v1"
              />
            </svg>
          {/if}
          <span class="folder-name">{folderName}</span>
          {#if workspace?.environment.kind === "wsl"}
            <span class="wsl-badge">WSL</span>
          {/if}
          {#if variant === "composer"}
            <svg class="workspace-caret" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 6l4 4 4-4" />
            </svg>
          {/if}
        </DropdownMenu.Trigger>
      {/snippet}
    </Tooltip>
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        class="desktop-menu-panel ws-dropdown"
        side={variant === "composer" ? "top" : "bottom"}
        sideOffset={variant === "composer" ? 7 : 4}
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenu.Item
          class="desktop-menu-item ws-dropdown-item ws-open-folder"
          onSelect={onPick}
        >
          {$t("openFolder")}
        </DropdownMenu.Item>
        {#if platform === "windows"}
          <DropdownMenu.Item
            class="desktop-menu-item ws-dropdown-item ws-open-folder"
            onSelect={onPickWsl}
          >
            {$t("openWslFolder")}
          </DropdownMenu.Item>
        {/if}
        {#if workspacePath}
          <DropdownMenu.Item
            class="desktop-menu-item ws-dropdown-item"
            disabled={!tauriAvailable}
            onSelect={() => openWorkspaceLocation(workspacePath)}
          >
            {$t("openCurrentWorkspaceLocation")}
          </DropdownMenu.Item>
        {/if}
        {#if otherRecent.length > 0}
          <DropdownMenu.Separator class="desktop-menu-separator ws-dropdown-divider" />
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger
              class="desktop-menu-item ws-dropdown-item ws-recent-trigger"
              textValue={$t("recentWorkspaces")}
            >
              <span class="ws-dropdown-name">{$t("recentWorkspaces")}</span>
              <svg class="ws-submenu-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="m6 4 4 4-4 4" />
              </svg>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                class="desktop-menu-panel ws-dropdown ws-recent-submenu"
                sideOffset={6}
                alignOffset={-6}
              >
                <div class="ws-recent-list">
                  {#each otherRecent as ws (ws.path)}
                    <div class="ws-recent-row">
                      <Tooltip text={ws.path} side="right" block>
                        <DropdownMenu.Item
                          class="desktop-menu-item ws-dropdown-item"
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

  :global(.composer-workspace-btn) {
    max-width: 190px;
    padding: 5px 8px;
    border-radius: 6px;
    color: var(--text-muted);
  }

  .workspace-folder-icon {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .workspace-caret {
    width: 12px;
    height: 12px;
    flex: 0 0 12px;
    color: var(--text-muted);
    transition: transform 0.15s;
  }

  .workspace-caret path {
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  :global(.composer-workspace-btn[data-state="open"] .workspace-caret) {
    transform: rotate(180deg);
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

  :global(.composer-workspace-btn .folder-name) {
    max-width: 128px;
    color: inherit;
    font-size: 12px;
    font-weight: 400;
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
    min-width: 200px;
    max-width: 340px;
    z-index: 201;
  }

  :global(.ws-dropdown-item) {
    transition: background 0.12s;
  }

  :global(.ws-dropdown-item + .ws-dropdown-item),
  .ws-recent-row + .ws-recent-row {
    margin-top: var(--menu-item-stack-gap);
  }

  :global(.ws-recent-trigger) {
    justify-content: space-between;
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
</style>
