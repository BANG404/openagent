import type { ChatAttachment } from "./types";

export interface QueuedChatMessage {
  text: string;
  attachments: ChatAttachment[];
  model: string;
}

export type QueuedChatMessages = Record<string, QueuedChatMessage[]>;

export function enqueueChatMessage(
  queue: QueuedChatMessages,
  convId: string,
  message: QueuedChatMessage,
): QueuedChatMessages {
  return { ...queue, [convId]: [...(queue[convId] ?? []), message] };
}

export function removeQueuedChatMessage(
  queue: QueuedChatMessages,
  convId: string,
  index: number,
): QueuedChatMessages {
  const remaining = (queue[convId] ?? []).filter((_, itemIndex) => itemIndex !== index);
  if (remaining.length > 0) return { ...queue, [convId]: remaining };
  const { [convId]: _, ...rest } = queue;
  return rest;
}

export function clearQueuedChatMessages(
  queue: QueuedChatMessages,
  convId: string,
): QueuedChatMessages {
  if (!(convId in queue)) return queue;
  const { [convId]: _, ...rest } = queue;
  return rest;
}

export function dequeueChatMessage(
  queue: QueuedChatMessages,
  convId: string,
): { next?: QueuedChatMessage; queue: QueuedChatMessages } {
  const [next, ...remaining] = queue[convId] ?? [];
  if (!next) return { queue };
  return {
    next,
    queue:
      remaining.length > 0
        ? { ...queue, [convId]: remaining }
        : clearQueuedChatMessages(queue, convId),
  };
}
