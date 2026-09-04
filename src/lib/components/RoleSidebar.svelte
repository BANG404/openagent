<script lang="ts">
  import type { AgentRole } from "$lib/types";
  import { t } from "$lib/i18n";
  import Tooltip from "./Tooltip.svelte";

  let {
    roles,
    selectedRoleKey,
    settingsOpen,
    windowFocused,
    onRoleChange,
    onCreateRole,
    onEditRole,
    onOpenSettings,
  }: {
    roles: AgentRole[];
    selectedRoleKey: string;
    settingsOpen: boolean;
    windowFocused: boolean;
    onRoleChange: (roleKey: string) => void | Promise<void>;
    onCreateRole: () => void;
    onEditRole: (role: AgentRole) => void;
    onOpenSettings: () => void | Promise<void>;
  } = $props();

  const defaultRoleKey = "openagent";
  let selectedRole = $derived(roles.find((role) => role.id === selectedRoleKey) ?? null);

  function roleInitial(name: string): string {
    return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
  }
</script>

<aside class="role-sidebar" class:window-inactive={!windowFocused} aria-label={$t("rolesTitle")}>
  <div class="role-sidebar-drag" data-tauri-drag-region></div>
  <nav class="role-list" aria-label={$t("selectRole")}>
    <Tooltip text={$t("defaultRoleName")} side="right">
      <button
        class="role-button default-role"
        class:selected={selectedRoleKey === defaultRoleKey}
        type="button"
        aria-label={$t("defaultRoleName")}
        aria-current={selectedRoleKey === defaultRoleKey ? "page" : undefined}
        onclick={() => void onRoleChange(defaultRoleKey)}
      >
        <img src="/app-icon.png" alt="" draggable="false" />
      </button>
    </Tooltip>
    {#each roles as role (role.id)}
      <Tooltip text={role.name} side="right">
        <button
          class="role-button"
          class:selected={selectedRoleKey === role.id}
          type="button"
          aria-label={role.name}
          aria-current={selectedRoleKey === role.id ? "page" : undefined}
          onclick={() => void onRoleChange(role.id)}
          ondblclick={() => onEditRole(role)}
        >
          <span aria-hidden="true">{roleInitial(role.name)}</span>
        </button>
      </Tooltip>
    {/each}
  </nav>

  <div class="role-actions">
    <Tooltip text={$t("newRole")} side="right">
      <button type="button" aria-label={$t("newRole")} onclick={onCreateRole}>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
      </button>
    </Tooltip>
    <Tooltip text={$t("editRole")} side="right">
      <button
        type="button"
        aria-label={$t("editRole")}
        disabled={!selectedRole}
        onclick={() => selectedRole && onEditRole(selectedRole)}
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m3 11.8-.5 2 2-.5 7.7-7.7-1.5-1.5zM9.7 5.1l1.5 1.5" />
        </svg>
      </button>
    </Tooltip>
    <span class="role-action-separator"></span>
    <Tooltip text={$t("settings")} side="right">
      <button
        class:active={settingsOpen}
        type="button"
        aria-label={$t("settings")}
        onclick={() => void onOpenSettings()}
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="2.4" />
          <path
            d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"
          />
        </svg>
      </button>
    </Tooltip>
  </div>
</aside>

<style>
  .role-sidebar {
    width: var(--role-sidebar-width);
    flex: 0 0 var(--role-sidebar-width);
    min-height: 0;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    background: var(--sidebar-bg);
    color: var(--text);
    user-select: none;
    transition: opacity 120ms ease;
  }

  .role-sidebar.window-inactive {
    opacity: 0.55;
  }

  .role-sidebar-drag {
    height: var(--desktop-titlebar-height);
    flex: 0 0 var(--desktop-titlebar-height);
  }

  .role-list {
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    padding: 8px 7px;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .role-button,
  .role-actions button {
    position: relative;
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    outline: none;
  }

  .role-button:hover,
  .role-button:focus-visible,
  .role-button.selected,
  .role-actions button:hover:not(:disabled),
  .role-actions button:focus-visible,
  .role-actions button.active {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  .role-button.selected::after {
    position: absolute;
    left: -7px;
    width: 2px;
    height: 18px;
    border-radius: 0 2px 2px 0;
    background: var(--primary);
    content: "";
  }

  .role-button:focus-visible,
  .role-actions button:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .default-role img {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }

  .role-actions {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 7px;
  }

  .role-actions button {
    height: 32px;
    flex-basis: 32px;
  }

  .role-actions button:disabled {
    cursor: default;
    opacity: 0.34;
  }

  .role-actions svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .role-action-separator {
    width: 26px;
    height: 1px;
    margin: 3px 0;
    background: var(--mica-divider);
  }

  @media (prefers-reduced-motion: reduce) {
    .role-sidebar {
      transition: none;
    }
  }
</style>
