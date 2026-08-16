import type { ChatMessage } from "$lib/types";

/**
 * Suggestions belong only to the latest complete turn on the selected branch.
 * A trailing user message means that branch has no completed reply to host them.
 * Tool rounds may append several assistant records, so prefer the Turn-owned
 * response ID over the final assistant record's ID.
 */
export function latestTurnSuggestionHostMessageId(
  messages: Pick<ChatMessage, "id" | "role" | "timestamp" | "turn">[],
): string | null {
  let fallbackAssistantMessageId: string | null = null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant") {
      fallbackAssistantMessageId ??= message.id;
      if (message.turn?.response_message_id) return message.turn.response_message_id;
      continue;
    }
    if (message.role === "user" && message.timestamp !== 0) {
      return fallbackAssistantMessageId;
    }
  }
  return fallbackAssistantMessageId;
}
