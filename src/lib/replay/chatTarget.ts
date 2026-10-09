import { OpenAgentClient, type OpenAgentTransport } from "../openagent";
import type { Conversation, ChatMessage } from "../types";
import type { ChatStreamState } from "../chatStreamState.svelte";
import {
  cleanupChatState,
  clearChatAwaitingOutput,
  clearChatMemoryRetrieval,
  recordChatFirstResponse,
  startChatTiming,
} from "../chatStreamStateCore";
import { createCheckpointController, type CheckpointOptions } from "../page/checkpoints";
import { createChatFinalizer, type ChatFinalizationOptions } from "../page/chatFinalization";
import { subscribePageChatEvents, type PageChatEventOptions } from "../page/events/chatEvents";
import { insertProjectedUserMessage, startProjectedStream } from "../page/chatProjection";
import { InterruptTerminalHandoff } from "../interruptResolutionTracker";
import { ReplayError, type Json } from "./types";
import { object, string } from "./validate";
import type { ReplayTarget } from "./runner";
import type { ReplayTransport } from "./transport";
import type { ReplayCase } from "./types";
import { admitChatCase } from "./chatAdmission";

const unsupported = (): never => {
  throw new ReplayError("unsupported", "unrecorded-chat-capability");
};

/** Scoped plain state implements the same facade used by the reactive page. */
function streamState(now: () => number): ChatStreamState {
  return {
    streamingConversationIds: {},
    pausedConversationIds: {},
    itemsByConversation: {},
    assistantMessageIds: {},
    startedAt: {},
    firstTokenAt: {},
    awaitingOutput: {},
    memoryRetrievalStages: {},
    memoryRetrievalSkippable: {},
    recoveredConversationIds: {},
    startTiming(id, timestamp = now()) {
      startChatTiming(this, id, timestamp);
    },
    recordFirstResponse(id) {
      recordChatFirstResponse(this, id, now());
    },
    clearAwaitingOutput(id) {
      clearChatAwaitingOutput(this, id);
    },
    clearMemoryRetrieval(id) {
      clearChatMemoryRetrieval(this, id);
    },
    cleanup(id) {
      cleanupChatState(this, id);
    },
  };
}

/** Drives actual chat event, hydration and finalization controllers offline. */
export const createChatReplayTarget = async (
  initial: Json,
  transport: ReplayTransport,
  fixture: ReplayCase,
  clientTransport: OpenAgentTransport = transport,
): Promise<ReplayTarget> => {
  admitChatCase(fixture);
  const input = object(initial);
  // Prefix/reload and other event families need dedicated target adapters.
  if (!Array.isArray(input.conversations) || !Array.isArray(input.streams)) {
    throw new ReplayError("invalid_case", "chat-initial-state");
  }
  let clock = 1;
  let id = 0;
  const now = () => clock;
  const chatStreams = streamState(now);
  const client = new OpenAgentClient(clientTransport);
  const failures: unknown[] = [];
  const work = new Set<Promise<unknown>>();
  const track = <T>(promise: Promise<T>): Promise<T> => {
    work.add(promise);
    void promise.then(
      () => work.delete(promise),
      (error) => {
        work.delete(promise);
        failures.push(error);
      },
    );
    return promise;
  };
  const drain = async () => {
    // Fixed microtask budget drains released chains, never advances logical time.
    for (let i = 0; i < 64; i += 1) await Promise.resolve();
    if (failures.length) throw new ReplayError("runner_failed", "background-work-failed");
    transport.check();
  };
  const state: CheckpointOptions = {
    conversations: structuredClone(input.conversations) as unknown as Conversation[],
    activeConvId: typeof input.active_conversation === "string" ? input.active_conversation : null,
    chatStreams,
    tauriAvailable: true,
    loadedConvIds: new Set<string>(),
    pendingForkUserMessageIds: {},
    convTrees: {},
    loadingConversationIds: {},
    checkpointLoadErrors: {},
    liveCheckpointRefreshVersions: new Map(),
    branchSelectionVersions: new Map(),
    activeBranchIds: {},
    liveCheckpointFlowProjections: {},
    liveFileChangesPerConv: {},
    fileChangesPerConv: {},
    pendingUserInputs: {},
    checkpointFlowPanelAutoOpenKey: null,
    rightSidebarPanel: "status" as const,
    rightSidebarCollapseRequested: false,
    mergeDurableFollowUpSuggestions: () => {},
    restoreMermaidRenderRequests: () => {},
    refreshTaskUsagesForConversation: async () => {},
    findConversationLocation(convId: string) {
      const index = this.conversations.findIndex((conversation) => conversation.id === convId);
      return index < 0
        ? null
        : { conversations: this.conversations, index, isCurrentWorkspace: true };
    },
  };
  const checkpoints = createCheckpointController(state, client, async () => {});
  const finalization: ChatFinalizationOptions = {
    chatStreams,
    pendingCheckpointIds: {},
    pendingParentCk: {},
    pendingForkMessageId: {},
    pendingForkSourceCheckpointId: {},
    pendingForkUserMessageIds: {},
    get liveFileChangesPerConv() {
      return state.liveFileChangesPerConv;
    },
    now,
    newId: () => `replay-${++id}`,
    interruptedLabel: () => "interrupted",
    notifyInactiveWindowOfAgentCompletion: () => {},
    beginStreamCompletionTailAnchor: () => {},
    loadFileChangesForConv: async () => null,
    reconcileLiveFileChanges: checkpoints.reconcileLiveFileChanges,
    clearPendingForkState: () => {},
    dispatchNextQueuedMessage: async () => {},
    findConversationLocation: (convId) => {
      const location = state.findConversationLocation(convId);
      return location ? { ...location, isCurrentWorkspace: true } : null;
    },
    promoteConversationInRecents: () => {},
    saveAssistantMessage: () => {},
    attachNewTurnToTree: () => {},
    refreshTaskUsagesForConversation: async () => {},
  };
  const finalize = createChatFinalizer(finalization);
  const options: PageChatEventOptions = {
    chatStreams,
    config: null,
    workspacePath: "",
    get pendingUserInputs() {
      return state.pendingUserInputs;
    },
    set pendingUserInputs(value) {
      state.pendingUserInputs = value;
    },
    get activeBranchIds() {
      return state.activeBranchIds;
    },
    set activeBranchIds(value) {
      state.activeBranchIds = value;
    },
    liveContextUsageByConversation: {},
    get liveFileChangesPerConv() {
      return state.liveFileChangesPerConv;
    },
    set liveFileChangesPerConv(value) {
      state.liveFileChangesPerConv = value;
    },
    get pendingCheckpointIds() {
      return finalization.pendingCheckpointIds;
    },
    set pendingCheckpointIds(value) {
      finalization.pendingCheckpointIds = value;
    },
    approvalResumeQueues: new Map(),
    deferredApprovalCheckpointIds: new Map(),
    pendingExternalUserRecoveries: new Set(),
    interruptTerminalHandoffs: new InterruptTerminalHandoff(),
    compactionOnlyConvIds: new Set(),
    compactionProgressRevisions: new Map(),
    followUpSuggestionsByMessageId: {},
    newConversationSuggestions: [],
    applyExternalChatRunStarted: unsupported,
    recoverUnannouncedChatStream: unsupported,
    applyStreamMutation(convId, mutate) {
      chatStreams.itemsByConversation = {
        ...chatStreams.itemsByConversation,
        [convId]: mutate(chatStreams.itemsByConversation[convId] ?? []),
      };
    },
    persistStreamDraft: async () => {},
    attachApprovedToolResult: () => false,
    loadAvailableRoles: unsupported,
    refreshLiveCheckpointTip: (convId, checkpointId, branchId) =>
      track(checkpoints.refreshLiveCheckpointTip(convId, checkpointId, branchId)),
    findConversationLocation: (convId) => {
      const location = state.findConversationLocation(convId);
      return location ? { ...location, isCurrentWorkspace: true } : null;
    },
    loadMessagesForConv: (convId, loading, force) =>
      track(checkpoints.loadMessagesForConv(convId, loading, force)),
    clearLiveFileChanges: checkpoints.clearLiveFileChanges,
    discardPersistedStreamDraft: () => {},
    reconcileCompletedCompaction: unsupported,
    finishCompactionProgress: unsupported,
    finalizeStreamedMessage: finalize,
    normalizeSuggestions: unsupported,
  };
  for (const value of input.streams) {
    const stream = object(value);
    startProjectedStream(chatStreams, string(stream.conversation), string(stream.assistant), now());
  }
  const unsubscribe = await subscribePageChatEvents(options, client);
  return {
    action(name, payload) {
      clock += 1;
      const convId = string(payload.conversation);
      if (name === "hydrate") {
        track(
          checkpoints.loadMessagesForConv(
            convId,
            payload.show_loading === true,
            payload.force_refresh !== false,
          ),
        );
      } else if (name === "insert-user") {
        const message = object(payload.message);
        if (message.role !== "user" || typeof message.content !== "string")
          throw new ReplayError("invalid_case", "user-action");
        string(message.id);
        state.conversations = insertProjectedUserMessage(
          state.conversations,
          convId,
          { ...message, timestamp: now() } as unknown as ChatMessage,
          string(payload.assistant),
          now(),
        );
      } else if (name === "start-stream") {
        startProjectedStream(chatStreams, convId, string(payload.assistant), now());
      } else unsupported();
    },
    drain,
    observe() {
      const conversations = Object.fromEntries(
        state.conversations.map((conversation) => [
          conversation.id,
          {
            message_ids: conversation.messages.map((message) => message.id),
            messages: conversation.messages.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              items: message.items ?? [],
            })),
          },
        ]),
      );
      return JSON.parse(
        JSON.stringify({
          conversations,
          streaming: chatStreams.streamingConversationIds,
          assistant_ids: chatStreams.assistantMessageIds,
          items: chatStreams.itemsByConversation,
          checkpoint_errors: state.checkpointLoadErrors,
        }),
      ) as Json;
    },
    finish(allowedPending) {
      if (work.size && !allowedPending.length)
        throw new ReplayError("runner_failed", "unresolved-target-work");
      if (Object.keys(state.checkpointLoadErrors).length)
        throw new ReplayError("runner_failed", "hydration-failed");
    },
    close: unsubscribe,
  };
};
