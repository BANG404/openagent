import { normalizeExternalLinkUrl } from "./streamdown/externalLink";

/** A sidebar can call only its owning package, in the host's current workspace. */
export interface SidebarToolRequest {
  type: "openagent:sidebar-tool-call";
  version: 1;
  request_id: string;
  scope: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}

export function sidebarLinkUrl(data: unknown, scope: string): string | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  if (
    value.type !== "openagent:sidebar-open-link" ||
    value.version !== 1 ||
    value.scope !== scope ||
    typeof value.url !== "string" ||
    value.url.length > 4096
  )
    return null;
  return normalizeExternalLinkUrl(value.url);
}

export function sidebarToolRequest(data: unknown, scope: string): SidebarToolRequest | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  if (
    value.type !== "openagent:sidebar-tool-call" ||
    value.version !== 1 ||
    value.scope !== scope ||
    typeof value.request_id !== "string" ||
    !value.request_id.length ||
    value.request_id.length > 128 ||
    typeof value.tool_name !== "string" ||
    !/^[\w.-]{1,128}$/.test(value.tool_name) ||
    !value.arguments ||
    typeof value.arguments !== "object" ||
    Array.isArray(value.arguments)
  )
    return null;
  try {
    if (new TextEncoder().encode(JSON.stringify(value.arguments)).length > 65536) return null;
  } catch {
    return null;
  }
  return value as unknown as SidebarToolRequest;
}

export function sidebarToolArguments(
  args: Record<string, unknown>,
  workspace: string,
  locale: string,
): Record<string, unknown> {
  const result = { ...args };
  delete result._openagent;
  delete result.workspace;
  // Sidebar submissions are user messages. Conversation/branch IDs remain
  // display context and cannot impersonate an Agent sender through this bridge.
  return { ...result, _openagent: { workspace, locale, conversation_id: "", branch_id: "" } };
}
