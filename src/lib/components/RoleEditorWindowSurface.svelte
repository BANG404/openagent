<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { applyDocumentTheme, createNativeThemeSynchronizer } from "$lib/appTheme";
  import { normalizeConfigShape } from "$lib/config";
  import { setLocale, t, type Locale } from "$lib/i18n";
  import { emit, invoke, listen } from "$lib/openagent/tauriClient";
  import {
    parseRoleEditorRequest,
    type AgentRolesChangedEvent,
    type RoleEditorRequest,
  } from "$lib/roleEditorWindow";
  import type { AgentRole, AppConfig, SkillMetadata } from "$lib/types";
  import RoleEditorDialog from "./RoleEditorDialog.svelte";

  type RoleDraft = {
    id: string | null;
    scope: "global" | "local";
    name: string;
    description: string;
    skillIds: string[];
    mcpServerIds: string[];
  };

  let request = $state<RoleEditorRequest>(
    parseRoleEditorRequest(new URLSearchParams(window.location.search)),
  );
  let role = $state<AgentRole | null>(null);
  let config = $state<AppConfig | null>(null);
  let skills = $state<SkillMetadata[]>([]);
  let loadingResources = $state(true);
  let saving = $state(false);
  let loadError = $state("");
  const appWindow = getCurrentWindow();
  const synchronizeNativeTheme = createNativeThemeSynchronizer({
    applyWebTheme: applyDocumentTheme,
    setNativeTheme: (theme) => appWindow.setTheme(theme),
    onResolvedTheme: () => {},
    afterNativeThemeChange: () => new Promise((resolve) => setTimeout(resolve, 0)),
    onError: (error) => console.warn("Failed to synchronize role editor theme:", error),
  });

  function applyConfig(next: AppConfig): void {
    config = structuredClone(normalizeConfigShape(next));
    setLocale((config.language ?? "zh") as Locale);
    void synchronizeNativeTheme(config.theme ?? "system");
  }

  async function loadRole(nextRequest = request): Promise<void> {
    request = nextRequest;
    role = null;
    loadingResources = true;
    loadError = "";
    try {
      const [nextConfig, nextSkills, localRoles, globalRoles] = await Promise.all([
        invoke<AppConfig>("get_settings"),
        invoke<SkillMetadata[]>("list_skills").catch(() => []),
        invoke<AgentRole[]>("list_agent_roles", { scope: "local" }).catch(() => []),
        invoke<AgentRole[]>("list_agent_roles", { scope: "global" }).catch(() => []),
      ]);
      applyConfig(nextConfig);
      skills = nextSkills;
      role = nextRequest.roleId
        ? ([...localRoles, ...globalRoles].find((item) => item.id === nextRequest.roleId) ?? null)
        : null;
      if (nextRequest.roleId && !role) loadError = $t("roleNotFound");
      await appWindow.setTitle(nextRequest.roleId ? $t("editRole") : $t("newRole"));
    } catch (error) {
      loadError = String(error);
    } finally {
      loadingResources = false;
    }
  }

  async function notifyRoleChange(
    roleId: string | null,
    created: boolean,
    deleted: boolean,
  ): Promise<void> {
    const payload: AgentRolesChangedEvent = { ...request, roleId, created, deleted };
    await emit("agent-roles-changed", payload);
  }

  async function saveRole(draft: RoleDraft): Promise<void> {
    saving = true;
    try {
      const saved = await invoke<AgentRole>("save_agent_role", {
        id: draft.id,
        scope: draft.scope,
        name: draft.name,
        description: draft.description,
        skillIds: draft.skillIds,
        mcpServerIds: draft.mcpServerIds,
      });
      await notifyRoleChange(saved.id, draft.id === null, false);
      await appWindow.close();
    } catch (error) {
      loadError = String(error);
    } finally {
      saving = false;
    }
  }

  async function deleteRole(target: AgentRole): Promise<void> {
    if (!confirm($t("deleteRoleConfirm").replace("{name}", target.name))) return;
    saving = true;
    try {
      await invoke("delete_agent_role", { id: target.id });
      await notifyRoleChange(target.id, false, true);
      await appWindow.close();
    } catch (error) {
      loadError = String(error);
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    let disposed = false;
    let stopRequests: (() => void) | undefined;
    let stopSettings: (() => void) | undefined;
    void loadRole();
    void listen<RoleEditorRequest>("role-editor-requested", (event) => {
      if (!disposed) void loadRole(event.payload);
    }).then((stop) => (disposed ? stop() : (stopRequests = stop)));
    void listen("settings-changed", () => {
      if (!disposed) {
        void invoke<AppConfig>("get_settings")
          .then(applyConfig)
          .catch((error) => (loadError = String(error)));
      }
    }).then((stop) => (disposed ? stop() : (stopSettings = stop)));
    return () => {
      disposed = true;
      stopRequests?.();
      stopSettings?.();
    };
  });
</script>

{#if config && (!request.roleId || role)}
  <RoleEditorDialog
    open
    {role}
    {skills}
    mcpServers={config.mcp.servers}
    {loadingResources}
    {saving}
    presentation="window"
    onClose={() => appWindow.close()}
    onSave={saveRole}
    onDelete={deleteRole}
  />
{:else}
  <main class="role-editor-loading">
    <p role={loadError ? "alert" : "status"}>{loadError || $t("loadingContent")}</p>
  </main>
{/if}

{#if loadError && config}<p class="role-editor-error" role="alert">{loadError}</p>{/if}

<style>
  .role-editor-loading {
    width: 100vw;
    height: 100vh;
    display: grid;
    place-items: center;
    background: var(--bg);
    color: var(--text-muted);
    font-size: 12px;
  }

  .role-editor-error {
    position: fixed;
    right: 18px;
    bottom: 58px;
    z-index: 2;
    max-width: min(520px, calc(100vw - 36px));
    margin: 0;
    color: var(--danger);
    font-size: 12px;
  }
</style>
