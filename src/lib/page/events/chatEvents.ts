import { desktopOpenAgent as openAgent } from "$lib/openagent/tauriClient";
import {
  appendChunk,
  appendCompactionProgress,
  appendThinkingChunk,
  appendToolCall,
  appendUserInput,
  completeCompactionProgress,
  attachToolResult,
} from "$lib/chatStream";
import type { PageEventOptions } from "./context";
import type { OpenAgentClient } from "$lib/openagent";

export type PageChatEventOptions = Pick<
  PageEventOptions,
  | "activeBranchIds"
  | "applyExternalChatRunStarted"
  | "applyStreamMutation"
  | "approvalResumeQueues"
  | "attachApprovedToolResult"
  | "chatStreams"
  | "clearLiveFileChanges"
  | "compactionOnlyConvIds"
  | "compactionProgressRevisions"
  | "config"
  | "deferredApprovalCheckpointIds"
  | "discardPersistedStreamDraft"
  | "finalizeStreamedMessage"
  | "findConversationLocation"
  | "finishCompactionProgress"
  | "followUpSuggestionsByMessageId"
  | "interruptTerminalHandoffs"
  | "liveContextUsageByConversation"
  | "liveFileChangesPerConv"
  | "loadAvailableRoles"
  | "loadMessagesForConv"
  | "newConversationSuggestions"
  | "normalizeSuggestions"
  | "pendingCheckpointIds"
  | "pendingExternalUserRecoveries"
  | "pendingUserInputs"
  | "persistStreamDraft"
  | "reconcileCompletedCompaction"
  | "recoverUnannouncedChatStream"
  | "refreshLiveCheckpointTip"
  | "workspacePath"
>;

/** Projects the shared SDK chat event stream into the existing page state. */
export function subscribePageChatEvents(
  options: PageChatEventOptions,
  client: Pick<OpenAgentClient, "subscribeToChatEvents"> = openAgent,
) {
  return client.subscribeToChatEvents({
    onRunStarted: (event) => {
      options.applyExternalChatRunStarted(event);
    },
    onResponseStarted: (conv_id) => {
      if (!options.chatStreams.streamingConversationIds[conv_id]) {
        options.recoverUnannouncedChatStream(conv_id);
      }
      options.chatStreams.clearMemoryRetrieval(conv_id);
      if (options.chatStreams.streamingConversationIds[conv_id]) {
        options.chatStreams.awaitingOutput = {
          ...options.chatStreams.awaitingOutput,
          [conv_id]: true,
        };
      }
    },
    onModelUsage: (conv_id, usage) => {
      options.liveContextUsageByConversation = {
        ...options.liveContextUsageByConversation,
        [conv_id]: usage,
      };
    },
    onMemoryRetrieval: (conv_id, stage) => {
      if (!options.chatStreams.streamingConversationIds[conv_id]) {
        options.recoverUnannouncedChatStream(conv_id);
      }
      options.chatStreams.clearAwaitingOutput(conv_id);
      options.chatStreams.memoryRetrievalStages = {
        ...options.chatStreams.memoryRetrievalStages,
        [conv_id]: stage,
      };
      options.chatStreams.memoryRetrievalSkippable = {
        ...options.chatStreams.memoryRetrievalSkippable,
        [conv_id]: stage !== "completed" && stage !== "skipped",
      };
    },
    onChunk: (conv_id, text) => {
      if (text) options.chatStreams.clearAwaitingOutput(conv_id);
      if (text) options.chatStreams.clearMemoryRetrieval(conv_id);
      if (text) options.chatStreams.recordFirstResponse(conv_id);
      options.applyStreamMutation(conv_id, (items) => appendChunk(items, text));
    },
    onThinkingChunk: (conv_id, text) => {
      if (text) options.chatStreams.clearAwaitingOutput(conv_id);
      if (text) options.chatStreams.clearMemoryRetrieval(conv_id);
      if (text) options.chatStreams.recordFirstResponse(conv_id);
      options.applyStreamMutation(conv_id, (items) => appendThinkingChunk(items, text));
    },
    onToolCall: (conv_id, name, args, toolUseId, mcpUi) => {
      options.chatStreams.clearAwaitingOutput(conv_id);
      options.chatStreams.clearMemoryRetrieval(conv_id);
      options.chatStreams.recordFirstResponse(conv_id);
      let items = appendToolCall(
        options.chatStreams.itemsByConversation[conv_id] ?? [],
        name,
        args,
        toolUseId,
        mcpUi,
      );
      const pendingInput = options.pendingUserInputs[conv_id];
      if (pendingInput?.kind === "tool_approval") {
        items = appendUserInput(items, pendingInput);
      }
      options.chatStreams.itemsByConversation = {
        ...options.chatStreams.itemsByConversation,
        [conv_id]: items,
      };
      options.persistStreamDraft(conv_id).catch(() => {});
    },
    onToolResult: (conv_id, result, toolUseId, mcpUi) => {
      const pendingToolCall = toolUseId
        ? (options.chatStreams.itemsByConversation[conv_id] ?? []).find(
            (item) =>
              item.type === "tool_call" &&
              item.toolUseId === toolUseId &&
              item.result === undefined,
          )
        : [...(options.chatStreams.itemsByConversation[conv_id] ?? [])]
            .reverse()
            .find((item) => item.type === "tool_call" && item.result === undefined);
      const rolesMayHaveChanged =
        pendingToolCall?.type === "tool_call" && pendingToolCall.name === "create_role";
      if (options.attachApprovedToolResult(conv_id, result, toolUseId)) {
        if (rolesMayHaveChanged) void options.loadAvailableRoles();
        return;
      }
      options.chatStreams.itemsByConversation = {
        ...options.chatStreams.itemsByConversation,
        [conv_id]: attachToolResult(
          options.chatStreams.itemsByConversation[conv_id] ?? [],
          result,
          toolUseId,
          mcpUi,
        ),
      };
      if (rolesMayHaveChanged) void options.loadAvailableRoles();
      options.persistStreamDraft(conv_id).catch(() => {});
    },
    onFileChange: (conv_id, change) => {
      const existing = options.liveFileChangesPerConv[conv_id] ?? [];
      if (existing.some((item) => item.id === change.id)) return;
      options.liveFileChangesPerConv = {
        ...options.liveFileChangesPerConv,
        [conv_id]: [...existing, change],
      };
    },
    onCheckpoint: (conv_id, checkpoint_id, branch_id) => {
      options.pendingCheckpointIds = { ...options.pendingCheckpointIds, [conv_id]: checkpoint_id };
      // During a batch approval, retain only the newest durable tip. Each
      // intermediate checkpoint is valid, but hydrating it would replace the
      // optimistic cards that are still waiting in the approval queue.
      if (!options.approvalResumeQueues.has(conv_id)) {
        void options.refreshLiveCheckpointTip(conv_id, checkpoint_id, branch_id);
      } else {
        options.deferredApprovalCheckpointIds.set(conv_id, {
          checkpointId: checkpoint_id,
          branchId:
            branch_id === undefined ? (options.activeBranchIds[conv_id] ?? null) : branch_id,
        });
      }
      const location = options.findConversationLocation(conv_id);
      const visibleMessages = location?.conversations[location.index].messages;
      if (
        visibleMessages &&
        !visibleMessages.some((message) => message.role === "user") &&
        !options.pendingExternalUserRecoveries.has(conv_id)
      ) {
        options.pendingExternalUserRecoveries.add(conv_id);
        void options.loadMessagesForConv(conv_id, false, true).finally(() => {
          options.pendingExternalUserRecoveries.delete(conv_id);
        });
      }
    },
    onRetry: (conv_id, attempt, maxAttempts, model, error, restoredCheckpoint) => {
      options.chatStreams.clearAwaitingOutput(conv_id);
      const items = options.chatStreams.itemsByConversation[conv_id] ?? [];
      const previousAttempts = items.filter((item) => item.type === "retry");
      // A completed compaction divider describes the reply, not the failed
      // attempt that follows it. Keep it outside the attempt bundle so the
      // retry record cannot hide a boundary that already happened.
      const compactionBoundaries = items.filter((item) => item.type === "compaction_boundary");
      const failedAttemptItems = items.filter(
        (item) => item.type !== "retry" && item.type !== "compaction_boundary",
      );
      options.chatStreams.itemsByConversation = {
        ...options.chatStreams.itemsByConversation,
        [conv_id]: [
          ...previousAttempts,
          ...compactionBoundaries,
          {
            type: "retry",
            items: failedAttemptItems,
            attempt: attempt - 1,
            maxAttempts,
            model,
            error,
          },
        ],
      };
      const { [conv_id]: _ck, ...restCk } = options.pendingCheckpointIds;
      options.pendingCheckpointIds = restCk;
      if (!restoredCheckpoint && conv_id in options.liveFileChangesPerConv) {
        options.clearLiveFileChanges(conv_id);
      }
      options.discardPersistedStreamDraft(conv_id);
    },
    onCompactionProgress: (convId, stage, error) => {
      const revision = (options.compactionProgressRevisions.get(convId) ?? 0) + 1;
      options.compactionProgressRevisions.set(convId, revision);
      const wasStreaming = !!options.chatStreams.streamingConversationIds[convId];
      const previousItems = options.chatStreams.itemsByConversation[convId] ?? [];
      if (!wasStreaming && stage !== "done" && stage !== "skipped") {
        options.compactionOnlyConvIds.add(convId);
        options.chatStreams.streamingConversationIds = {
          ...options.chatStreams.streamingConversationIds,
          [convId]: true,
        };
        options.chatStreams.assistantMessageIds = {
          ...options.chatStreams.assistantMessageIds,
          [convId]: crypto.randomUUID(),
        };
      }

      if (stage === "done") {
        // Keep the completion divider exactly where the transient progress
        // record stood. The durable replay is filtered while its continuation
        // still streams, so clearing progress here would leave the turn
        // without a boundary until its terminal checkpoint reconciles. A
        // compaction-only row keeps the same divider until that cleanup.
        if (convId in options.chatStreams.itemsByConversation) {
          options.chatStreams.itemsByConversation = {
            ...options.chatStreams.itemsByConversation,
            [convId]: completeCompactionProgress(previousItems),
          };
        }
        void options.reconcileCompletedCompaction(convId, revision);
        return;
      }

      options.chatStreams.itemsByConversation = {
        ...options.chatStreams.itemsByConversation,
        [convId]: appendCompactionProgress(previousItems, stage, error),
      };

      if (stage === "skipped") {
        options.finishCompactionProgress(convId, revision);
        return;
      }
      if (stage === "failed") {
        options.finishCompactionProgress(convId, revision, 1600);
        return;
      }
    },
    onDone: (conv_id, asstMsgId, error, turnId) => {
      if (
        options.finalizeStreamedMessage(
          conv_id,
          error ? "failed" : "completed",
          asstMsgId,
          turnId,
          error,
        )
      ) {
        options.interruptTerminalHandoffs.release(conv_id);
      }
    },
    onFollowUpSuggestions: (convId, assistantMessageId, suggestions) => {
      const normalized = options.normalizeSuggestions(suggestions);
      if (!convId || !assistantMessageId || normalized.length !== 3) return;
      options.followUpSuggestionsByMessageId = {
        ...options.followUpSuggestionsByMessageId,
        [assistantMessageId]: normalized,
      };
    },
    onNewConversationSuggestions: (suggestionWorkspace, language, suggestions) => {
      const normalized = options.normalizeSuggestions(suggestions);
      if (normalized.length !== 3) return;
      if (
        (suggestionWorkspace || "") === (options.workspacePath || "") &&
        language === (options.config?.language ?? "zh")
      ) {
        options.newConversationSuggestions = normalized;
      }
    },
    onInterrupted: (conv_id, _requestId, asstMsgId, turnId) => {
      if (options.finalizeStreamedMessage(conv_id, "interrupted", asstMsgId, turnId)) {
        options.interruptTerminalHandoffs.release(conv_id);
      }
      // The live `chat-user-input-request` event has already attached the
      // next approval to its tool card. Do not re-project the complete
      // checkpoint here: replacing the conversation while the user clicks
      // through approvals causes a visible flash. Checkpoint loading remains
      // the recovery path when opening a conversation or restoring a view.
    },
    onCancelled: (conv_id, asstMsgId, turnId) => {
      if (options.finalizeStreamedMessage(conv_id, "cancelled", asstMsgId, turnId)) {
        options.interruptTerminalHandoffs.release(conv_id);
      }
    },
  });
}
