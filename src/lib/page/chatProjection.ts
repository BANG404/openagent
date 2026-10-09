import type { ChatMessage, Conversation } from "../types";
import type { ChatStreamState } from "../chatStreamState.svelte";
import { initializeStreamItems } from "../chatStream";
import { observeFrontendAction } from "../replay/captureObservation";

export function insertProjectedUserMessage(
  conversations: Conversation[],
  convId: string,
  userMessage: ChatMessage,
  assistantMessageId: string,
  now: number,
): Conversation[] {
  const index = conversations.findIndex((conversation) => conversation.id === convId);
  if (
    index === -1 ||
    conversations[index].messages.some((message) => message.id === userMessage.id)
  ) {
    return conversations;
  }
  const existing = conversations[index];
  observeFrontendAction({
    action: "insert-user",
    conversation: convId,
    assistant: assistantMessageId,
    message: userMessage,
  });
  const assistantIndex = existing.messages.findIndex(
    (message) => message.id === assistantMessageId,
  );
  const messages = [...existing.messages];
  messages.splice(assistantIndex === -1 ? messages.length : assistantIndex, 0, userMessage);
  const next = [...conversations];
  next[index] = { ...existing, messages, updatedAt: now };
  return next;
}

export function startProjectedStream(
  streams: ChatStreamState,
  convId: string,
  assistantMessageId: string,
  startedAt: number,
): void {
  observeFrontendAction({
    action: "start-stream",
    conversation: convId,
    assistant: assistantMessageId,
  });
  if (streams.recoveredConversationIds[convId]) {
    const { [convId]: _recovered, ...rest } = streams.recoveredConversationIds;
    streams.recoveredConversationIds = rest;
  }
  const sameRun =
    streams.streamingConversationIds[convId] &&
    streams.assistantMessageIds[convId] === assistantMessageId;
  if (!sameRun) {
    streams.itemsByConversation = {
      ...streams.itemsByConversation,
      [convId]: initializeStreamItems(streams.itemsByConversation[convId]),
    };
    streams.assistantMessageIds = { ...streams.assistantMessageIds, [convId]: assistantMessageId };
    streams.startTiming(convId, startedAt);
  }
  streams.streamingConversationIds = { ...streams.streamingConversationIds, [convId]: true };
  streams.awaitingOutput = { ...streams.awaitingOutput, [convId]: true };
}
