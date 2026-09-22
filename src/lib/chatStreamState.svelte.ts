import type { ChatMemoryRetrievalStage } from "$lib/openagent";
import type { StreamItem } from "$lib/types";
import {
  cleanupChatState,
  clearChatAwaitingOutput,
  clearChatMemoryRetrieval,
  recordChatFirstResponse,
  startChatTiming,
} from "$lib/chatStreamStateCore";

export class ChatStreamState {
  streamingConversationIds = $state<Record<string, boolean>>({});
  pausedConversationIds = $state<Record<string, boolean>>({});
  itemsByConversation = $state<Record<string, StreamItem[]>>({});
  assistantMessageIds = $state<Record<string, string>>({});
  startedAt = $state<Record<string, number>>({});
  firstTokenAt = $state<Record<string, number>>({});
  awaitingOutput = $state<Record<string, boolean>>({});
  memoryRetrievalStages = $state<Record<string, ChatMemoryRetrievalStage>>({});
  memoryRetrievalSkippable = $state<Record<string, boolean>>({});
  recoveredConversationIds = $state<Record<string, boolean>>({});

  startTiming(conversationId: string, timestamp = Date.now()): void {
    startChatTiming(this, conversationId, timestamp);
  }

  recordFirstResponse(conversationId: string): void {
    recordChatFirstResponse(this, conversationId, Date.now());
  }

  clearAwaitingOutput(conversationId: string): void {
    clearChatAwaitingOutput(this, conversationId);
  }

  clearMemoryRetrieval(conversationId: string): void {
    clearChatMemoryRetrieval(this, conversationId);
  }

  cleanup(conversationId: string): void {
    cleanupChatState(this, conversationId);
  }
}
