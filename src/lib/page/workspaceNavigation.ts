import { desktopOpenAgent as openAgent } from "$lib/openagent/tauriClient";
import { tr, type Locale } from "$lib/i18n";
import { showToast } from "$lib/toast";
import type {
  AppConfig,
  Conversation,
  WorkspaceContext,
  StartupConversationBundle,
  ConversationPageCursor,
  UserInputRequest,
  AgentRole,
  FileChange,
} from "$lib/types";
import type { CachedRestoreSurface } from "$lib/startupRestoreCache";
import type { ChatStreamState } from "$lib/chatStreamState.svelte";
import type { createRoleController } from "$lib/page/roles.svelte";
import type { createConversationLists } from "$lib/page/conversationLists.svelte";
import {
  fetchConversationMeta,
  fetchConversationPage,
  fetchRenderableCheckpoints,
  fetchFileChanges,
} from "$lib/conversationDb";
import {
  buildTreeFromCheckpoints,
  selectActivePathToCheckpoint,
  computeActivePath,
  preserveStreamingMessagesDuringHydration,
  type ConvTree,
} from "$lib/checkpointTree";
import { prepareWorkspaceConversationSnapshot } from "$lib/workspaceConversationState";
import { mergeConversationMetadata } from "$lib/page/conversationMetadata";
import { restorePendingUserInputFromCheckpoint } from "$lib/page/pendingInputProjection";

export type WorkspaceRouteResult = "current" | "routed" | "failed";

interface WorkspaceOptions {
  readonly tauriAvailable: boolean;
  readonly config: AppConfig | null;
  readonly defaultRoleKey: string;
  workspacePath: string;
  workspace: WorkspaceContext | null;
  workspaceLoading: boolean;
  workspaceSwitchTarget: string | null;
  conversations: Conversation[];
  activeConvId: string | null;
  restoringSurface: CachedRestoreSurface;
  newConversationSuggestions: string[];
  convTrees: Record<string, ConvTree>;
  activeBranchIds: Record<string, string>;
  pendingUserInputs: Record<string, UserInputRequest>;
  fileChangesPerConv: Record<string, FileChange[]>;
  readonly workspaceConversationSnapshots: Map<string, Conversation[]>;
  readonly loadedConvIds: Set<string>;
  readonly chatStreams: ChatStreamState;
  readonly pendingForkUserMessageIds: Record<string, string>;
  readonly roleController: ReturnType<typeof createRoleController>;
  readonly conversationLists: ReturnType<typeof createConversationLists>;
  loadAvailableRolesForWorkspace: (path: string) => Promise<AgentRole[]>;
  loadNewConversationSuggestions: (workspace: string, language: Locale) => Promise<string[]>;
  storedRoleSelection: (workspace?: string) => string;
  roleSelectionStorageKey: (workspace?: string) => string;
  mergeDurableFollowUpSuggestions: (checkpoints: StartupConversationBundle["checkpoints"]) => void;
  syncAgentHistoryToActivePath: (convId: string, tree?: ConvTree) => Promise<void>;
  scrollToBottom: (behavior?: ScrollBehavior) => Promise<void>;
  cacheRestoreSurface: (
    surface: CachedRestoreSurface,
    conversationId: string | null,
    workspace?: string,
  ) => void;
  addToRecentWorkspaces: (path: string) => Promise<void>;
  refreshRecentConversations: () => Promise<void>;
}

/** Prepares durable workspace state before committing the visible navigation. */
export function createWorkspaceNavigation(options: WorkspaceOptions) {
  type PreparedWorkspaceSwitch = {
    activeConversation: StartupConversationBundle | null;
    activeConversationTree?: ConvTree;
    activeBranchId: string | null;
    activeConversationId: string | null;
    conversations: Conversation[];
    conversationNextCursor: ConversationPageCursor | null;
    pendingUserInput?: UserInputRequest;
    roles: AgentRole[];
    selectedRoleKey: string;
    newConversationSuggestions: string[];
  };

  async function prepareWorkspaceSwitch(
    path: string,
    preferredConversationId?: string,
    restoreActiveConversation = true,
  ): Promise<PreparedWorkspaceSwitch> {
    if (!options.tauriAvailable) {
      return {
        activeConversation: null,
        activeConversationTree: undefined,
        activeBranchId: null,
        activeConversationId: null,
        conversations: [],
        conversationNextCursor: null,
        pendingUserInput: undefined,
        roles: [],
        selectedRoleKey: options.defaultRoleKey,
        newConversationSuggestions: [],
      };
    }
    const [roles, durableActiveId, preparedNewConversationSuggestions] = await Promise.all([
      options.loadAvailableRolesForWorkspace(path),
      restoreActiveConversation
        ? openAgent.invokeProduct("get_active_conv_id", { workspace: path || "" }).catch(() => null)
        : Promise.resolve(null),
      options.loadNewConversationSuggestions(path, options.config?.language ?? "zh"),
    ]);
    let activeConversationId = preferredConversationId ?? durableActiveId;
    let activeMeta = activeConversationId
      ? await fetchConversationMeta(activeConversationId).catch(() => null)
      : null;
    if (activeMeta?.workspace && activeMeta.workspace !== path) activeMeta = null;
    if (!activeMeta) activeConversationId = null;

    const requestedRoleKey = activeMeta?.roleId ?? options.storedRoleSelection(path);
    const preparedRoleKey =
      requestedRoleKey === options.defaultRoleKey ||
      roles.some((role) => role.id === requestedRoleKey)
        ? requestedRoleKey
        : options.defaultRoleKey;
    const page = await fetchConversationPage(
      path || null,
      null,
      30,
      null,
      true,
      preparedRoleKey === options.defaultRoleKey ? null : preparedRoleKey,
    );

    const lineage: Conversation[] = [];
    const visited = new Set<string>();
    let current = activeMeta;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      lineage.push(current);
      if (!current.parentConvId) break;
      current = await fetchConversationMeta(current.parentConvId).catch(() => null);
      if (current?.workspace && current.workspace !== path) current = null;
    }

    const activeConversation = activeConversationId
      ? await Promise.all([
          fetchRenderableCheckpoints(activeConversationId),
          openAgent
            .invokeProduct("get_active_branch_tip", { convId: activeConversationId })
            .catch(() => null),
          openAgent
            .invokeProduct("get_branches", {
              convId: activeConversationId,
            })
            .catch(() => []),
          fetchFileChanges(activeConversationId),
        ]).then(([checkpoints, activeBranchTip, branches, fileChanges]) => ({
          checkpoints,
          active_branch_tip: activeBranchTip,
          branches,
          file_changes: fileChanges,
        }))
      : null;

    let preparedConversations = prepareWorkspaceConversationSnapshot(
      mergeConversationMetadata(page.conversations, lineage),
      options.workspaceConversationSnapshots.get(path) ?? [],
      activeConversationId,
      null,
    );
    let activeConversationTree: ConvTree | undefined;
    let activeBranchId: string | null = null;
    let pendingUserInput: UserInputRequest | undefined;
    if (activeConversationId && activeConversation) {
      options.mergeDurableFollowUpSuggestions(activeConversation.checkpoints);
      let tree = buildTreeFromCheckpoints(
        activeConversation.checkpoints,
        options.convTrees[activeConversationId],
      );
      if (activeConversation.active_branch_tip) {
        tree = selectActivePathToCheckpoint(tree, activeConversation.active_branch_tip);
        activeBranchId =
          activeConversation.branches.find(
            (branch) => branch.head_checkpoint_id === activeConversation.active_branch_tip,
          )?.id ?? null;
      }
      const pendingProjection = restorePendingUserInputFromCheckpoint(
        activeConversationId,
        computeActivePath(tree),
        activeConversation.checkpoints,
      );
      pendingUserInput = pendingProjection.pendingRequest;
      const cachedMessages =
        options.workspaceConversationSnapshots
          .get(path)
          ?.find((conversation) => conversation.id === activeConversationId)?.messages ?? [];
      const hydratedMessages = options.chatStreams.streamingConversationIds[activeConversationId]
        ? preserveStreamingMessagesDuringHydration(
            cachedMessages,
            pendingProjection.messages,
            options.pendingForkUserMessageIds[activeConversationId],
          )
        : pendingProjection.messages;
      preparedConversations = prepareWorkspaceConversationSnapshot(
        preparedConversations,
        [],
        activeConversationId,
        hydratedMessages,
      );
      activeConversationTree = tree;
    }

    return {
      activeConversation,
      activeConversationTree,
      activeBranchId,
      activeConversationId,
      conversations: preparedConversations,
      conversationNextCursor: page.nextCursor,
      pendingUserInput,
      roles,
      selectedRoleKey: preparedRoleKey,
      newConversationSuggestions: preparedNewConversationSuggestions,
    };
  }

  async function applyWorkspace(
    path: string,
    target: { conversationId?: string; newConversation?: boolean } = {},
  ): Promise<boolean> {
    if (path === options.workspacePath) return true;
    if (options.workspaceLoading) return false;

    options.workspaceSwitchTarget = path;
    options.workspaceLoading = true;
    const previousWorkspacePath = options.workspacePath;
    let runtimeWorkspaceChanged = false;
    let workspaceStateCommitted = false;
    try {
      let nextWorkspace: WorkspaceContext = {
        path,
        git_branch: null,
        has_agent_dir: false,
        environment: { kind: "local" },
      };
      if (options.tauriAvailable) {
        await openAgent.invokeProduct("set_workspace", { path: path || null });
        runtimeWorkspaceChanged = true;
      }
      const prepared = await prepareWorkspaceSwitch(
        path,
        target.conversationId,
        !target.newConversation,
      );
      if (options.tauriAvailable) {
        nextWorkspace = (await openAgent.invokeProduct<"get_workspace_context">(
          "get_workspace_context",
          {},
        )) as WorkspaceContext;
      }
      // Commit the prepared workspace as one state transition so the mounted
      // transcript and composer are never replaced by an app-wide loading pass.
      options.workspaceConversationSnapshots.set(previousWorkspacePath, options.conversations);
      options.workspacePath = path;
      options.workspace = nextWorkspace;
      options.roleController.agentRoles = prepared.roles;
      options.roleController.selectedRoleKey = prepared.selectedRoleKey;
      options.conversations = prepared.conversations;
      options.workspaceConversationSnapshots.set(path, options.conversations);
      options.conversationLists.conversationNextCursor = prepared.conversationNextCursor;
      options.conversationLists.resetSearchResults();
      options.activeConvId = prepared.activeConversationId;
      options.restoringSurface = options.activeConvId ? "conversation" : "new-conversation";
      options.newConversationSuggestions = prepared.newConversationSuggestions;
      workspaceStateCommitted = true;

      if (options.activeConvId && prepared.activeConversation) {
        options.loadedConvIds.add(options.activeConvId);
        if (prepared.activeConversationTree) {
          options.convTrees = {
            ...options.convTrees,
            [options.activeConvId]: prepared.activeConversationTree,
          };
        }
        if (prepared.activeBranchId) {
          options.activeBranchIds = {
            ...options.activeBranchIds,
            [options.activeConvId]: prepared.activeBranchId,
          };
        }
        if (prepared.pendingUserInput) {
          options.pendingUserInputs = {
            ...options.pendingUserInputs,
            [options.activeConvId]: prepared.pendingUserInput,
          };
        }
        options.fileChangesPerConv = {
          ...options.fileChangesPerConv,
          [options.activeConvId]: prepared.activeConversation.file_changes,
        };
        if (prepared.activeConversationTree) {
          await options.syncAgentHistoryToActivePath(
            options.activeConvId,
            prepared.activeConversationTree,
          );
        }
        if (options.activeConvId === target.conversationId) {
          window.localStorage.setItem(
            options.roleSelectionStorageKey(path),
            options.roleController.selectedRoleKey,
          );
          await openAgent
            .invokeProduct("set_active_conversation", {
              convId: options.activeConvId,
              workspace: path || "",
            })
            .catch(() => {});
        }
        await options.scrollToBottom();
      } else if (options.tauriAvailable) {
        await openAgent
          .invokeProduct("set_active_conversation", { convId: null, workspace: path || "" })
          .catch(() => {});
      }
      options.cacheRestoreSurface(options.restoringSurface, options.activeConvId, path);
      await options.addToRecentWorkspaces(path);
      void options.refreshRecentConversations();
    } catch (error) {
      if (runtimeWorkspaceChanged && !workspaceStateCommitted) {
        await openAgent
          .invokeProduct("set_workspace", { path: previousWorkspacePath || null })
          .catch(() => {});
      }
      console.warn("Failed to open workspace:", path, error);
      showToast({
        title: tr("workspaceUnavailable"),
        description: path,
        descriptionFromEnd: true,
        variant: "error",
      });
      return false;
    } finally {
      options.workspaceLoading = false;
      options.workspaceSwitchTarget = null;
    }
    return true;
  }

  async function routeWorkspace(
    path: string,
    target: {
      conversationId?: string;
      messageId?: string;
      newConversation?: boolean;
    } = {},
  ): Promise<WorkspaceRouteResult> {
    if (path === options.workspacePath) return "current";
    if (!options.tauriAvailable) return (await applyWorkspace(path, target)) ? "current" : "failed";

    if (await applyWorkspace(path, target)) return "current";
    return "failed";
  }

  async function requestWorkspace(path: string) {
    if (!path || path === options.workspacePath) return;
    await routeWorkspace(path);
  }

  return { applyWorkspace, routeWorkspace, requestWorkspace };
}
