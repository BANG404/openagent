import type { ChatMemoryRetrievalStage } from "$lib/openagent";
import type { StreamItem } from "$lib/types";

export interface ChatStreamStateMaps {
  itemsByConversation: Record<string, StreamItem[]>;
  assistantMessageIds: Record<string, string>;
  startedAt: Record<string, number>;
  firstTokenAt: Record<string, number>;
  awaitingOutput: Record<string, boolean>;
  memoryRetrievalStages: Record<string, ChatMemoryRetrievalStage>;
  memoryRetrievalSkippable: Record<string, boolean>;
  streamingConversationIds: Record<string, boolean>;
  pausedConversationIds: Record<string, boolean>;
  recoveredConversationIds: Record<string, boolean>;
}

export function clearChatAwaitingOutput(state: ChatStreamStateMaps, conversationId: string): void {
  if (!state.awaitingOutput[conversationId]) return;
  const { [conversationId]: _awaiting, ...rest } = state.awaitingOutput;
  state.awaitingOutput = rest;
}

export function clearChatMemoryRetrieval(state: ChatStreamStateMaps, conversationId: string): void {
  const { [conversationId]: _stage, ...restStages } = state.memoryRetrievalStages;
  const { [conversationId]: _skippable, ...restSkippable } = state.memoryRetrievalSkippable;
  state.memoryRetrievalStages = restStages;
  state.memoryRetrievalSkippable = restSkippable;
}

export function startChatTiming(
  state: ChatStreamStateMaps,
  conversationId: string,
  timestamp: number,
): void {
  clearChatAwaitingOutput(state, conversationId);
  clearChatMemoryRetrieval(state, conversationId);
  state.startedAt = { ...state.startedAt, [conversationId]: timestamp };
  const { [conversationId]: _firstTokenAt, ...rest } = state.firstTokenAt;
  state.firstTokenAt = rest;
}

export function recordChatFirstResponse(
  state: ChatStreamStateMaps,
  conversationId: string,
  timestamp: number,
): void {
  if (state.firstTokenAt[conversationId] !== undefined) return;
  state.firstTokenAt = { ...state.firstTokenAt, [conversationId]: timestamp };
}

export function cleanupChatState(state: ChatStreamStateMaps, conversationId: string): void {
  const { [conversationId]: _items, ...restItems } = state.itemsByConversation;
  const { [conversationId]: _streaming, ...restStreaming } = state.streamingConversationIds;
  const { [conversationId]: _paused, ...restPaused } = state.pausedConversationIds;
  const { [conversationId]: _assistantId, ...restAssistantIds } = state.assistantMessageIds;
  const { [conversationId]: _startedAt, ...restStartedAt } = state.startedAt;
  const { [conversationId]: _firstTokenAt, ...restFirstTokenAt } = state.firstTokenAt;
  const { [conversationId]: _awaiting, ...restAwaiting } = state.awaitingOutput;
  const { [conversationId]: _stage, ...restStages } = state.memoryRetrievalStages;
  const { [conversationId]: _skippable, ...restSkippable } = state.memoryRetrievalSkippable;
  const { [conversationId]: _recovered, ...restRecovered } = state.recoveredConversationIds;
  state.itemsByConversation = restItems;
  state.streamingConversationIds = restStreaming;
  state.pausedConversationIds = restPaused;
  state.assistantMessageIds = restAssistantIds;
  state.startedAt = restStartedAt;
  state.firstTokenAt = restFirstTokenAt;
  state.awaitingOutput = restAwaiting;
  state.memoryRetrievalStages = restStages;
  state.memoryRetrievalSkippable = restSkippable;
  state.recoveredConversationIds = restRecovered;
}
