import { fromStore } from "svelte/store";
import type { OpenAgentClient } from "$lib/openagent";
import type { AgentRole, SkillMetadata } from "$lib/types";
import { t } from "$lib/i18n";
import { showToast } from "$lib/toast";

export const DEFAULT_ROLE_KEY = "openagent";

type RoleOptions = {
  available: boolean;
  client: Pick<OpenAgentClient, "invokeProduct">;
  workspacePath: string;
  activateNewConversation: (roleKey: string) => Promise<void>;
};

function uniqueRoles(roles: AgentRole[]): AgentRole[] {
  const seen = new Set<string>();
  return roles.filter((role) => {
    if (seen.has(role.id)) return false;
    seen.add(role.id);
    return true;
  });
}

/** Owns role selection and editor state; conversation activation stays in the page. */
export function createRoleController(options: RoleOptions) {
  const translation = fromStore(t);
  let agentRoles = $state<AgentRole[]>([]);
  let selectedRoleKey = $state(DEFAULT_ROLE_KEY);
  const selectedRoleId = $derived(selectedRoleKey === DEFAULT_ROLE_KEY ? null : selectedRoleKey);
  let roleEditorOpen = $state(false);
  let roleEditorRole = $state<AgentRole | null>(null);
  let roleEditorSkills = $state<SkillMetadata[]>([]);
  let roleEditorResourcesLoading = $state(false);
  let roleEditorSaving = $state(false);

  function roleSelectionStorageKey(currentWorkspace = options.workspacePath): string {
    return `openagent.active-role:${currentWorkspace || "global"}`;
  }

  function storedRoleSelection(currentWorkspace = options.workspacePath): string {
    if (typeof window === "undefined") return DEFAULT_ROLE_KEY;
    return (
      window.localStorage.getItem(roleSelectionStorageKey(currentWorkspace)) || DEFAULT_ROLE_KEY
    );
  }

  async function loadAvailableRoles(): Promise<void> {
    if (!options.available) {
      agentRoles = [];
      selectedRoleKey = DEFAULT_ROLE_KEY;
      return;
    }
    agentRoles = uniqueRoles(
      await options.client.invokeProduct("list_agent_roles", {}).catch(() => []),
    );
    if (
      selectedRoleKey !== DEFAULT_ROLE_KEY &&
      !agentRoles.some((role) => role.id === selectedRoleKey)
    ) {
      selectedRoleKey = DEFAULT_ROLE_KEY;
    }
  }

  async function loadAvailableRolesForWorkspace(path: string): Promise<AgentRole[]> {
    if (!options.available) return [];
    const roles = await options.client
      .invokeProduct("list_agent_roles_for_workspace", { workspace: path })
      .catch(() => []);
    return uniqueRoles(roles);
  }

  async function openRoleEditor(role: AgentRole | null): Promise<void> {
    roleEditorRole = role;
    roleEditorOpen = true;
    roleEditorResourcesLoading = true;
    try {
      roleEditorSkills = options.available
        ? ((await options.client
            .invokeProduct("list_skills", {})
            .catch(() => [])) as SkillMetadata[])
        : [];
    } finally {
      roleEditorResourcesLoading = false;
    }
  }

  async function saveRoleEditor(draft: {
    id: string | null;
    name: string;
    description: string;
    skillIds: string[];
    mcpServerIds: string[];
  }): Promise<void> {
    roleEditorSaving = true;
    try {
      const saved = await options.client.invokeProduct("save_agent_role", draft);
      await loadAvailableRoles();
      roleEditorOpen = false;
      if (!draft.id) await options.activateNewConversation(saved.id);
      showToast({ title: translation.current("roleSaved"), variant: "success" });
    } catch (error) {
      showToast({
        title: translation.current("settingsSaveFailed"),
        description: String(error),
        variant: "error",
      });
    } finally {
      roleEditorSaving = false;
    }
  }

  async function deleteRoleEditor(role: AgentRole): Promise<void> {
    const message = translation.current("deleteRoleConfirm").replace("{name}", role.name);
    if (!confirm(message)) return;
    roleEditorSaving = true;
    try {
      await options.client.invokeProduct("delete_agent_role", { id: role.id });
      roleEditorOpen = false;
      await loadAvailableRoles();
      if (selectedRoleKey === role.id) await options.activateNewConversation(DEFAULT_ROLE_KEY);
    } catch (error) {
      showToast({
        title: translation.current("settingsSaveFailed"),
        description: String(error),
        variant: "error",
      });
    } finally {
      roleEditorSaving = false;
    }
  }

  async function changeConversationRole(roleKey: string): Promise<void> {
    if (roleKey === selectedRoleKey) return;
    await options.activateNewConversation(roleKey);
  }

  return {
    get agentRoles() {
      return agentRoles;
    },
    set agentRoles(value: AgentRole[]) {
      agentRoles = value;
    },
    get selectedRoleKey() {
      return selectedRoleKey;
    },
    set selectedRoleKey(value: string) {
      selectedRoleKey = value;
    },
    get selectedRoleId() {
      return selectedRoleId;
    },
    get roleEditorOpen() {
      return roleEditorOpen;
    },
    set roleEditorOpen(value: boolean) {
      roleEditorOpen = value;
    },
    get roleEditorRole() {
      return roleEditorRole;
    },
    get roleEditorSkills() {
      return roleEditorSkills;
    },
    get roleEditorResourcesLoading() {
      return roleEditorResourcesLoading;
    },
    get roleEditorSaving() {
      return roleEditorSaving;
    },
    roleSelectionStorageKey,
    storedRoleSelection,
    loadAvailableRoles,
    loadAvailableRolesForWorkspace,
    openRoleEditor,
    saveRoleEditor,
    deleteRoleEditor,
    changeConversationRole,
  };
}
