import type { ChatMessage, CheckpointTurnStatus, StreamItem } from "./types";
import { isRenderTool } from "./assistantOutput";

export type ToolCallItem = Extract<StreamItem, { type: "tool_call" }>;

export type StreamItemSegment =
  | { kind: "item"; item: StreamItem; startIndex: number }
  | { kind: "tool_group"; items: ToolCallItem[]; startIndex: number };

export type StoredMessageRenderEntry =
  | { kind: "message"; msg: ChatMessage; index: number; key: string }
  | {
      kind: "tool_group";
      items: ToolCallItem[];
      messages: ChatMessage[];
      index: number;
      key: string;
    };

export type MessageRenderEntry =
  | StoredMessageRenderEntry
  | { kind: "live_stream"; key: string }
  | {
      kind: "assistant_turn";
      messages: ChatMessage[];
      finalIndex: number;
      key: string;
    };

export function isAssistantTurnEntry(entry: MessageRenderEntry): boolean {
  return (
    entry.kind === "live_stream" ||
    entry.kind === "assistant_turn" ||
    (entry.kind === "message" && entry.msg.role === "assistant")
  );
}

export function isGroupableToolCall(item: StreamItem): item is ToolCallItem {
  return item.type === "tool_call" && !isRenderTool(item) && item.approval === undefined;
}

export function groupStreamItems(items: StreamItem[]): StreamItemSegment[] {
  const segments: StreamItemSegment[] = [];
  for (let index = 0; index < items.length;) {
    const item = items[index];
    if (item.type === "tool_call" && toolCallStatus(item, false) === "failed") {
      index += 1;
      continue;
    }
    if (!isGroupableToolCall(item)) {
      segments.push({ kind: "item", item, startIndex: index });
      index += 1;
      continue;
    }

    const calls: ToolCallItem[] = [];
    let end = index;
    while (end < items.length) {
      const next = items[end];
      if (next.type === "tool_call" && toolCallStatus(next, false) === "failed") {
        end += 1;
        continue;
      }
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

export function partitionAssistantSegments(
  segments: StreamItemSegment[],
  turnStatus: CheckpointTurnStatus,
): {
  processSegments: StreamItemSegment[];
  finalSegments: StreamItemSegment[];
} {
  if (turnStatus !== "completed") {
    // Keep the live/interrupted sequence in one render lane. The completed
    // transition may move process records into disclosure, while trailing rich
    // output stays keyed at the same final-render location.
    return { processSegments: [], finalSegments: segments };
  }
  const firstRenderIndex = segments.find(
    (segment) => segment.kind === "item" && isRenderTool(segment.item),
  )?.startIndex;
  const lastProcessBoundaryIndex = segments.findLast(
    (segment) =>
      (firstRenderIndex === undefined || segment.startIndex < firstRenderIndex) &&
      (segment.kind === "tool_group" ||
        (segment.kind === "item" &&
          ((segment.item.type === "tool_call" && !isRenderTool(segment.item)) ||
            segment.item.type === "user_input"))),
  )?.startIndex;
  const processSegments: StreamItemSegment[] = [];
  const finalSegments: StreamItemSegment[] = [];
  for (const segment of segments) {
    if (firstRenderIndex !== undefined && segment.startIndex >= firstRenderIndex) {
      finalSegments.push(segment);
    } else if (
      segment.kind === "item" &&
      segment.item.type === "text" &&
      (lastProcessBoundaryIndex === undefined || segment.startIndex > lastProcessBoundaryIndex)
    ) {
      finalSegments.push(segment);
    } else {
      processSegments.push(segment);
    }
  }
  return { processSegments, finalSegments };
}

function standaloneGroupableToolCall(message: ChatMessage): ToolCallItem | null {
  if (message.role !== "assistant" || message.items?.length !== 1) return null;
  const item = message.items[0];
  return isGroupableToolCall(item) ? item : null;
}

export function groupMessageToolCalls(
  messages: Array<{ msg: ChatMessage; index: number }>,
): StoredMessageRenderEntry[] {
  const entries: StoredMessageRenderEntry[] = [];
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

function assistantMessages(entry: StoredMessageRenderEntry): ChatMessage[] | null {
  if (entry.kind === "tool_group") return entry.messages;
  return entry.msg.role === "assistant" ? [entry.msg] : null;
}

function isCompactionContinuation(entry: StoredMessageRenderEntry): boolean {
  return (
    entry.kind === "message" &&
    entry.msg.role === "user" &&
    entry.msg.tags?.includes("context_compaction") === true
  );
}

/**
 * Collapse every durable assistant record in one reply into a single
 * transcript row. A compaction replay is an internal continuation boundary, not a
 * new user turn, so keep it inside the reply that resumes after compaction.
 */
export function groupAssistantTurns(entries: StoredMessageRenderEntry[]): MessageRenderEntry[] {
  const grouped: MessageRenderEntry[] = [];
  for (let position = 0; position < entries.length;) {
    const firstMessages = assistantMessages(entries[position]);
    if (!firstMessages) {
      grouped.push(entries[position]);
      position += 1;
      continue;
    }

    const messages: ChatMessage[] = [];
    let finalIndex = entries[position].index;
    let end = position;
    while (end < entries.length) {
      const nextEntry = entries[end];
      const nextMessages = assistantMessages(nextEntry);
      if (nextMessages) {
        messages.push(...nextMessages);
        finalIndex =
          nextEntry.kind === "tool_group"
            ? nextEntry.index + nextEntry.messages.length - 1
            : nextEntry.index;
        end += 1;
        continue;
      }

      if (isCompactionContinuation(nextEntry)) {
        let continuationEnd = end;
        while (
          continuationEnd < entries.length &&
          isCompactionContinuation(entries[continuationEnd])
        ) {
          continuationEnd += 1;
        }
        if (continuationEnd < entries.length && assistantMessages(entries[continuationEnd])) {
          for (let index = end; index < continuationEnd; index += 1) {
            const boundary = entries[index];
            if (boundary.kind === "message") messages.push(boundary.msg);
          }
          end = continuationEnd;
          continue;
        }
      }

      break;
    }

    const finalAssistantMessage = messages.findLast((message) => message.role === "assistant")!;
    const turn = messages.find((message) => message.turn)?.turn;
    grouped.push({
      kind: "assistant_turn",
      messages,
      finalIndex,
      key: turn?.response_message_id ?? finalAssistantMessage.id,
    });
    position = end;
  }
  return grouped;
}

export function appendLiveStreamEntry(
  entries: MessageRenderEntry[],
  streamMessageId: string | null,
): MessageRenderEntry[] {
  return streamMessageId ? [...entries, { kind: "live_stream", key: streamMessageId }] : entries;
}

export type ToolCallStatus =
  "waiting" | "running" | "success" | "failed" | "unanswered" | "cancelled";

const UNANSWERED_TOOL_RESULT = /\bwas not approved because the user continued the conversation\b/i;
const CANCELLED_TOOL_RESULT =
  /\b(?:was denied by the user|command denied by the user|did not complete because the chat run was cancelled|did not run because the chat was cancelled during approval)\b/i;

export function isUnansweredToolResult(result: string): boolean {
  return UNANSWERED_TOOL_RESULT.test(result.trim());
}

export function toolCallStatus(item: ToolCallItem, showRunning: boolean): ToolCallStatus {
  if (item.result === undefined) return showRunning ? "running" : "waiting";
  const text = item.result.trim();
  if (isUnansweredToolResult(text)) return "unanswered";
  if (CANCELLED_TOOL_RESULT.test(text)) return "cancelled";
  if (/^(error|failed|failure)\b\s*:?\s*/i.test(text)) return "failed";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      if (record.cancelled === true) return "cancelled";
      if (record.ok === false || record.success === false || record.error) return "failed";
    }
  } catch {
    // Plain-text tool output is a successful result unless it starts with a
    // conventional error marker handled above.
  }
  return "success";
}

export function shouldDisplayToolCall(item: ToolCallItem, showRunning: boolean): boolean {
  const status = toolCallStatus(item, showRunning);
  if (status === "failed") return false;
  const isRenderPreview = item.name === "render_html" || item.name === "render_mermaid";
  return !isRenderPreview || status === "success";
}
