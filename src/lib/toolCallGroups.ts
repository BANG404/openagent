import type { ChatMessage, StreamItem } from "./types";

export type ToolCallItem = Extract<StreamItem, { type: "tool_call" }>;

export type StreamItemSegment =
  | { kind: "item"; item: StreamItem; startIndex: number }
  | { kind: "tool_group"; items: ToolCallItem[]; startIndex: number };

export type MessageRenderEntry =
  | { kind: "message"; msg: ChatMessage; index: number; key: string }
  | { kind: "live_stream"; key: string }
  | {
      kind: "tool_group";
      items: ToolCallItem[];
      messages: ChatMessage[];
      index: number;
      key: string;
    };

export function isAssistantTurnEntry(
  entry: MessageRenderEntry,
): boolean {
  return entry.kind === "live_stream"
    || (entry.kind === "message" && entry.msg.role === "assistant");
}

export function isGroupableToolCall(item: StreamItem): item is ToolCallItem {
  return item.type === "tool_call"
    && item.name !== "render_html"
    && item.name !== "render_mermaid"
    && item.approval === undefined;
}

export function groupStreamItems(items: StreamItem[]): StreamItemSegment[] {
  const segments: StreamItemSegment[] = [];
  for (let index = 0; index < items.length;) {
    const item = items[index];
    if (!isGroupableToolCall(item)) {
      segments.push({ kind: "item", item, startIndex: index });
      index += 1;
      continue;
    }

    const calls: ToolCallItem[] = [];
    let end = index;
    while (end < items.length) {
      const next = items[end];
      if (!isGroupableToolCall(next)) break;
      calls.push(next);
      end += 1;
    }
    if (calls.length > 1) {
      segments.push({ kind: "tool_group", items: calls, startIndex: index });
    } else {
      segments.push({ kind: "item", item, startIndex: index });
    }
    index = end;
  }
  return segments;
}

function standaloneGroupableToolCall(
  message: ChatMessage,
): ToolCallItem | null {
  if (message.role !== "assistant" || message.items?.length !== 1) return null;
  const item = message.items[0];
  return isGroupableToolCall(item) ? item : null;
}

export function groupMessageToolCalls(
  messages: Array<{ msg: ChatMessage; index: number }>,
): MessageRenderEntry[] {
  const entries: MessageRenderEntry[] = [];
  for (let position = 0; position < messages.length;) {
    const current = messages[position];
    const firstCall = standaloneGroupableToolCall(current.msg);
    if (!firstCall) {
      entries.push({
        kind: "message",
        msg: current.msg,
        index: current.index,
        key: current.msg.id,
      });
      position += 1;
      continue;
    }

    const calls: ToolCallItem[] = [];
    const sourceMessages: ChatMessage[] = [];
    let end = position;
    while (end < messages.length) {
      const next = messages[end];
      const call = standaloneGroupableToolCall(next.msg);
      if (!call) break;
      calls.push(call);
      sourceMessages.push(next.msg);
      end += 1;
    }
    if (calls.length > 1) {
      entries.push({
        kind: "tool_group",
        items: calls,
        messages: sourceMessages,
        index: current.index,
        key: `tool-group-${sourceMessages.map((message) => message.id).join("-")}`,
      });
    } else {
      entries.push({
        kind: "message",
        msg: current.msg,
        index: current.index,
        key: current.msg.id,
      });
    }
    position = end;
  }
  return entries;
}

export function appendLiveStreamEntry(
  entries: MessageRenderEntry[],
  streamMessageId: string | null,
): MessageRenderEntry[] {
  return streamMessageId
    ? [...entries, { kind: "live_stream", key: streamMessageId }]
    : entries;
}

export type ToolCallStatus = "pending" | "running" | "success" | "failed";

export function toolCallStatus(
  item: ToolCallItem,
  showRunning: boolean,
): ToolCallStatus {
  if (item.result === undefined) return showRunning ? "running" : "pending";
  const text = item.result.trim();
  if (/^(error|failed|failure)\b\s*:?\s*/i.test(text)) return "failed";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      if (record.ok === false || record.success === false || record.error) return "failed";
    }
  } catch {
    // Plain-text tool output is a successful result unless it starts with a
    // conventional error marker handled above.
  }
  return "success";
}
