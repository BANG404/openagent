import type { ChatMessage, ConversationUi, StreamItem } from "./types";

export function mergeConversationUiStream(
  visible: ChatMessage[],
  durable: ChatMessage[],
  items: StreamItem[],
  conversationId: string,
  branchId: string | null,
): StreamItem[] {
  const visibleIds = new Set(visible.map((message) => message.id));
  const merged = [...items];
  for (const message of durable) {
    if (message.role !== "ui" || !message.ui || visibleIds.has(message.id)) continue;
    const item: StreamItem = {
      type: "ui",
      ui: message.ui,
      messageId: message.id,
      conversationId,
      branchId,
    };
    const index = merged.findIndex(
      (previous) => previous.type === "ui" && previous.messageId === message.id,
    );
    if (index >= 0) merged[index] = item;
    else if (
      message.ui.component === "builtin.divider" &&
      message.ui.props.label_key === "compactionCompleted"
    ) {
      const boundaryIndex = merged.findIndex((previous) => previous.type === "compaction_boundary");
      if (boundaryIndex >= 0) merged[boundaryIndex] = item;
      else merged.push(item);
    } else merged.push(item);
  }
  return merged;
}

/** Apply authoritative UI slots without replacing optimistic chat records. */
export function mergeConversationUiMessages(
  visible: ChatMessage[],
  durable: ChatMessage[],
): ChatMessage[] {
  const merged = visible.filter((message) => message.role !== "ui");
  for (let index = 0; index < durable.length; index += 1) {
    const message = durable[index];
    if (message.role !== "ui") continue;
    const following = durable
      .slice(index + 1)
      .find((next) => merged.some((item) => item.id === next.id));
    const preceding = durable
      .slice(0, index)
      .findLast((previous) => merged.some((item) => item.id === previous.id));
    const position = following
      ? merged.findIndex((item) => item.id === following.id)
      : preceding
        ? merged.findIndex((item) => item.id === preceding.id) + 1
        : merged.length;
    merged.splice(position, 0, message);
  }
  return merged;
}

export function conversationUiFromContent(
  content: Array<Record<string, unknown>>,
): ConversationUi | undefined {
  const part = content.find((part) => part.type === "ui");
  const ui = part?.ui;
  if (!ui || typeof ui !== "object" || Array.isArray(ui)) return undefined;
  const value = ui as Record<string, unknown>;
  if (
    typeof value.version !== "number" ||
    typeof value.component !== "string" ||
    typeof value.fallback !== "string" ||
    !value.props ||
    typeof value.props !== "object" ||
    Array.isArray(value.props)
  )
    return undefined;
  return value as unknown as ConversationUi;
}

export function conversationUiFrameDocument(content: string): string {
  // An opaque-origin document receives only its persisted props. No ambient
  // network, parent DOM, storage, forms, popups, or host credentials.
  const policy =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"></head><body>${content}</body></html>`;
}
