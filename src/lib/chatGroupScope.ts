import type { ChatMessage, StreamItem, ToolCallRecord } from "./types";

export interface ChatGroupScope {
  invoked: boolean;
  groupIds: string[];
}

function parseObject(value: string | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function groupIdFromCall(name: string, args: string, result?: string): string | null {
  const parsedArgs = parseObject(args);
  const argGroupId = parsedArgs?.group_id ?? parsedArgs?.groupId;
  if (typeof argGroupId === "string" && argGroupId.trim()) return argGroupId;

  // Create and start have no group_id argument; their durable results identify
  // the newly created group at different nesting levels.
  if (name === "chat_group_create" || name === "chat_group_start") {
    const created = parseObject(result);
    const group = name === "chat_group_start" ? created?.group : created;
    if (group && typeof group === "object" && !Array.isArray(group)) {
      const id = (group as Record<string, unknown>).id;
      return typeof id === "string" && id.trim() ? id : null;
    }
  }
  return null;
}

function collectToolCall(
  call: Pick<ToolCallRecord, "name" | "args" | "result">,
  ids: Set<string>,
): boolean {
  if (!call.name.startsWith("chat_group_")) return false;
  const groupId = groupIdFromCall(call.name, call.args, call.result);
  if (groupId) ids.add(groupId);
  return true;
}

function collectStreamItem(item: StreamItem, ids: Set<string>): boolean {
  return item.type === "tool_call" ? collectToolCall(item, ids) : false;
}

/**
 * Returns only the groups referenced by the selected conversation branch.
 * Tool calls and their persisted results are both inspected so create calls
 * become selectable as soon as their result is reconciled.
 */
export function chatGroupScope(
  messages: readonly ChatMessage[],
  streamItems: readonly StreamItem[] = [],
): ChatGroupScope {
  const ids = new Set<string>();
  let invoked = false;
  for (const message of messages) {
    for (const item of message.items ?? []) invoked = collectStreamItem(item, ids) || invoked;
    for (const call of message.toolCalls ?? []) invoked = collectToolCall(call, ids) || invoked;
  }
  for (const item of streamItems) invoked = collectStreamItem(item, ids) || invoked;
  return { invoked, groupIds: [...ids] };
}
