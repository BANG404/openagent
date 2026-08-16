import type { ChatMessage } from "$lib/types";

/**
 * Suggestions belong only to the latest complete turn on the selected branch.
 * A trailing user message means that branch has no completed reply to host them.
 */
export function latestTurnAssistantMessageId(
  messages: Pick<ChatMessage, "id" | "role">[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant") return message.id;
    if (message.role === "user") return null;
  }
  return null;
}
