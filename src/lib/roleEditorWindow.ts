import { invoke } from "$lib/openagent/tauriClient";

export interface RoleEditorRequest {
  roleId: string | null;
  requesterLabel: string;
}

export interface AgentRolesChangedEvent extends RoleEditorRequest {
  created: boolean;
  deleted: boolean;
}

export function parseRoleEditorRequest(search: URLSearchParams): RoleEditorRequest {
  return {
    roleId: search.get("role-id") || null,
    requesterLabel: search.get("requester-label") ?? "main",
  };
}

export function openRoleEditorWindow(roleId?: string): Promise<void> {
  return invoke("open_role_editor_window", { roleId });
}
