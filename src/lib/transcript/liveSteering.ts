import type { ChatMessage, StreamItem } from "../types";
import { appendLiveStreamEntry, type MessageRenderEntry } from "../toolCallGroups";

type Position = NonNullable<NonNullable<ChatMessage["liveSteering"]>["boundary"]>;

function streamEnd(items: StreamItem[]): Position {
  const last = items.at(-1);
  return last?.type === "text" || last?.type === "thinking"
    ? { itemIndex: items.length - 1, textOffset: last.content.length }
    : { itemIndex: items.length };
}

/** Only Runtime's durable consumption event can introduce a steering user row. */
export function consumeLiveSteering(
  messages: ChatMessage[],
  message: ChatMessage,
  assistantMessageId: string,
  items: StreamItem[],
): ChatMessage[] {
  if (messages.some((existing) => existing.id === message.id)) return messages;
  return [
    ...messages,
    {
      ...message,
      liveSteering: { assistantMessageId, boundary: streamEnd(items) },
    },
  ];
}

function streamRange(items: StreamItem[], start: Position, end: Position): StreamItem[] {
  return items.slice(start.itemIndex, end.itemIndex + 1).flatMap<StreamItem>((item, offset) => {
    const index = start.itemIndex + offset;
    if (item.type === "text" || item.type === "thinking") {
      const content = item.content.slice(
        index === start.itemIndex ? (start.textOffset ?? 0) : 0,
        index === end.itemIndex ? (end.textOffset ?? 0) : undefined,
      );
      return content ? [{ ...item, content }] : [];
    }
    return index < end.itemIndex ? [item] : [];
  });
}

/** Interleave live output and consumed user rows without persisting partial replies. */
export function projectLiveSteering(
  entries: MessageRenderEntry[],
  assistantMessageId: string | null,
  items: StreamItem[],
): MessageRenderEntry[] {
  if (
    !assistantMessageId ||
    !entries.some(
      (entry) =>
        entry.kind === "message" &&
        entry.msg.liveSteering?.assistantMessageId === assistantMessageId,
    )
  )
    return appendLiveStreamEntry(entries, assistantMessageId);
  const projected: MessageRenderEntry[] = [];
  let start: Position = { itemIndex: 0 };
  let key = assistantMessageId;
  for (const entry of entries) {
    const steering = entry.kind === "message" ? entry.msg.liveSteering : undefined;
    if (steering?.assistantMessageId === assistantMessageId) {
      const end = steering.boundary;
      const segment = streamRange(items, start, end);
      if (segment.length)
        projected.push({ kind: "live_stream", key, items: segment, settled: true });
      start = end;
      key = `${assistantMessageId}:after:${entry.key}`;
    }
    projected.push(entry);
  }
  projected.push({
    kind: "live_stream",
    key,
    items: streamRange(items, start, streamEnd(items)),
  });
  return projected;
}
