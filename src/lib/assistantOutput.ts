import type { ChatMessage, StreamItem } from "./types";

function isToolInteraction(item: StreamItem): boolean {
  return item.type === "tool_call" || item.type === "user_input";
}

/** Return only the model text emitted after the assistant turn's final tool interaction. */
export function finalAssistantOutput(message: ChatMessage): string {
  if (message.role !== "assistant") return "";
  if (!message.items?.length) return message.content.trim();

  let finalToolIndex = -1;
  for (let index = message.items.length - 1; index >= 0; index -= 1) {
    if (isToolInteraction(message.items[index])) {
      finalToolIndex = index;
      break;
    }
  }

  return message.items
    .slice(finalToolIndex + 1)
    .filter((item): item is Extract<StreamItem, { type: "text" }> => item.type === "text")
    .map((item) => item.content)
    .join("")
    .trim();
}
