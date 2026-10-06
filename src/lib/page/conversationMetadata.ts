import type { Conversation } from "$lib/types";

export function mergeConversationMetadata(
  current: Conversation[],
  incoming: Conversation[],
): Conversation[] {
  const incomingById = new Map(incoming.map((conversation) => [conversation.id, conversation]));
  const merged = current.map((conversation) => {
    const replacement = incomingById.get(conversation.id);
    if (!replacement) return conversation;
    incomingById.delete(conversation.id);
    return { ...replacement, messages: conversation.messages };
  });
  return [...merged, ...incomingById.values()];
}
