import type { ChatMessage, StreamItem } from "../types";
import { appendLiveStreamEntry, type MessageRenderEntry } from "../toolCallGroups";

type Position = NonNullable<NonNullable<ChatMessage["liveSteering"]>["boundary"]>;

function streamEnd(items: StreamItem[]): Position {
  const last = items.at(-1);
  return last?.type === "text" || last?.type === "thinking"
    ? { itemIndex: items.length - 1, textOffset: last.content.length }
    : { itemIndex: items.length };
}

/** A new provider response consumes pending steering after the preceding output. */
export function consumeLiveSteering(
  messages: ChatMessage[],
  assistantMessageId: string | undefined,
  items: StreamItem[],
): ChatMessage[] {
  if (
    !assistantMessageId ||
    !messages.some(
      (message) =>
        message.liveSteering?.assistantMessageId === assistantMessageId &&
        !message.liveSteering.boundary,
    )
  )
    return messages;
  const boundary = streamEnd(items);
  return messages.map((message) =>
    message.liveSteering?.assistantMessageId === assistantMessageId &&
    !message.liveSteering.boundary
      ? { ...message, liveSteering: { ...message.liveSteering, boundary } }
      : message,
  );
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

/** Interleave live output and accepted user rows without persisting partial replies. */
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
  let pending = false;
  for (const entry of entries) {
    const steering = entry.kind === "message" ? entry.msg.liveSteering : undefined;
    if (steering?.assistantMessageId === assistantMessageId) {
      const end = steering.boundary ?? streamEnd(items);
      const segment = streamRange(items, start, end);
      if (segment.length || (!steering.boundary && !pending))
        projected.push({ kind: "live_stream", key, items: segment, settled: !!steering.boundary });
      start = end;
      key = `${assistantMessageId}:after:${entry.key}`;
      pending = !steering.boundary;
    }
    projected.push(entry);
  }
  if (!pending)
    projected.push({
      kind: "live_stream",
      key,
      items: streamRange(items, start, streamEnd(items)),
    });
  return projected;
}
