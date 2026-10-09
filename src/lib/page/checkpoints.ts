import { mergeConversationUiMessages, mergeConversationUiStream } from "$lib/conversationUi";
import { tick } from "svelte";
import { desktopOpenAgent as openAgent } from "$lib/openagent/tauriClient";
import { tr } from "$lib/i18n";
import type {
  Conversation,
  FileChange,
  UserInputRequest,
  StartupConversationBundle,
  PluginFlowUpdatedEvent,
} from "$lib/types";
import type { ChatStreamState } from "$lib/chatStreamState.svelte";
import type { RightSidebarPanel } from "$lib/rightSidebar";
import type { OpenAgentClient } from "$lib/openagent";
import {
  buildTreeFromCheckpoints,
  selectActivePathToCheckpoint,
  getActiveTipNode,
  agentHistoryRestoreCheckpoint,
  reconcileLiveCheckpointTip,
  computeActivePath,
  preserveStreamingMessagesDuringHydration,
  preserveMessagesAddedDuringHydration,
  isCompactionBoundary,
  ckIdsAlongActivePath,
  type ConvTree,
} from "$lib/checkpointTree";
import {
  liveCheckpointRefreshDecision,
  updateLiveCheckpointFlowProjection,
  shouldAutoOpenCheckpointFlowPanel,
  checkpointFlowPanelKey,
  type LiveCheckpointFlowProjection,
  type LiveCheckpointRefreshGuard,
} from "$lib/checkpointFlow";
import { conversationBranchScopeKey } from "$lib/sidebarPanelScope";
import { preserveResolvedUserInputs } from "$lib/chatStream";
import { retainUndurableFileChanges } from "$lib/fileChangeReconciliation";
import { restorePendingUserInputFromCheckpoint } from "$lib/page/pendingInputProjection";

export interface CheckpointOptions {
  readonly tauriAvailable: boolean;
  readonly activeConvId: string | null;
  conversations: Conversation[];
  readonly chatStreams: ChatStreamState;
  readonly pendingForkUserMessageIds: Record<string, string>;
  convTrees: Record<string, ConvTree>;
  loadingConversationIds: Record<string, boolean>;
  checkpointLoadErrors: Record<string, string>;
  readonly loadedConvIds: Set<string>;
  readonly liveCheckpointRefreshVersions: Map<string, number>;
  readonly branchSelectionVersions: Map<string, number>;
  activeBranchIds: Record<string, string>;
  liveCheckpointFlowProjections: Record<string, LiveCheckpointFlowProjection>;
  liveFileChangesPerConv: Record<string, FileChange[]>;
  fileChangesPerConv: Record<string, FileChange[]>;
  pendingUserInputs: Record<string, UserInputRequest>;
  checkpointFlowPanelAutoOpenKey: string | null;
  rightSidebarPanel: RightSidebarPanel;
  rightSidebarCollapseRequested: boolean;
  mergeDurableFollowUpSuggestions: (checkpoints: StartupConversationBundle["checkpoints"]) => void;
  restoreMermaidRenderRequests: (
    convId: string,
    checkpoint: StartupConversationBundle["checkpoints"][number],
  ) => void;
  refreshTaskUsagesForConversation: (convId: string) => Promise<void>;
  findConversationLocation: (convId: string) => {
    conversations: Conversation[];
    index: number;
  } | null;
}

/** Owns durable hydration and branch-scoped checkpoint reconciliation. */
export function createCheckpointController(
  options: CheckpointOptions,
  client: Pick<OpenAgentClient, "invokeProduct"> = openAgent,
  settle: () => Promise<void> = tick,
) {
  const fetchRenderableCheckpoints = (convId: string) =>
    client.invokeProduct("get_renderable_checkpoints", { convId });
  const fetchFileChanges = (convId: string) => client.invokeProduct("get_file_changes", { convId });
  async function loadMessagesForConv(
    convId: string,
    showLoadingState = true,
    forceRefresh = false,
  ): Promise<void> {
    if (options.loadedConvIds.has(convId) && !forceRefresh) return;
    options.loadedConvIds.add(convId);
    if (!options.tauriAvailable) return;
    const messageIdsAtStart = new Set(
      options.conversations
        .find((conversation) => conversation.id === convId)
        ?.messages.map((message) => message.id) ?? [],
    );
    if (showLoadingState) {
      options.loadingConversationIds = { ...options.loadingConversationIds, [convId]: true };
    }
    try {
      const [checkpoints, savedTip, branches] = await Promise.all([
        fetchRenderableCheckpoints(convId),
        client.invokeProduct("get_active_branch_tip", { convId }).catch(() => null),
        client
          .invokeProduct("get_branches", {
            convId,
          })
          .catch(() => []),
      ]);
      await hydrateConversation(
        convId,
        checkpoints,
        savedTip,
        branches,
        showLoadingState,
        messageIdsAtStart,
      );
      // The usage projection needs the freshly hydrated checkpoint tree to map
      // request checkpoints back to the active durable turn.
      await settle();
      void options.refreshTaskUsagesForConversation(convId);
      if (convId in options.checkpointLoadErrors) {
        const { [convId]: _cleared, ...rest } = options.checkpointLoadErrors;
        options.checkpointLoadErrors = rest;
      }
    } catch (error) {
      options.loadedConvIds.delete(convId);
      const detail = error instanceof Error ? error.message : String(error);
      options.checkpointLoadErrors = {
        ...options.checkpointLoadErrors,
        [convId]: `${tr("checkpointLoadFailed")} ${detail || "Unknown error"}`,
      };
    } finally {
      if (showLoadingState) {
        const { [convId]: _loading, ...rest } = options.loadingConversationIds;
        options.loadingConversationIds = rest;
      }
    }
  }

  async function refreshLiveCheckpointTip(
    convId: string,
    checkpointId: string,
    branchIdHint?: string | null,
  ): Promise<void> {
    if (!options.tauriAvailable) return;
    const branchId =
      branchIdHint === undefined ? (options.activeBranchIds[convId] ?? null) : branchIdHint;
    const scopeKey = conversationBranchScopeKey(convId, branchId);
    const version = (options.liveCheckpointRefreshVersions.get(scopeKey) ?? 0) + 1;
    options.liveCheckpointRefreshVersions.set(scopeKey, version);
    const guard: LiveCheckpointRefreshGuard = {
      refreshVersion: version,
      branchSelectionVersion: options.branchSelectionVersions.get(convId) ?? 0,
      flowVersion: options.liveCheckpointFlowProjections[scopeKey]?.version ?? 0,
    };
    try {
      const checkpoints = await fetchRenderableCheckpoints(convId);
      const currentGuard: LiveCheckpointRefreshGuard = {
        refreshVersion: options.liveCheckpointRefreshVersions.get(scopeKey) ?? 0,
        branchSelectionVersion: options.branchSelectionVersions.get(convId) ?? 0,
        flowVersion: options.liveCheckpointFlowProjections[scopeKey]?.version ?? 0,
      };
      const decision = liveCheckpointRefreshDecision(guard, currentGuard);
      if (!decision.applyDurableTip) return;
      // The event may belong to an inactive sibling. Keep its durable state in
      // storage and let the next branch activation load it; never move the
      // selected path while the user is looking at another branch.
      if ((options.activeBranchIds[convId] ?? null) !== branchId) return;
      const checkpoint = checkpoints.find((item) => item.meta.checkpoint_id === checkpointId);
      if (!checkpoint) return;
      options.convTrees = {
        ...options.convTrees,
        [convId]: reconcileLiveCheckpointTip(checkpoints, options.convTrees[convId], checkpointId),
      };
      const location = options.findConversationLocation(convId);
      if (location) {
        const visible = location.conversations[location.index];
        let durable = computeActivePath(options.convTrees[convId]);
        if (options.chatStreams.streamingConversationIds[convId]) {
          options.chatStreams.itemsByConversation = {
            ...options.chatStreams.itemsByConversation,
            [convId]: mergeConversationUiStream(
              visible.messages,
              durable,
              options.chatStreams.itemsByConversation[convId] ?? [],
              convId,
              branchId,
            ),
          };
          const visibleIds = new Set(visible.messages.map((message) => message.id));
          durable = durable.filter(
            (message) => message.role !== "ui" || visibleIds.has(message.id),
          );
        }
        const projectedUi = mergeConversationUiMessages(visible.messages, durable);
        location.conversations[location.index] = { ...visible, messages: projectedUi };
      }
      const liveChanges = options.liveFileChangesPerConv[convId] ?? [];
      reconcileLiveFileChanges(
        convId,
        options.fileChangesPerConv[convId] ?? [],
        new Set(liveChanges.map((change) => change.id)),
      );
      if (decision.clearLiveProjection) {
        const { [scopeKey]: _durableFlow, ...rest } = options.liveCheckpointFlowProjections;
        options.liveCheckpointFlowProjections = rest;
      }
    } catch (error) {
      if (options.liveCheckpointRefreshVersions.get(scopeKey) === version) {
        console.error(`Failed to refresh live checkpoint ${checkpointId}:`, error);
      }
    }
  }

  function applyLiveCheckpointFlow(convId: string, update: PluginFlowUpdatedEvent): void {
    const branchId = update.branch_id ?? null;
    const scopeKey = conversationBranchScopeKey(convId, branchId);
    const current = options.liveCheckpointFlowProjections[scopeKey];
    const next = updateLiveCheckpointFlowProjection(current, update);
    if (!next || next === current) return;
    const previous = current?.flow ?? getActiveTipNode(options.convTrees[convId])?.flow;
    const activeBranchId = options.activeBranchIds[convId] ?? null;
    if (
      convId === options.activeConvId &&
      branchId === activeBranchId &&
      shouldAutoOpenCheckpointFlowPanel(previous, next.flow)
    ) {
      options.checkpointFlowPanelAutoOpenKey = checkpointFlowPanelKey(convId, branchId, next.flow);
      options.rightSidebarPanel = "status";
      options.rightSidebarCollapseRequested = false;
    }
    options.liveCheckpointFlowProjections = {
      ...options.liveCheckpointFlowProjections,
      [scopeKey]: next,
    };
  }

  async function hydrateConversation(
    convId: string,
    checkpoints: StartupConversationBundle["checkpoints"],
    savedTip: string | null,
    branches: Array<{ id: string; head_checkpoint_id: string | null }>,
    syncBackendHistory: boolean,
    messageIdsAtStart?: ReadonlySet<string>,
  ): Promise<void> {
    options.mergeDurableFollowUpSuggestions(checkpoints);
    let tree = buildTreeFromCheckpoints(checkpoints, options.convTrees[convId]);
    if (savedTip) tree = selectActivePathToCheckpoint(tree, savedTip);
    const activeBranch = branches.find((branch) => branch.head_checkpoint_id === savedTip);
    const nextActiveBranchIds = { ...options.activeBranchIds };
    if (activeBranch) nextActiveBranchIds[convId] = activeBranch.id;
    else delete nextActiveBranchIds[convId];
    if ((options.activeBranchIds[convId] ?? null) !== (nextActiveBranchIds[convId] ?? null)) {
      options.branchSelectionVersions.set(
        convId,
        (options.branchSelectionVersions.get(convId) ?? 0) + 1,
      );
    }
    options.activeBranchIds = nextActiveBranchIds;
    options.convTrees = { ...options.convTrees, [convId]: tree };
    const liveChanges = options.liveFileChangesPerConv[convId] ?? [];
    reconcileLiveFileChanges(
      convId,
      options.fileChangesPerConv[convId] ?? [],
      new Set(liveChanges.map((change) => change.id)),
    );
    // Project the selected path once per hydration. Long conversations can
    // contain thousands of durable records; repeating this copy-heavy walk
    // made conversation switches spend most of their time in the main thread.
    const activePath = computeActivePath(tree);
    const pendingProjection = restorePendingUserInputFromCheckpoint(
      convId,
      activePath,
      checkpoints,
    );
    const tipMessage = [...activePath]
      .reverse()
      .find((message) => message.role === "assistant" && message.checkpointId);
    const tipCheckpoint = tipMessage
      ? checkpoints.find((item) => item.meta.checkpoint_id === tipMessage.checkpointId)
      : undefined;
    if (tipCheckpoint) options.restoreMermaidRenderRequests(convId, tipCheckpoint);
    if (pendingProjection.pendingRequest) {
      options.pendingUserInputs = {
        ...options.pendingUserInputs,
        [convId]: pendingProjection.pendingRequest,
      };
    }
    const hydratedMessages = pendingProjection.messages;
    const idx = options.conversations.findIndex((conversation) => conversation.id === convId);
    if (idx !== -1) {
      const visible = options.conversations[idx].messages;
      const hydrated = options.chatStreams.streamingConversationIds[convId]
        ? preserveStreamingMessagesDuringHydration(
            visible,
            hydratedMessages,
            options.pendingForkUserMessageIds[convId],
          )
        : preserveMessagesAddedDuringHydration(visible, hydratedMessages, messageIdsAtStart);
      const msgs = hydrated.map((message, index) => {
        const current = visible[index];
        if (!current || current.id !== message.id || current.role !== message.role) return message;
        return {
          ...message,
          items: preserveResolvedUserInputs(current.items ?? [], message.items ?? []),
        };
      });
      // A normal completed turn is already represented by the client-side
      // stream finalizer. Keep those message instances when only checkpoint
      // metadata changed so the visible transcript does not remount.
      const sameVisibleStructure =
        visible.length === msgs.length &&
        visible.every((message, index) => {
          const restored = msgs[index];
          return (
            message.id === restored.id &&
            message.role === restored.role &&
            message.content === restored.content &&
            isCompactionBoundary(message) === isCompactionBoundary(restored)
          );
        });

      options.conversations[idx] = sameVisibleStructure
        ? {
            ...options.conversations[idx],
            messages: visible.map((message, index) => {
              const restored = msgs[index];
              return {
                ...message,
                items: restored.items ?? message.items,
                checkpointId: restored.checkpointId ?? message.checkpointId,
                turn: restored.turn ?? message.turn,
                tags: restored.tags ?? message.tags,
                agentTag: restored.agentTag ?? message.agentTag,
              };
            }),
          }
        : { ...options.conversations[idx], messages: msgs };
    }
    if (syncBackendHistory) await syncAgentHistoryToActivePath(convId, tree);
  }

  async function syncAgentHistoryToActivePath(
    convId: string,
    tree = options.convTrees[convId],
  ): Promise<void> {
    if (!options.tauriAvailable) return;
    const tipCheckpoint = agentHistoryRestoreCheckpoint(
      tree,
      options.chatStreams.streamingConversationIds[convId] === true,
    );
    if (tipCheckpoint === undefined) return;
    await client
      .invokeProduct("restore_agent_history", {
        convId,
        checkpointId: tipCheckpoint,
      })
      .catch((e) => console.warn("restore_agent_history failed", e));
  }

  async function ensureActiveBranch(
    convId: string,
    forkedFromCheckpointId?: string | null,
    forkedFromMessageId?: string | null,
  ): Promise<string | null> {
    if (!options.tauriAvailable) return null;
    if (forkedFromCheckpointId === undefined && options.activeBranchIds[convId]) {
      return options.activeBranchIds[convId];
    }
    if (forkedFromCheckpointId === undefined) {
      const branches = await client.invokeProduct("get_branches", { convId }).catch(() => []);
      const tip = [
        ...(options.convTrees[convId] ? computeActivePath(options.convTrees[convId]) : []),
      ]
        .reverse()
        .find((message) => message.role === "assistant" && message.checkpointId)?.checkpointId;
      const existing = branches.find((branch) => branch.head_checkpoint_id === tip);
      if (existing) {
        options.activeBranchIds = { ...options.activeBranchIds, [convId]: existing.id };
        return existing.id;
      }
    }
    const id = crypto.randomUUID();
    const parentBranchId = options.activeBranchIds[convId] ?? null;
    await client.invokeProduct("create_branch", {
      id,
      convId,
      parentBranchId,
      forkedFromCheckpointId: forkedFromCheckpointId ?? null,
      forkedFromMessageId: forkedFromMessageId ?? null,
    });
    options.activeBranchIds = { ...options.activeBranchIds, [convId]: id };
    return id;
  }

  async function loadFileChangesForConv(convId: string): Promise<FileChange[] | null> {
    if (!options.tauriAvailable) return null;
    try {
      const changes = await fetchFileChanges(convId);
      options.fileChangesPerConv = { ...options.fileChangesPerConv, [convId]: changes };
      return changes;
    } catch {
      return null;
    }
  }

  function clearLiveFileChanges(convId: string, changeIds?: Set<string>) {
    const current = options.liveFileChangesPerConv[convId] ?? [];
    const remaining = changeIds ? current.filter((change) => !changeIds.has(change.id)) : [];
    if (remaining.length > 0) {
      options.liveFileChangesPerConv = { ...options.liveFileChangesPerConv, [convId]: remaining };
      return;
    }
    const { [convId]: _live, ...rest } = options.liveFileChangesPerConv;
    options.liveFileChangesPerConv = rest;
  }

  function reconcileLiveFileChanges(
    convId: string,
    durableChanges: FileChange[],
    finalizedIds: ReadonlySet<string>,
  ): void {
    const current = options.liveFileChangesPerConv[convId] ?? [];
    const tree = options.convTrees[convId];
    const projectedCheckpointIds = tree ? ckIdsAlongActivePath(tree) : new Set<string>();
    const remaining = retainUndurableFileChanges(
      current,
      durableChanges,
      finalizedIds,
      projectedCheckpointIds,
    );
    if (remaining.length === current.length) return;
    if (remaining.length > 0) {
      options.liveFileChangesPerConv = { ...options.liveFileChangesPerConv, [convId]: remaining };
      return;
    }
    clearLiveFileChanges(convId);
  }

  return {
    loadMessagesForConv,
    refreshLiveCheckpointTip,
    applyLiveCheckpointFlow,
    hydrateConversation,
    syncAgentHistoryToActivePath,
    ensureActiveBranch,
    loadFileChangesForConv,
    clearLiveFileChanges,
    reconcileLiveFileChanges,
  };
}
