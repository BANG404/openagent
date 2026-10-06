import type {
  AppConfig,
  AgentPluginSummary,
  Conversation,
  UserInputRequest,
  TaskTokenUsage,
  FileChange,
  StreamItem,
  CheckpointTurnStatus,
  AgentPluginUpdateReport,
  StartupBootstrap,
  PluginFlowUpdatedEvent,
} from "$lib/types";
import type { ChatRunStartedEvent } from "$lib/openagent";
import type { Locale } from "$lib/i18n";
import type { createRoleController } from "$lib/page/roles.svelte";
import type { WorkspaceRouteResult } from "$lib/page/workspaceNavigation";
import type { LatestRequest } from "$lib/latestRequest";
import type { ChatStreamState } from "$lib/chatStreamState.svelte";
import type { ComposerDraftStore, ComposerDraft } from "$lib/composerDrafts";
import type { mermaidConfigFor } from "$lib/mermaidTheme";
import type { InterruptTerminalHandoff } from "$lib/interruptResolutionTracker";
import type { CachedRestoreSurface } from "$lib/startupRestoreCache";

/** Writable facade over the page's canonical state; handlers never copy it. */
export interface PageEventOptions {
  readonly tauriAvailable: boolean;
  readonly isDevInspectorWindow: boolean;
  config: AppConfig | null;
  workspacePath: string;
  agentPlugins: AgentPluginSummary[];
  showMainDebugComponents: boolean;
  newConversationSuggestions: string[];
  readonly launchContext: {
    workspace: string | null;
    conversation_id: string | null;
    message_id: string | null;
    new_conversation: boolean;
  } | null;
  readonly roleController: ReturnType<typeof createRoleController>;
  readonly defaultRoleKey: string;
  readonly settingsRequests: LatestRequest;
  conversations: Conversation[];
  readonly loadedConvIds: Set<string>;
  readonly chatStreams: ChatStreamState;
  readonly compactionOnlyConvIds: Set<string>;
  readonly compactionProgressRevisions: Map<string, number>;
  activeConvId: string | null;
  selectedComposerDraftKey: string;
  readonly composerDrafts: ComposerDraftStore;
  activeComposerDraft: ComposerDraft;
  activeBranchIds: Record<string, string>;
  pendingUserInputs: Record<string, UserInputRequest>;
  readonly mermaidConfig: ReturnType<typeof mermaidConfigFor>;
  liveContextUsageByConversation: Record<string, TaskTokenUsage>;
  liveFileChangesPerConv: Record<string, FileChange[]>;
  pendingCheckpointIds: Record<string, string>;
  readonly approvalResumeQueues: Map<string, Promise<void>>;
  readonly deferredApprovalCheckpointIds: Map<
    string,
    { checkpointId: string; branchId: string | null }
  >;
  readonly pendingExternalUserRecoveries: Set<string>;
  readonly interruptTerminalHandoffs: InterruptTerminalHandoff;
  followUpSuggestionsByMessageId: Record<string, string[]>;
  refreshAgentCommands: () => Promise<void>;
  checkAgentPluginUpdates: () => Promise<AgentPluginUpdateReport>;
  applyStartupBootstrap: (bootstrap: StartupBootstrap) => Promise<void>;
  routeWorkspace: (
    path: string,
    target?: { conversationId?: string; messageId?: string; newConversation?: boolean },
  ) => Promise<WorkspaceRouteResult>;
  activateNewConversationSurface: (roleKey?: string) => Promise<void>;
  revealMemorySource: (convId: string, messageId: string) => Promise<void>;
  handleWindowFocusEvent: (focused: boolean) => void;
  applyTheme: (theme: string) => void;
  loadNewConversationSuggestions: (workspace: string, language: Locale) => Promise<string[]>;
  loadAvailableRoles: () => Promise<void>;
  openHookConversation: (conversationId: string) => Promise<void>;
  applyConversationTitleUpdate: (convId: string, title: string) => Promise<void>;
  cacheRestoreSurface: (
    surface: CachedRestoreSurface,
    conversationId: string | null,
    workspace?: string,
  ) => void;
  attachPendingUserInputToMessages: (convId: string, request: UserInputRequest) => boolean;
  persistStreamDraft: (convId: string, aborted?: boolean) => Promise<void>;
  applyLiveCheckpointFlow: (convId: string, event: PluginFlowUpdatedEvent) => void;
  applyExternalChatRunStarted: (event: ChatRunStartedEvent) => void;
  recoverUnannouncedChatStream: (convId: string) => void;
  applyStreamMutation: (convId: string, mutate: (items: StreamItem[]) => StreamItem[]) => void;
  attachApprovedToolResult: (convId: string, result: string, toolUseId?: string) => boolean;
  refreshLiveCheckpointTip: (
    convId: string,
    checkpointId: string,
    branchId?: string | null,
  ) => Promise<void>;
  findConversationLocation: (
    convId: string,
  ) => { conversations: Conversation[]; index: number; isCurrentWorkspace: boolean } | null;
  loadMessagesForConv: (
    convId: string,
    showLoadingState?: boolean,
    forceRefresh?: boolean,
  ) => Promise<void>;
  clearLiveFileChanges: (convId: string, changeIds?: Set<string>) => void;
  discardPersistedStreamDraft: (convId: string) => void;
  reconcileCompletedCompaction: (convId: string, revision: number) => Promise<void>;
  finishCompactionProgress: (convId: string, revision: number, delay?: number) => void;
  finalizeStreamedMessage: (
    convId: string,
    status: CheckpointTurnStatus,
    assistantMessageId?: string,
    turnId?: string,
    error?: string | null,
  ) => boolean;
  normalizeSuggestions: (value: unknown) => string[];
}

export type RegisterPageEvent = <T>(
  event: string,
  handler: (event: { payload: T }) => void,
) => void;
