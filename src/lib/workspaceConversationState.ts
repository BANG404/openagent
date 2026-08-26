import type { Conversation } from "./types";

/**
 * Apply fresh workspace metadata without discarding transcript state retained
 * from an earlier visit to that workspace.
 */
export function restoreWorkspaceConversationSnapshot(
  incoming: Conversation[],
  cached: Conversation[],
): Conversation[] {
  const cachedById = new Map(cached.map((conversation) => [conversation.id, conversation]));
  return incoming.map((conversation) => {
    const previous = cachedById.get(conversation.id);
    return previous ? { ...conversation, messages: previous.messages } : conversation;
  });
}
