import type { ChatMessage, StreamItem } from "./types";

const FINAL_OUTPUT_TOOL_NAMES = new Set(["render_html", "render_mermaid", "update_goal"]);

export function isFinalOutputTool(item: StreamItem): boolean {
  return item.type === "tool_call" && FINAL_OUTPUT_TOOL_NAMES.has(item.name);
}

function belongsToFinalOutput(item: StreamItem): boolean {
  return item.type === "text" || isFinalOutputTool(item);
}

/**
 * Return the first item in the trailing final-output run.
 *
 * Render previews and Goal state updates are presentation effects, so they stay
 * with adjacent final text instead of making the process disclosure absorb it.
 * Everything before this boundary is process output: reasoning, ordinary tool
 * interactions, notices, and any narration that preceded those records.
 */
export function finalAssistantOutputStartIndex(items: StreamItem[]): number {
  let index = items.length;
  while (index > 0 && belongsToFinalOutput(items[index - 1])) index -= 1;
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
