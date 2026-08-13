import type { ChatMessage, StreamItem } from "./types";

const RENDER_TOOL_NAMES = new Set(["render_html", "render_mermaid"]);

export function isRenderTool(item: StreamItem): boolean {
  return item.type === "tool_call" && RENDER_TOOL_NAMES.has(item.name);
}

/**
 * Return the first item in the final-output run.
 *
 * A render preview is a presentation boundary: it and every later record stay
 * visible outside the process disclosure. Without a render, only the trailing
 * uninterrupted text run is final output.
 */
export function finalAssistantOutputStartIndex(items: StreamItem[]): number {
  const renderIndex = items.findIndex(isRenderTool);
  if (renderIndex >= 0) return renderIndex;

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
