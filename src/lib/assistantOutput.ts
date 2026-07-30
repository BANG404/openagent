import type { ChatMessage, StreamItem } from "./types";

function isToolInteraction(item: StreamItem): boolean {
  return item.type === "tool_call" || item.type === "user_input";
}

/** Return only the model text emitted after the assistant turn's final tool interaction. */
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

  let finalToolIndex = -1;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (isToolInteraction(items[index])) {
      finalToolIndex = index;
      break;
    }
  }

  return items
    .slice(finalToolIndex + 1)
    .filter((item): item is Extract<StreamItem, { type: "text" }> => item.type === "text")
    .map((item) => item.content)
    .join("")
    .trim();
}
