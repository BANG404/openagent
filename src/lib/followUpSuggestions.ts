import type { ChatMessage, RenderableCheckpoint } from "$lib/types";

function normalizeDurableSuggestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const suggestions = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(
      (item) =>
        item.length > 0 && [...item].length <= 120 && !item.includes("\n") && !item.includes("\r"),
    );
  return suggestions.length === 3 &&
    new Set(suggestions.map((item) => item.toLowerCase())).size === 3
    ? suggestions
    : [];
}

export function durableFollowUpSuggestionsByMessageId(
  checkpoints: Pick<RenderableCheckpoint, "meta" | "follow_up_suggestions">[],
): Record<string, string[]> {
  return Object.fromEntries(
    checkpoints.flatMap((checkpoint) => {
      const suggestions = normalizeDurableSuggestions(checkpoint.follow_up_suggestions);
      if (suggestions.length !== 3) return [];
      try {
        const metadata = JSON.parse(checkpoint.meta.metadata) as {
          turn?: { response_message_id?: unknown };
        };
        const messageId = metadata.turn?.response_message_id;
        return typeof messageId === "string" && messageId
          ? [[messageId, suggestions] as const]
          : [];
      } catch {
        return [];
      }
    }),
  );
}

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
