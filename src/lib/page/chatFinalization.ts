import type { ChatMessage, Conversation, FileChange, CheckpointTurnStatus } from "../types";
import type { ChatStreamState } from "../chatStreamState.svelte";
import { collapseStreamText } from "../chatStream";
import {
  reconcileTerminalAssistantMessage,
  terminalEventMatchesActiveStream,
} from "../checkpointTree";

export interface ChatFinalizationOptions {
  readonly chatStreams: ChatStreamState;
  pendingCheckpointIds: Record<string, string>;
  pendingParentCk: Record<string, string | null>;
  pendingForkMessageId: Record<string, string | null>;
  pendingForkSourceCheckpointId: Record<string, string>;
  pendingForkUserMessageIds: Record<string, string>;
  readonly liveFileChangesPerConv: Record<string, FileChange[]>;
  now: () => number;
  newId: () => string;
  interruptedLabel: () => string;
  notifyInactiveWindowOfAgentCompletion: (
    id: string | undefined,
    status: CheckpointTurnStatus,
    streaming: boolean,
  ) => void;
  beginStreamCompletionTailAnchor: (convId: string) => void;
  loadFileChangesForConv: (convId: string) => Promise<FileChange[] | null>;
  reconcileLiveFileChanges: (
    convId: string,
    changes: FileChange[],
    ids: ReadonlySet<string>,
  ) => void;
  clearPendingForkState: (convId: string) => void;
  dispatchNextQueuedMessage: (convId: string) => Promise<void>;
  findConversationLocation: (
    convId: string,
  ) => { conversations: Conversation[]; index: number } | null;
  promoteConversationInRecents: (conversation: Conversation) => void;
  saveAssistantMessage: (convId: string, message: ChatMessage, checkpointId: string | null) => void;
  attachNewTurnToTree: (convId: string, checkpointId: string, message: ChatMessage) => void;
  refreshTaskUsagesForConversation: (convId: string) => Promise<void>;
}

/** The page and incident runner share the same terminal reconciliation path. */
export function createChatFinalizer(options: ChatFinalizationOptions) {
  function finalizeStreamedMessage(
    conv_id: string,
    status: CheckpointTurnStatus,
    asstMsgId?: string,
    turnId?: string,
    error?: string | null,
  ): boolean {
    const activeAssistantMessageId = options.chatStreams.assistantMessageIds[conv_id];
    const recoveredStream = !!options.chatStreams.recoveredConversationIds[conv_id];
    if (!terminalEventMatchesActiveStream(activeAssistantMessageId, asstMsgId, recoveredStream)) {
      return false;
    }
    const assistantMessageId = asstMsgId ?? activeAssistantMessageId;
    const responseMessageId = turnId ?? assistantMessageId;
    options.notifyInactiveWindowOfAgentCompletion(
      assistantMessageId,
      status,
      !!options.chatStreams.streamingConversationIds[conv_id],
    );
    options.beginStreamCompletionTailAnchor(conv_id);
    let items = options.chatStreams.itemsByConversation[conv_id] ?? [];
    if (error) {
      items = [...items, { type: "runtime_notice", kind: "error", reason: error }];
    } else if (status === "cancelled") {
      items = [
        ...items,
        {
          type: "runtime_notice",
          kind: "interrupted",
          reason: options.interruptedLabel(),
        },
      ];
    }
    const fullText = collapseStreamText(items);
    const hasContent = fullText.length > 0 || items.some((i) => i.type !== "text");
    if (!hasContent) {
      const finalizedLiveChangeIds = new Set(
        (options.liveFileChangesPerConv[conv_id] ?? []).map((change) => change.id),
      );
      void options.loadFileChangesForConv(conv_id).then((durableChanges) => {
        if (durableChanges) {
          options.reconcileLiveFileChanges(conv_id, durableChanges, finalizedLiveChangeIds);
        }
      });
      // A cancelled/empty turn has no checkpoint to attach to the optimistic
      // fork. Clear the one-shot fork markers before the next ordinary send,
      // otherwise it is incorrectly submitted as another sibling branch.
      options.clearPendingForkState(conv_id);
      options.chatStreams.cleanup(conv_id);
      void options.dispatchNextQueuedMessage(conv_id);
      return true;
    }

    const checkpointId = options.pendingCheckpointIds[conv_id] ?? null;

    // The live divider is a streaming affordance: once this turn is durable the
    // reconciled compaction replay renders the same boundary, so persisting the
    // marker as well would mount it twice.
    const durableItems = items.filter((item) => item.type !== "compaction_boundary");

    const finalizedAt = options.now();
    const assistantMsg: ChatMessage = {
      id: assistantMessageId ?? options.newId(),
      role: "assistant",
      content: fullText,
      timestamp: finalizedAt,
      items: durableItems.length > 0 ? [...durableItems] : undefined,
      aborted: status === "cancelled" || undefined,
      checkpointId: checkpointId ?? undefined,
      firstTokenAt: options.chatStreams.firstTokenAt[conv_id],
      completedAt: status === "interrupted" ? undefined : finalizedAt,
      transientTurnStatus: status,
    };

    const location = options.findConversationLocation(conv_id);
    if (!location) {
      // Conv was deleted while streaming — drop the in-flight message instead of saving an orphan row.
      const { [conv_id]: _items, ...restItems } = options.chatStreams.itemsByConversation;
      const { [conv_id]: _streaming, ...restStreaming } =
        options.chatStreams.streamingConversationIds;
      const { [conv_id]: _ck, ...restCk } = options.pendingCheckpointIds;
      const { [conv_id]: _pp, ...restPp } = options.pendingParentCk;
      const { [conv_id]: _pf, ...restPf } = options.pendingForkMessageId;
      const { [conv_id]: _pfs, ...restPfs } = options.pendingForkSourceCheckpointId;
      const { [conv_id]: _pfu, ...restPfu } = options.pendingForkUserMessageIds;
      const { [conv_id]: _asstId, ...restAsstIds } = options.chatStreams.assistantMessageIds;
      const { [conv_id]: _recovered, ...restRecovered } =
        options.chatStreams.recoveredConversationIds;
      options.chatStreams.itemsByConversation = restItems;
      options.chatStreams.streamingConversationIds = restStreaming;
      options.pendingCheckpointIds = restCk;
      options.pendingParentCk = restPp;
      options.pendingForkMessageId = restPf;
      options.pendingForkSourceCheckpointId = restPfs;
      options.pendingForkUserMessageIds = restPfu;
      options.chatStreams.assistantMessageIds = restAsstIds;
      options.chatStreams.recoveredConversationIds = restRecovered;
      return true;
    }

    const reconciliation = reconcileTerminalAssistantMessage(
      location.conversations[location.index].messages,
      assistantMsg,
      responseMessageId ?? assistantMsg.id,
    );
    location.conversations[location.index] = {
      ...location.conversations[location.index],
      messages: reconciliation.messages,
      updatedAt: options.now(),
    };
    options.promoteConversationInRecents(location.conversations[location.index]);

    // Rust persists completed responses, but the client is the source of the
    // stream timing. Save every final message so firstTokenAt/completedAt are
    // merged into that persisted record before a refresh.
    if (reconciliation.appended) {
      options.saveAssistantMessage(conv_id, assistantMsg, checkpointId);
    }

    // Keep the temporary records visible until the durable terminal records
    // have actually loaded. This avoids a blank banner when IPC refresh is
    // delayed or fails, and does not clear changes from a queued next turn.
    const finalizedLiveChangeIds = new Set(
      (options.liveFileChangesPerConv[conv_id] ?? []).map((change) => change.id),
    );
    void options.loadFileChangesForConv(conv_id).then((durableChanges) => {
      if (durableChanges) {
        options.reconcileLiveFileChanges(conv_id, durableChanges, finalizedLiveChangeIds);
      }
    });

    // Attach the just-completed turn to the conversation tree.
    if (checkpointId) {
      options.attachNewTurnToTree(conv_id, checkpointId, assistantMsg);
    }
    void options.refreshTaskUsagesForConversation(conv_id);

    // Clean up pending checkpoint id and any re-execution hint for this conv
    const { [conv_id]: _ck, ...restCk } = options.pendingCheckpointIds;
    options.pendingCheckpointIds = restCk;
    options.clearPendingForkState(conv_id);

    options.chatStreams.cleanup(conv_id);
    void options.dispatchNextQueuedMessage(conv_id);
    return true;
  }

  return finalizeStreamedMessage;
}
