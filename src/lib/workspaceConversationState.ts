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

/**
 * Install a fully hydrated active transcript into fresh workspace metadata
 * before the route commits that workspace as visible. Other conversations keep
 * their keyed transcript instances from an earlier visit.
 */
export function prepareWorkspaceConversationSnapshot(
  incoming: Conversation[],
  cached: Conversation[],
  activeConversationId: string | null,
  activeMessages: Conversation["messages"] | null,
): Conversation[] {
  const restored = restoreWorkspaceConversationSnapshot(incoming, cached);
  if (!activeConversationId || !activeMessages) return restored;
  return restored.map((conversation) =>
    conversation.id === activeConversationId
      ? { ...conversation, messages: activeMessages }
      : conversation,
  );
}
