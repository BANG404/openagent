<script lang="ts">
  import { invoke } from "$lib/openagent/tauriClient";
  import { DropdownMenu } from "bits-ui";
  import type { WorkspaceContext, RecentWorkspace } from "$lib/types";
  import { t } from "$lib/i18n";
  import { workspaceFolderName } from "$lib/workspacePath";
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

  function handleOpenWorkspaceLocation(event: Event, path: string) {
    event.preventDefault();
    event.stopPropagation();
    void openWorkspaceLocation(path);
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
        <svg
          class="ws-chevron"
          class:open
          viewBox="0 0 10 6"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M1 1l4 4 4-4" />
        </svg>
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
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M2 13V5.5L6.5 3H14v10H2zM2 5.5h4.5V3" />
          </svg>
          {$t("openFolder")}
        </DropdownMenu.Item>
        <DropdownMenu.Item class="ws-dropdown-item ws-open-folder" onSelect={onPickWsl}>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 3.5 7 8l-4 4.5M8.5 12.5H13" />
          </svg>
          {$t("openWslFolder")}
        </DropdownMenu.Item>
        {#if workspacePath}
          <DropdownMenu.Item
            class="ws-dropdown-item"
            disabled={!tauriAvailable}
            onSelect={() => openWorkspaceLocation(workspacePath)}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M2.5 4.5h4l1.25 1.5h5.75v7.5h-11z" />
              <path d="M10 3h3v3M13 3 9 7" />
            </svg>
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
                          <svg
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path d="M2 13V5.5L6.5 3H14v10H2zM2 5.5h4.5V3" />
                          </svg>
                          <span class="ws-dropdown-name">{ws.name}</span>
                        </DropdownMenu.Item>
                      </Tooltip>
                      <Tooltip text={$t("openFileLocation")} side="right">
                        <button
                          class="ws-location-btn"
                          type="button"
                          aria-label={$t("openFileLocation")}
                          onclick={(event) => handleOpenWorkspaceLocation(event, ws.path)}
                        >
                          <svg
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path d="M2.5 4.5h4l1.25 1.5h5.75v7.5h-11z" />
                            <path d="M10 3h3v3M13 3 9 7" />
                          </svg>
                        </button>
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

  .ws-chevron {
    width: 10px;
    height: 10px;
    color: var(--text-muted);
    flex-shrink: 0;
    transition: transform 0.15s;
  }

  .ws-chevron.open {
    transform: rotate(180deg);
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
    display: grid;
    grid-template-columns: minmax(0, 1fr) 30px;
    align-items: center;
  }

  .ws-recent-list {
    max-height: min(240px, calc(100vh - 160px));
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  :global(.ws-recent-submenu) {
    min-width: 240px;
    max-width: min(340px, calc(100vw - 24px));
  }

  .ws-recent-row :global(.ws-dropdown-item) {
    min-width: 0;
  }

  :global(.ws-location-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    outline: none;
  }

  :global(.ws-location-btn:hover),
  :global(.ws-location-btn:focus-visible) {
    background: var(--bg);
    color: var(--text);
  }

  :global(.ws-location-btn:focus-visible) {
    box-shadow: var(--focus-ring);
  }

  :global(.ws-location-btn svg) {
    width: 14px;
    height: 14px;
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

  :global(.ws-dropdown-item svg) {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .ws-dropdown-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.ws-dropdown-divider) {
    height: 1px;
    background: var(--border);
    margin: var(--menu-separator-margin);
  }
</style>
