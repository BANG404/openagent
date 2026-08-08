<script lang="ts">
  import { invoke } from "$lib/openagent/tauriClient";
  import { onMount } from "svelte";
  import LoadingSkeleton from "./LoadingSkeleton.svelte";
  import ScopeToggle from "./ScopeToggle.svelte";
  import WindowControls from "./WindowControls.svelte";
  import { t } from "$lib/i18n";
  import { resolveListSelection } from "$lib/listSelection";
  import type { AgentRole, WorkspaceContext } from "$lib/types";

  let {
    workspace,
    winMinimize,
    winMaximize,
    winClose,
    onRolesChanged,
  }: {
    workspace: WorkspaceContext | null;
    winMinimize: () => void;
    winMaximize: () => void;
    winClose: () => void;
    onRolesChanged?: () => void;
  } = $props();

  type RoleScope = "global" | "local";

  let activeScope = $state<RoleScope>("global");
  let roles = $state<AgentRole[]>([]);
  let selectedRole = $state<AgentRole | null>(null);
  let editingNew = $state(false);
  let name = $state("");
  let description = $state("");
  let query = $state("");
  let loading = $state(true);
  let saving = $state(false);
  let error = $state("");
  let saveMessage = $state("");

  let visibleRoles = $derived.by(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return roles;
    return roles.filter((role) =>
      `${role.name}\n${role.description}`.toLocaleLowerCase().includes(normalized),
    );
  });

  onMount(() => {
    void loadRoles();
  });

  async function loadRoles() {
    loading = true;
    error = "";
    try {
      roles = await invoke<AgentRole[]>("list_agent_roles", { scope: activeScope });
      if (!editingNew) selectRole(resolveListSelection(roles, selectedRole, (role) => role.id));
    } catch (cause) {
      roles = [];
      selectedRole = null;
      error = String(cause);
    } finally {
      loading = false;
    }
  }

  function switchScope(scope: RoleScope) {
    if (scope === activeScope || (scope === "local" && !workspace?.path)) return;
    activeScope = scope;
    selectedRole = null;
    editingNew = false;
    name = "";
    description = "";
    query = "";
    saveMessage = "";
    void loadRoles();
  }

  function selectRole(role: AgentRole | null) {
    selectedRole = role;
    editingNew = false;
    name = role?.name ?? "";
    description = role?.description ?? "";
    saveMessage = "";
  }

  function startNewRole() {
    selectedRole = null;
    editingNew = true;
    name = "";
    description = "";
    saveMessage = "";
  }

  async function saveRole() {
    if (!name.trim() || !description.trim() || saving) return;
    saving = true;
    saveMessage = "";
    try {
      const saved = await invoke<AgentRole>("save_agent_role", {
        id: selectedRole?.id ?? null,
        scope: activeScope,
        name: name.trim(),
        description: description.trim(),
      });
      const existingIndex = roles.findIndex((role) => role.id === saved.id);
      roles =
        existingIndex >= 0
          ? roles.map((role) => (role.id === saved.id ? saved : role))
          : [saved, ...roles];
      selectedRole = saved;
      editingNew = false;
      name = saved.name;
      description = saved.description;
      saveMessage = $t("roleSaved");
      onRolesChanged?.();
    } catch (cause) {
      saveMessage = String(cause);
    } finally {
      saving = false;
    }
  }

  async function deleteRole(role: AgentRole) {
    const message = $t("deleteRoleConfirm").replace("{name}", role.name);
    if (!confirm(message)) return;
    try {
      await invoke("delete_agent_role", { id: role.id });
      roles = roles.filter((item) => item.id !== role.id);
      if (selectedRole?.id === role.id) {
        selectRole(resolveListSelection(roles, null, (item) => item.id));
      }
      onRolesChanged?.();
    } catch (cause) {
      alert(String(cause));
    }
  }

  function usageLabel(count: number) {
    return $t("roleUsageCount").replace("{count}", String(count));
  }

  function lastUsedLabel(timestamp: number) {
    if (!timestamp) return $t("roleNeverUsed");
    const date = new Date(timestamp * 1000).toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return $t("roleLastUsed").replace("{date}", date);
  }
</script>

<div class="roles-panel">
  <header class="roles-header" data-tauri-drag-region>
    <div class="header-leading">
      <span class="roles-header-title">{$t("rolesTitle")}</span>
      <ScopeToggle
        value={activeScope}
        projectEnabled={Boolean(workspace?.path)}
        onChange={switchScope}
      />
    </div>
    <WindowControls onMinimize={winMinimize} onMaximize={winMaximize} onClose={winClose} />
  </header>

  <div class="roles-body">
    <aside class="role-list-column">
      <div class="role-search-wrap">
        <label class="search-box">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input bind:value={query} placeholder={$t("roleSearchPlaceholder")} />
        </label>
      </div>

      <div class="role-list">
        {#if loading}
          <LoadingSkeleton variant="detail-list" rows={5} label={$t("loadingContent")} />
        {:else if error}
          <div class="list-empty">
            <p>{error}</p>
            <button class="text-button" onclick={loadRoles}>{$t("retry")}</button>
          </div>
        {:else if visibleRoles.length === 0}
          <div class="list-empty">
            <p>{query ? $t("noMatchingRoles") : $t("noRoles")}</p>
            {#if !query}<span>{$t("noRolesHint")}</span>{/if}
          </div>
        {:else}
          {#each visibleRoles as role (role.id)}
            <button
              class="role-item"
              class:active={selectedRole?.id === role.id}
              onclick={() => selectRole(role)}
            >
              <span class="role-item-copy">
                <strong>{role.name}</strong>
                <small>{role.description}</small>
              </span>
            </button>
          {/each}
        {/if}
      </div>

      <div class="role-list-footer">
        <button class="new-role-button" onclick={startNewRole}>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          >
            <path d="M8 3v10M3 8h10" />
          </svg>
          {$t("newRole")}
        </button>
      </div>
    </aside>

    <main class="role-editor">
      {#if selectedRole || editingNew}
        <div class="editor-topbar">
          <span>{editingNew ? $t("newRole") : $t("editRole")}</span>
          {#if selectedRole}
            <div class="role-meta">
              <span>{usageLabel(selectedRole.usage_count)}</span>
              <span>·</span>
              <span>{lastUsedLabel(selectedRole.last_used_at)}</span>
            </div>
          {/if}
        </div>

        <div class="editor-form">
          <div class="form-field">
            <label for="role-name">{$t("roleName")}</label>
            <input
              id="role-name"
              bind:value={name}
              maxlength="120"
              placeholder={$t("roleNamePlaceholder")}
            />
          </div>
          <div class="form-field description-field">
            <label for="role-description">{$t("roleDescription")}</label>
            <textarea
              id="role-description"
              bind:value={description}
              placeholder={$t("roleDescriptionPlaceholder")}></textarea>
            <p>{$t("roleDescriptionHint")}</p>
          </div>

          <div class="editor-actions">
            {#if selectedRole}
              <button class="delete-button" onclick={() => deleteRole(selectedRole!)}>
                {$t("deleteRole")}
              </button>
            {/if}
            <span class:save-error={saveMessage && saveMessage !== $t("roleSaved")}
              >{saveMessage}</span
            >
            <button
              class="save-button"
              disabled={!name.trim() || !description.trim() || saving}
              onclick={saveRole}
            >
              {saving ? $t("savingRole") : $t("save")}
            </button>
          </div>
        </div>
      {:else}
        <div class="editor-placeholder">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="7" r="3.5" />
            <path d="M5.5 20c.5-4 2.6-6 6.5-6s6 2 6.5 6" />
          </svg>
          <p>{$t("selectRoleToEdit")}</p>
          <span>{$t("rolesSubtitle")}</span>
        </div>
      {/if}
    </main>
  </div>
</div>

<style>
  .roles-panel {
    flex: 1;
    min-width: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
  }

  .roles-header {
    height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    flex-shrink: 0;
  }

  .header-leading {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .roles-header-title {
    font-size: 14px;
    font-weight: 600;
  }

  .roles-body {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }

  .role-list-column {
    width: 260px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    flex-shrink: 0;
  }

  .role-search-wrap {
    padding: 9px 8px 7px;
  }

  .search-box {
    height: 30px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 9px;
    border: 0;
    border-radius: 7px;
    background: var(--surface2);
    box-shadow: var(--control-shadow);
  }

  .search-box:focus-within {
    box-shadow: var(--control-shadow), var(--focus-ring);
  }

  .search-box svg {
    width: 13px;
    height: 13px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .search-box input {
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12px;
  }

  .role-list {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--list-item-stack-gap);
    padding: 0 8px 8px;
    overflow-y: auto;
  }

  .role-item {
    width: 100%;
    display: flex;
    align-items: flex-start;
    padding: 9px;
    position: relative;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }

  .role-item:hover {
    background: var(--surface2);
  }

  .role-item.active {
    background: var(--surface2);
  }

  .role-item.active::before {
    content: "";
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 0;
    width: 2px;
    background: var(--primary);
    pointer-events: none;
  }

  .role-item-copy {
    min-width: 0;
    flex: 1;
  }

  .role-item-copy strong,
  .role-item-copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .role-item-copy strong {
    margin-top: 1px;
    font-size: 13px;
    font-weight: 500;
  }

  .role-item-copy small {
    margin-top: 3px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .list-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 12px;
    color: var(--text-muted);
    text-align: center;
  }

  .list-empty p {
    margin: 0;
    font-size: 13px;
  }

  .list-empty span {
    margin-top: 6px;
    font-size: 11px;
    line-height: 1.5;
  }

  .text-button {
    margin-top: 10px;
    border: 0;
    background: transparent;
    color: var(--primary);
    cursor: pointer;
  }

  .role-list-footer {
    padding: 8px;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }

  .new-role-button,
  .save-button,
  .delete-button {
    height: 30px;
    border-radius: 7px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .new-role-button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid transparent;
    background: var(--primary);
    color: white;
  }

  .new-role-button:hover,
  .save-button:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  .new-role-button svg {
    width: 13px;
    height: 13px;
  }

  .role-editor {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor-topbar {
    height: 36px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .role-meta {
    display: flex;
    gap: 6px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 400;
  }

  .editor-form {
    width: min(720px, calc(100% - 48px));
    height: 100%;
    margin: 0 auto;
    padding: 32px 0 24px;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  .form-field {
    margin-bottom: 20px;
  }

  .form-field label {
    display: block;
    margin-bottom: 7px;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
  }

  .form-field input,
  .form-field textarea {
    width: 100%;
    box-sizing: border-box;
    border: 0;
    border-radius: 8px;
    outline: none;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    box-shadow: var(--control-shadow);
  }

  .form-field input {
    height: 36px;
    padding: 0 11px;
  }

  .form-field textarea {
    min-height: 240px;
    height: 100%;
    padding: 11px;
    resize: none;
    line-height: 1.55;
  }

  .form-field input:focus,
  .form-field textarea:focus {
    box-shadow: var(--control-shadow), var(--focus-ring);
  }

  .description-field {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .description-field p {
    margin: 7px 0 0;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.45;
  }

  .editor-actions {
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .editor-actions span {
    flex: 1;
    color: var(--text-muted);
    font-size: 11px;
    text-align: right;
  }

  .editor-actions span.save-error {
    color: var(--danger, #d92d20);
  }

  .save-button {
    min-width: 72px;
    padding: 0 14px;
    border: 0;
    background: var(--primary);
    color: white;
  }

  .save-button:disabled {
    cursor: default;
    opacity: 0.5;
  }

  .delete-button {
    padding: 0 11px;
    border: 1px solid color-mix(in srgb, var(--danger, #d92d20) 35%, var(--border));
    background: transparent;
    color: var(--danger, #d92d20);
  }

  .delete-button:hover {
    background: color-mix(in srgb, var(--danger, #d92d20) 8%, transparent);
  }

  .editor-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    text-align: center;
  }

  .editor-placeholder svg {
    width: 34px;
    height: 34px;
    margin-bottom: 12px;
    opacity: 0.35;
  }

  .editor-placeholder p {
    margin: 0;
    color: var(--text);
    font-size: 13px;
  }

  .editor-placeholder span {
    margin-top: 6px;
    font-size: 11px;
  }

  @media (max-width: 700px) {
    .role-list-column {
      width: 220px;
    }

    .editor-form {
      width: calc(100% - 28px);
      padding-top: 22px;
    }
  }
</style>
