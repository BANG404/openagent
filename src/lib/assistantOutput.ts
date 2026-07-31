import type { ChatMessage, StreamItem } from "./types";

/**
 * Return the first item in the trailing, uninterrupted final-text run.
 *
 * Everything before this boundary is process output: reasoning, tool
 * interactions, notices, and any narration that preceded those records.
 */
export function finalAssistantOutputStartIndex(items: StreamItem[]): number {
  let index = items.length;
  while (index > 0 && items[index - 1].type === "text") index -= 1;
  return index;
}

/** Return only the trailing final-text run from an assistant turn. */
export function finalAssistantOutput(messageOrMessages: ChatMessage | ChatMessage[]): string {
  const messages = Array.isArray(messageOrMessages) ? messageOrMessages : [messageOrMessages];
  const assistantMessages = messages.filter((message) => message.role === "assistant");
  const items = assistantMessages.flatMap((message) =>
    message.items?.length
      ? message.items
      : message.content
        ? [{ type: "text" as const, content: message.content }]
        : [],
  );
  if (items.length === 0) return "";

  return items
    .slice(finalAssistantOutputStartIndex(items))
    .filter((item): item is Extract<StreamItem, { type: "text" }> => item.type === "text")
    .map((item) => item.content)
    .join("")
    .trim();
}
