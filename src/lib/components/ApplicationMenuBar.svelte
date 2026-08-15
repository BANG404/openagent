<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import { t } from "$lib/i18n";
  import type { RecentWorkspace } from "$lib/types";
  import { isWslWorkspacePath } from "$lib/workspacePath";

  let {
    recentWorkspaces,
    workspacePath,
    onNewConversation,
    onPickWorkspace,
    onPickWsl,
    onSelectWorkspace,
    onOpenWorkspaceLocation,
    onOpenMemory,
    onOpenRoles,
    onOpenSkills,
    onOpenSettings,
    onOpenAbout,
  }: {
    recentWorkspaces: RecentWorkspace[];
    workspacePath: string;
    onNewConversation: () => void;
    onPickWorkspace: () => void;
    onPickWsl: () => void;
    onSelectWorkspace: (path: string) => void;
    onOpenWorkspaceLocation: () => void;
    onOpenMemory: () => void;
    onOpenRoles: () => void;
    onOpenSkills: () => void;
    onOpenSettings: () => void;
    onOpenAbout: () => void;
  } = $props();

  let otherRecent = $derived(recentWorkspaces.filter((item) => item.path !== workspacePath));
</script>

<nav class="application-menu-bar" aria-label="Application menu">
  <DropdownMenu.Root>
    <DropdownMenu.Trigger class="application-menu-trigger">{$t("fileMenu")}</DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content class="application-menu-content" sideOffset={2} align="start">
        <DropdownMenu.Item class="application-menu-item" onSelect={onNewConversation}
          >{$t("newChat")}</DropdownMenu.Item
        >
        <DropdownMenu.Separator class="application-menu-separator" />
        <DropdownMenu.Item class="application-menu-item" onSelect={onPickWorkspace}
          >{$t("openFolder")}</DropdownMenu.Item
        >
        <DropdownMenu.Item class="application-menu-item" onSelect={onPickWsl}
          >{$t("openWslFolder")}</DropdownMenu.Item
        >
        {#if workspacePath}
          <DropdownMenu.Item class="application-menu-item" onSelect={onOpenWorkspaceLocation}
            >{$t("openCurrentWorkspaceLocation")}</DropdownMenu.Item
          >
        {/if}
        {#if otherRecent.length > 0}
          <DropdownMenu.Separator class="application-menu-separator" />
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger class="application-menu-item application-submenu-trigger">
              <span>{$t("recentWorkspaces")}</span>
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg
              >
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                class="application-menu-content application-recent-menu"
                sideOffset={5}
                alignOffset={-5}
              >
                {#each otherRecent as item (item.path)}
                  <DropdownMenu.Item
                    class="application-menu-item application-workspace-item"
                    onSelect={() => onSelectWorkspace(item.path)}
                  >
                    {#if isWslWorkspacePath(item.path)}<span class="application-wsl-badge">WSL</span
                      >{/if}
                    <span>{item.path}</span>
                  </DropdownMenu.Item>
                {/each}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>

  <DropdownMenu.Root>
    <DropdownMenu.Trigger class="application-menu-trigger">{$t("editMenu")}</DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content class="application-menu-content" sideOffset={2} align="start">
        <DropdownMenu.Item class="application-menu-item" onSelect={onOpenSettings}
          >{$t("settings")}</DropdownMenu.Item
        >
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>

  <DropdownMenu.Root>
    <DropdownMenu.Trigger class="application-menu-trigger">{$t("viewMenu")}</DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content class="application-menu-content" sideOffset={2} align="start">
        <DropdownMenu.Item class="application-menu-item" onSelect={onOpenMemory}
          >{$t("memory")}</DropdownMenu.Item
        >
        <DropdownMenu.Item class="application-menu-item" onSelect={onOpenRoles}
          >{$t("roles")}</DropdownMenu.Item
        >
        <DropdownMenu.Item class="application-menu-item" onSelect={onOpenSkills}
          >{$t("skills")}</DropdownMenu.Item
        >
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>

  <DropdownMenu.Root>
    <DropdownMenu.Trigger class="application-menu-trigger">{$t("helpMenu")}</DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content class="application-menu-content" sideOffset={2} align="start">
        <DropdownMenu.Item class="application-menu-item" onSelect={onOpenAbout}
          >{$t("about")}</DropdownMenu.Item
        >
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
</nav>

<style>
  .application-menu-bar {
    display: flex;
    align-items: center;
    gap: 1px;
    height: 100%;
  }

  :global(.application-menu-trigger) {
    height: 28px;
    padding: 0 9px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 12px;
    line-height: 28px;
    cursor: default;
    outline: none;
  }

  :global(.application-menu-trigger:hover),
  :global(.application-menu-trigger:focus-visible),
  :global(.application-menu-trigger[data-state="open"]) {
    background: var(--surface2);
    color: var(--text);
  }

  :global(.application-menu-trigger:focus-visible) {
    box-shadow: var(--focus-ring);
  }

  :global(.application-menu-content) {
    min-width: 210px;
    max-width: min(460px, calc(100vw - 24px));
    z-index: 240;
    padding: var(--menu-content-padding);
    border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    border-radius: var(--menu-content-radius);
    background: var(--control-surface);
    box-shadow: var(--raised-shadow);
    outline: none;
  }

  :global(.application-menu-item) {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--menu-item-gap);
    min-height: var(--menu-item-min-height);
    box-sizing: border-box;
    padding: var(--menu-item-padding-block) var(--menu-item-padding-inline);
    border-radius: var(--menu-item-radius);
    color: var(--text);
    font-size: var(--menu-item-font-size);
    line-height: var(--menu-item-line-height);
    cursor: default;
    outline: none;
  }

  :global(.application-menu-item + .application-menu-item) {
    margin-top: var(--menu-item-stack-gap);
  }

  :global(.application-menu-item[data-highlighted]),
  :global(.application-menu-item:hover) {
    background: var(--bg);
  }

  :global(.application-submenu-trigger) {
    justify-content: space-between;
  }

  :global(.application-submenu-trigger svg) {
    width: 12px;
    height: 12px;
    color: var(--text-muted);
  }

  :global(.application-submenu-trigger path) {
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  :global(.application-menu-separator) {
    height: 1px;
    margin: var(--menu-separator-margin);
    background: var(--border);
  }

  :global(.application-recent-menu) {
    max-height: min(320px, calc(100vh - 96px));
    overflow-y: auto;
  }

  :global(.application-workspace-item) {
    min-width: 0;
  }

  :global(.application-workspace-item > span:last-child) {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .application-wsl-badge {
    flex: 0 0 auto;
    padding: 1px 4px;
    border: 1px solid color-mix(in srgb, var(--primary) 42%, transparent);
    border-radius: 4px;
    color: var(--primary);
    font-size: 9px;
    font-weight: 700;
  }
</style>
