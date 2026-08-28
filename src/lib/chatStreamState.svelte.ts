import type { ChatMemoryRetrievalStage } from "$lib/openagent";
import type { StreamItem } from "$lib/types";

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

  startTiming(conversationId: string, timestamp = Date.now()): void {
    this.clearAwaitingOutput(conversationId);
    this.clearMemoryRetrieval(conversationId);
    this.startedAt = { ...this.startedAt, [conversationId]: timestamp };
    const { [conversationId]: _firstTokenAt, ...rest } = this.firstTokenAt;
    this.firstTokenAt = rest;
  }

  recordFirstResponse(conversationId: string): void {
    if (this.firstTokenAt[conversationId]) return;
    this.firstTokenAt = { ...this.firstTokenAt, [conversationId]: Date.now() };
  }

  clearAwaitingOutput(conversationId: string): void {
    if (!this.awaitingOutput[conversationId]) return;
    const { [conversationId]: _awaiting, ...rest } = this.awaitingOutput;
    this.awaitingOutput = rest;
  }

  clearMemoryRetrieval(conversationId: string): void {
    const { [conversationId]: _stage, ...restStages } = this.memoryRetrievalStages;
    const { [conversationId]: _skippable, ...restSkippable } = this.memoryRetrievalSkippable;
    this.memoryRetrievalStages = restStages;
    this.memoryRetrievalSkippable = restSkippable;
  }

  cleanup(conversationId: string): void {
    const { [conversationId]: _items, ...restItems } = this.itemsByConversation;
    const { [conversationId]: _streaming, ...restStreaming } = this.streamingConversationIds;
    const { [conversationId]: _paused, ...restPaused } = this.pausedConversationIds;
    const { [conversationId]: _assistantId, ...restAssistantIds } = this.assistantMessageIds;
    const { [conversationId]: _startedAt, ...restStartedAt } = this.startedAt;
    const { [conversationId]: _firstTokenAt, ...restFirstTokenAt } = this.firstTokenAt;
    const { [conversationId]: _awaiting, ...restAwaiting } = this.awaitingOutput;
    const { [conversationId]: _stage, ...restStages } = this.memoryRetrievalStages;
    const { [conversationId]: _skippable, ...restSkippable } = this.memoryRetrievalSkippable;
    this.itemsByConversation = restItems;
    this.streamingConversationIds = restStreaming;
    this.pausedConversationIds = restPaused;
    this.assistantMessageIds = restAssistantIds;
    this.startedAt = restStartedAt;
    this.firstTokenAt = restFirstTokenAt;
    this.awaitingOutput = restAwaiting;
    this.memoryRetrievalStages = restStages;
    this.memoryRetrievalSkippable = restSkippable;
  }
}
