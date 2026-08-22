<script lang="ts">
  import type { ChatMemoryRetrievalStage } from "$lib/openagent";
  import type { CheckpointFlow } from "$lib/checkpointFlow";
  import type { ConvTree } from "$lib/checkpointTree";
  import type { ComposerPreferences } from "$lib/composerPreferences.svelte";
  import type { ComposerDraft } from "$lib/composerDrafts";
  import type { MermaidConfig } from "$lib/mermaidTheme";
  import { providerRequiresApiKey } from "$lib/providerCatalog";
  import type { QueuedChatMessage } from "$lib/chatQueue";
  import type { CachedRestoreSurface } from "$lib/startupRestoreCache";
  import type {
    AppConfig,
    ChatAttachment,
    ChatMessage,
    FileChange,
    RecentWorkspace,
    StreamItem,
    UserMessageContext,
    WorkspaceContext,
  } from "$lib/types";
  import { t } from "$lib/i18n";
  import { showToast } from "$lib/toast";
  import ChatQueue from "./ChatQueue.svelte";
  import CheckpointFlowPanelHost from "./CheckpointFlowPanelHost.svelte";
  import FileChangeBanner from "./FileChangeBanner.svelte";
  import FollowUpSuggestions from "./FollowUpSuggestions.svelte";
  import LoadingSkeleton from "./LoadingSkeleton.svelte";
  import MessageInput, { type SlashCommand } from "./MessageInput.svelte";
  import MessageList from "./MessageList.svelte";
  import NewConversationContext from "./NewConversationContext.svelte";

  interface ConversationSurfaceView {
    activeBranchId: string | null;
    activeConvId: string | null;
    activeTree: ConvTree | undefined;
    browserModeNotice: string;
    checkpointFlow: CheckpointFlow | null;
    checkpointLoadError: string | null;
    config: AppConfig | null;
    currentStreamItems: StreamItem[];
    currentStreamMessageId: string | null;
    debugMode: boolean;
    fileChanges: FileChange[];
    followTail: boolean;
    isAwaitingStreamOutput: boolean;
    isPaused: boolean;
    isStreaming: boolean;
    mainContentLoading: boolean;
    memoryRetrievalCanSkip: boolean;
    memoryRetrievalStage: ChatMemoryRetrievalStage | null;
    mermaidConfig: MermaidConfig;
    messages: ChatMessage[];
    newConversationLayout: boolean;
    followUpSuggestionsByMessageId: Record<string, string[]>;
    newConversationGreeting: string;
    newConversationSuggestions: string[];
    queuedMessages: QueuedChatMessage[];
    restoringSurface: CachedRestoreSurface;
    shikiTheme: string;
    slashCommands: SlashCommand[];
    tailAnchorToken: number | null;
    tauriAvailable: boolean;
    workspace: WorkspaceContext | null;
    workspacePath: string;
    recentWorkspaces: RecentWorkspace[];
  }

  interface ConversationSurfaceActions {
    cancelBottomScrollFromUser: () => void;
    cancelUserInput: (requestId: string) => void | Promise<void>;
    clearQueuedMessages: (convId: string) => void;
    commitEdit: (
      convId: string,
      userMsgIdx: number,
      newText: string,
      attachments: ChatAttachment[],
      contexts: UserMessageContext[],
    ) => void | Promise<void>;
    configureModels: () => void | Promise<void>;
    finishStreamCompletionTailAnchor: (token: number) => void;
    handleMessagesScroll: () => void;
    pauseCurrentStream: () => void | Promise<void>;
    removeQueuedMessage: (convId: string, index: number) => void;
    resumeCurrentStream: () => void | Promise<void>;
    revertFileChange: (changeId: string) => Promise<void>;
    reExecuteMessage: (convId: string, assistantMsgIdx: number) => void | Promise<void>;
    sendMessage: () => void | Promise<void>;
    sendSuggestedMessage: (suggestion: string) => void | Promise<void>;
    skipMemoryRetrieval: () => void | Promise<void>;
    stopMessage: () => void | Promise<void>;
    submitUserInput: (requestId: string, values: Record<string, unknown>) => void | Promise<void>;
    switchBranch: (convId: string, parentKey: string, targetIdx: number) => void | Promise<void>;
    pickWorkspace: () => void | Promise<void>;
    pickWslWorkspace: () => void | Promise<void>;
    selectWorkspace: (path: string) => void | Promise<void>;
  }

  let {
    view,
    actions,
    composerPreferences,
    messagesElement = $bindable(null),
    inputAreaHeight = $bindable(120),
    checkpointFlowPanelCollapsed = $bindable(true),
    composerDraft,
  }: {
    view: ConversationSurfaceView;
    actions: ConversationSurfaceActions;
    composerPreferences: ComposerPreferences;
    messagesElement: HTMLElement | null;
    inputAreaHeight: number;
    checkpointFlowPanelCollapsed: boolean;
    composerDraft: ComposerDraft;
  } = $props();

  let composerFocusRequest = $state(0);

  function addQuote(context: UserMessageContext) {
    if (
      composerDraft.contexts.some(
        (item) =>
          item.type === context.type &&
          item.text === context.text &&
          item.sourceMessageId === context.sourceMessageId,
      )
    ) {
      composerFocusRequest += 1;
      return;
    }
    if (composerDraft.contexts.length >= 8) {
      showToast({ title: $t("quotedContextLimit"), variant: "error" });
      return;
    }
    composerDraft.contexts = [...composerDraft.contexts, context];
    composerFocusRequest += 1;
  }

  function shouldShowDefaultProviderCredentialWarning(appConfig: AppConfig | null): boolean {
    if (!appConfig) return false;
    const provider = appConfig.providers.find(
      (item) => item.id === appConfig.defaults.chat_model.provider_id,
    );
    return !provider || (providerRequiresApiKey(provider.provider) && !provider.api_key.trim());
  }
</script>

<div class="conversation-workspace" style:--input-area-height={`${inputAreaHeight}px`}>
  <div
    class="conversation-input-fade"
    class:conversation-input-fade-streaming={view.isStreaming}
    class:conversation-input-fade-hidden={view.newConversationLayout}
    aria-hidden="true"
  ></div>
  <div class="conversation-stage">
    {#if !view.tauriAvailable}
      <div class="runtime-banner">{view.browserModeNotice}</div>
    {/if}

    <main
      class="messages"
      bind:this={messagesElement}
      onscroll={actions.handleMessagesScroll}
      onwheel={actions.cancelBottomScrollFromUser}
      ontouchstart={actions.cancelBottomScrollFromUser}
      onpointerdown={actions.cancelBottomScrollFromUser}
    >
      {#if view.mainContentLoading && view.restoringSurface !== "new-conversation"}
        <LoadingSkeleton variant="conversation" label={$t("loadingContent")} />
      {:else if !view.mainContentLoading}
        <MessageList
          messages={view.messages}
          scrollElement={messagesElement}
          isStreaming={view.isStreaming}
          isAwaitingStreamOutput={view.isAwaitingStreamOutput}
          memoryRetrievalStage={view.memoryRetrievalStage}
          memoryRetrievalCanSkip={view.memoryRetrievalCanSkip}
          currentStreamItems={view.currentStreamItems}
          currentStreamMessageId={view.currentStreamMessageId}
          activeConvId={view.activeConvId}
          activeBranchId={view.activeBranchId}
          debugMode={view.debugMode}
          activeTree={view.activeTree}
          paddingBottom={inputAreaHeight + 24}
          showApiKeyWarn={shouldShowDefaultProviderCredentialWarning(view.config)}
          shikiTheme={view.shikiTheme}
          mermaidConfig={view.mermaidConfig}
          htmlPreviewConfig={view.config?.html_preview}
          messageLayout={view.config?.message_layout ?? "single"}
          messageDoubleColumnMinWidth={view.config?.message_double_column_min_width ?? 1200}
          bookModeFontSize={view.config?.book_mode_font_size ?? 17}
          followTail={view.followTail}
          tailAnchorToken={view.tailAnchorToken}
          onTailAnchorSettled={actions.finishStreamCompletionTailAnchor}
          newConversationGreeting={view.newConversationGreeting}
          newConversationGreetingLoading={false}
          followUpSuggestionsByMessageId={view.followUpSuggestionsByMessageId}
          showNewConversationContext={!view.newConversationLayout}
          checkpointLoadError={view.checkpointLoadError}
          onCommitEdit={actions.commitEdit}
          onAddQuote={addQuote}
          onReExecute={actions.reExecuteMessage}
          onSwitchBranch={actions.switchBranch}
          onSubmitUserInput={actions.submitUserInput}
          onCancelUserInput={actions.cancelUserInput}
          onSkipMemoryRetrieval={actions.skipMemoryRetrieval}
          onSelectSuggestion={actions.sendSuggestedMessage}
        />
      {/if}
    </main>

    <div
      class="input-area"
      class:input-area-streaming={view.isStreaming}
      class:input-area-new-conversation={view.newConversationLayout}
      bind:clientHeight={inputAreaHeight}
    >
      {#if view.newConversationLayout}
        <NewConversationContext
          prompt={view.newConversationGreeting}
          loading={view.mainContentLoading}
          showApiKeyWarn={shouldShowDefaultProviderCredentialWarning(view.config)}
          placement="stack"
        />
      {/if}
      <div class="input-inner">
        {#if view.mainContentLoading}
          <LoadingSkeleton variant="composer" label={$t("loadingContent")} />
        {:else}
          {#if view.fileChanges.length > 0}
            <FileChangeBanner changes={view.fileChanges} onRevert={actions.revertFileChange} />
          {/if}
          {#if view.activeConvId}
            <ChatQueue
              items={view.queuedMessages}
              onRemove={(index) => actions.removeQueuedMessage(view.activeConvId!, index)}
              onClear={() => actions.clearQueuedMessages(view.activeConvId!)}
            />
          {/if}
          <MessageInput
            bind:value={composerDraft.text}
            bind:attachments={composerDraft.attachments}
            bind:contexts={composerDraft.contexts}
            bind:selectedModel={composerPreferences.selectedModel}
            modelOptions={composerPreferences.modelOptions}
            placeholder={view.tauriAvailable
              ? composerPreferences.modelOptions.length
                ? $t("inputPlaceholder")
                : $t("modelSetupHint")
              : view.browserModeNotice}
            disabled={!view.tauriAvailable}
            isStreaming={view.isStreaming}
            isPaused={view.isPaused}
            sendDisabled={(!composerDraft.text.trim() &&
              composerDraft.attachments.length === 0 &&
              composerDraft.contexts.length === 0) ||
              !view.tauriAvailable ||
              composerPreferences.modelOptions.length === 0}
            sendTitle={$t("send")}
            pauseTitle={$t("pauseOutput")}
            resumeTitle={$t("resumeOutput")}
            stopTitle={$t("stopOutput")}
            slashCommands={view.slashCommands}
            showGlobalDraftsInMentions={view.config?.mention_palette_show_global_drafts ?? true}
            onConfigureModels={actions.configureModels}
            onModelChange={composerPreferences.handleModelChange}
            showReasoningEffort={composerPreferences.selectedModelSupportsReasoning}
            reasoningEffort={composerPreferences.selectedReasoningEffort}
            onReasoningEffortChange={composerPreferences.handleReasoningEffortChange}
            showApprovalMode
            approvalMode={view.config?.approval_mode ?? "off"}
            onApprovalModeChange={composerPreferences.handleApprovalModeChange}
            showWorkspaceSwitcher={view.newConversationLayout && !view.activeConvId}
            workspace={view.workspace}
            workspacePath={view.workspacePath}
            recentWorkspaces={view.recentWorkspaces}
            workspaceTauriAvailable={view.tauriAvailable}
            workspaceBrowserModeNotice={view.browserModeNotice}
            onPickWorkspace={() => void actions.pickWorkspace()}
            onPickWslWorkspace={() => void actions.pickWslWorkspace()}
            onSelectWorkspace={(path) => void actions.selectWorkspace(path)}
            focusRequest={composerFocusRequest}
            onSend={actions.sendMessage}
            onStop={actions.stopMessage}
            onPause={actions.pauseCurrentStream}
            onResume={actions.resumeCurrentStream}
          />
        {/if}
      </div>
      {#if view.newConversationLayout && !view.mainContentLoading}
        <FollowUpSuggestions
          suggestions={view.newConversationSuggestions}
          onSelect={actions.sendSuggestedMessage}
          variant="new-conversation"
          disabled={!view.tauriAvailable || composerPreferences.modelOptions.length === 0}
        />
      {/if}
    </div>
  </div>
  {#if view.checkpointFlow}
    <CheckpointFlowPanelHost
      flow={view.checkpointFlow}
      conversationId={view.activeConvId ?? ""}
      bind:collapsed={checkpointFlowPanelCollapsed}
    />
  {/if}
</div>

<style>
  .conversation-workspace {
    position: relative;
    isolation: isolate;
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
    margin: 40px 8px 8px;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface);
    box-shadow:
      0 1px 2px rgba(15, 23, 42, 0.04),
      0 10px 30px rgba(15, 23, 42, 0.035);
  }

  .conversation-workspace::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 3;
    background: color-mix(in srgb, var(--surface) 72%, transparent);
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
    pointer-events: none;
  }

  .conversation-stage {
    position: relative;
    z-index: 4;
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
  }

  .runtime-banner {
    padding: 10px 16px;
    background: rgba(245, 158, 11, 0.12);
    border-bottom: 1px solid rgba(245, 158, 11, 0.24);
    color: #b45309;
    font-size: 12px;
    line-height: 1.5;
  }

  .messages {
    position: relative;
    z-index: 1;
    flex: 1;
    overflow-y: auto;
    overflow-x: clip;
    display: flex;
    flex-direction: column;
    overscroll-behavior-y: contain;
    scrollbar-gutter: stable;
  }

  .input-area {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 10;
    padding-bottom: 16px;
    background: transparent;
    pointer-events: none;
  }

  .conversation-input-fade {
    position: absolute;
    inset: auto 0 0;
    z-index: 1;
    height: calc(var(--input-area-height, 120px) + 48px);
    background: linear-gradient(to top, var(--surface) 0%, var(--surface) 60%, transparent 100%);
    opacity: 1;
    pointer-events: none;
    transition: opacity 420ms ease;
  }

  .conversation-input-fade::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -26px;
    width: min(calc(100% + 24px), 988px);
    height: 90px;
    z-index: 1;
    background: linear-gradient(
      to top,
      rgba(245, 245, 247, 0.82),
      rgba(245, 245, 247, 0.08) 72%,
      transparent
    );
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0%,
      #000 10%,
      #000 90%,
      transparent 100%
    );
    mask-image: linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%);
    pointer-events: none;
    transform: translateX(-50%);
    transition:
      background 1.2s cubic-bezier(0.16, 1, 0.3, 1),
      opacity 420ms ease;
  }

  .conversation-input-fade-hidden {
    opacity: 0;
  }

  .input-area-new-conversation {
    top: calc(50% + 14px);
    bottom: auto;
    padding-bottom: 0;
    transform: translateY(-50%);
  }

  .conversation-input-fade-streaming::after {
    background: linear-gradient(
      to top,
      rgba(245, 245, 247, 0.62),
      rgba(245, 245, 247, 0.04) 72%,
      transparent
    );
  }

  :global(html.dark) .conversation-input-fade::after {
    background: linear-gradient(
      to top,
      rgba(15, 17, 23, 0.76),
      rgba(15, 17, 23, 0.08) 72%,
      transparent
    );
  }

  :global(html.dark) .conversation-workspace {
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.22),
      0 12px 34px rgba(0, 0, 0, 0.2);
  }

  .input-inner {
    position: relative;
    z-index: 2;
    max-width: 900px;
    margin: 0 auto;
    padding: 0 32px;
    pointer-events: auto;
  }

  .input-area-new-conversation .input-inner {
    max-width: 760px;
  }

  .input-area-new-conversation .input-inner :global(.composer-compact .input) {
    min-height: 66px;
  }

  .input-area-new-conversation .input-inner :global(.composer-copy) {
    min-height: 99px;
  }

  @media (prefers-color-scheme: dark) {
    .input-area::after {
      background: linear-gradient(
        to top,
        rgba(15, 17, 23, 0.76),
        rgba(15, 17, 23, 0.08) 72%,
        transparent
      );
    }

    :global(html.light) .input-area::after {
      background: linear-gradient(
        to top,
        rgba(245, 245, 247, 0.82),
        rgba(245, 245, 247, 0.08) 72%,
        transparent
      );
    }
  }

  .conversation-workspace :global(.composer),
  .conversation-workspace :global(.flow-panel) {
    background: var(--mica-surface);
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
    backdrop-filter: blur(24px) saturate(1.28);
  }
  /* ─── Streamdown table overrides ─────────────────────────────────────────── */

  :global([data-streamdown-table]) {
    overflow-x: auto;
    margin: 10px 0 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  :global([data-streamdown-table] table) {
    width: 100%;
    border-collapse: collapse;
    min-width: 0;
  }

  :global([data-streamdown-thead]) {
    background: var(--surface2);
  }

  :global([data-streamdown-th]) {
    padding: 7px 12px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  :global([data-streamdown-td]) {
    padding: 7px 12px;
    font-size: 13px;
    color: var(--text);
    border-bottom: 1px solid var(--border);
    vertical-align: top;
    min-width: 0;
    max-width: none;
    line-height: 1.5;
  }

  :global([data-streamdown-tbody] [data-streamdown-tr]:last-child [data-streamdown-td]) {
    border-bottom: none;
  }

  :global([data-streamdown-tbody] [data-streamdown-tr]:hover) {
    background: var(--surface2);
  }

  /* ─── Streamdown general prose overrides ─────────────────────────────────── */

  :global(.assistant-msg p) {
    margin: 0 0 10px;
    line-height: 1.47;
  }

  :global(.assistant-msg h1, .assistant-msg h2, .assistant-msg h3) {
    margin: 20px 0 6px;
    font-weight: 600;
    color: var(--text);
  }

  :global(.assistant-msg h1) {
    font-size: 21px;
    letter-spacing: -0.28px;
  }
  :global(.assistant-msg h2) {
    font-size: 17px;
    letter-spacing: -0.374px;
  }
  :global(.assistant-msg h3) {
    font-size: 15px;
    letter-spacing: -0.374px;
  }

  :global(.assistant-msg ul, .assistant-msg ol) {
    margin: 4px 0 10px;
    padding-left: 22px;
  }

  :global(.assistant-msg li) {
    margin: 3px 0;
    line-height: 1.47;
  }

  :global(.assistant-msg a) {
    color: var(--primary);
    text-decoration: none;
  }

  :global(.assistant-msg a:hover) {
    text-decoration: underline;
  }

  :global(.assistant-msg blockquote) {
    margin: 8px 0 10px;
    padding: 4px 14px;
    border-left: 3px solid var(--border);
    color: var(--text-muted);
  }

  :global(.assistant-msg [data-streamdown-codespan]) {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    padding: 1px 5px;
    font-size: 13px;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    letter-spacing: 0;
  }

  :global([data-streamdown-code]) {
    background: var(--surface2);
    border: none !important;
    margin: 8px 0 12px;
    border-radius: 8px;
    overflow: hidden;
  }

  :global(.assistant-msg [data-streamdown-code] > .chat-code-header) {
    background: color-mix(in srgb, var(--surface2) 88%, var(--surface)) !important;
    border-bottom: 1px solid var(--border);
    color: var(--text-muted) !important;
  }

  :global(.assistant-msg [data-streamdown-code] > .chat-code-container) {
    background: var(--surface2) !important;
    padding: 0 !important;
  }

  :global(.assistant-msg [data-streamdown-code] .chat-code-skeleton) {
    background: var(--border) !important;
  }

  :global(.assistant-msg [data-streamdown-code] button) {
    color: var(--text-muted) !important;
  }

  :global(.assistant-msg [data-streamdown-code] button[title="Download code"]) {
    display: none;
  }

  :global(.assistant-msg [data-streamdown-code] button:hover) {
    background: var(--interactive-state-bg) !important;
    color: var(--text) !important;
  }

  :global(.assistant-msg pre) {
    background: var(--surface2);
    border-radius: 8px;
    padding: 14px 16px;
    margin: 8px 0 12px;
    overflow-x: auto;
  }

  /* Shiki controls token colors; the application theme owns the block surface. */
  :global(.assistant-msg [data-streamdown-code] pre) {
    background: transparent;
    border-radius: 0;
    padding: 12px 16px;
    margin: 0;
  }

  :global(.assistant-msg [data-streamdown-code] pre code) {
    background: none;
    border: none;
    padding: 0;
    font-size: 13px;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    letter-spacing: 0;
    line-height: 1.6;
  }

  :global(.assistant-msg pre code) {
    background: none;
    border: none;
    padding: 0;
    font-size: 13px;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    letter-spacing: 0;
    line-height: 1.6;
  }

  /* ─── Streamdown Mermaid overrides ───────────────────────────────────────── */

  /* Replace hardcoded Tailwind bg-white / border-gray-200 with theme vars */
  :global([data-streamdown-mermaid] > div) {
    background: var(--surface) !important;
    border-color: var(--border) !important;
    overflow: hidden !important;
  }

  /* Keep the panzoom target out of normal flow so zooming cannot stretch the
     Mermaid block. The parent is already position:relative in Streamdown. */
  :global([data-streamdown-mermaid] [data-mermaid-svg]) {
    position: absolute !important;
    inset: 0 !important;
    display: block !important;
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    max-height: none !important;
    overflow: visible !important;
  }

  /* Keep Mermaid's generated SVG at its natural layout size; panzoom handles
     fitting it into the fixed viewport. Forcing 100% width compresses wide
     diagrams such as sequence diagrams and Gantt charts. */
  :global([data-streamdown-mermaid] [data-mermaid-svg] > svg) {
    display: block;
    margin: 0;
    max-width: none !important;
    max-height: none !important;
    overflow: visible !important;
  }

  :global([data-streamdown-mermaid] [data-mermaid-svg] .grid .tick line) {
    opacity: 0.38 !important;
    stroke-width: 1 !important;
  }

  :global([data-streamdown-mermaid] [data-mermaid-svg] .grid .tick text) {
    fill: var(--text-muted) !important;
    font-size: 11px !important;
    font-weight: 500 !important;
  }

  :global([data-streamdown-mermaid] [data-mermaid-svg] .sectionTitle) {
    fill: var(--text-muted) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
  }

  :global([data-streamdown-mermaid] [data-mermaid-svg] .taskText),
  :global([data-streamdown-mermaid] [data-mermaid-svg] .taskTextOutsideLeft),
  :global([data-streamdown-mermaid] [data-mermaid-svg] .taskTextOutsideRight) {
    fill: var(--text) !important;
    font-size: 12px !important;
    font-weight: 500 !important;
  }

  :global([data-streamdown-mermaid] [data-mermaid-svg] .today) {
    stroke-width: 1.5px !important;
    opacity: 0.7 !important;
  }

  /* Toolbar buttons (zoom/fit/download) — translucent icon-button per design.md button-icon style */
  :global([data-streamdown-mermaid] .mermaid-controls) {
    z-index: 2 !important;
  }

  :global([data-streamdown-mermaid] button) {
    background: transparent !important;
    color: var(--text-muted) !important;
    border-radius: 6px !important;
    transition:
      background 0.12s,
      color 0.12s !important;
  }
  :global([data-streamdown-mermaid] button:hover) {
    background: var(--interactive-state-bg) !important;
    color: var(--text) !important;
  }
  :global([data-streamdown-mermaid] button:active) {
    transform: scale(0.95) !important;
  }

  /* Download popover uses the shared desktop menu panel from app.css. */
  :global([data-streamdown-mermaid] .download-menu) {
    position: absolute !important;
    top: calc(100% + 6px) !important;
    right: 0 !important;
    z-index: 3 !important;
    display: flex !important;
    flex-direction: column !important;
    min-width: 88px !important;
    margin: 0 !important;
  }
  :global([data-streamdown-mermaid] .download-menu button) {
    display: flex !important;
    align-items: center !important;
    width: 100% !important;
    min-height: var(--menu-item-min-height) !important;
    height: auto !important;
    padding: var(--menu-item-padding-block) var(--menu-item-padding-inline) !important;
    margin: 0 !important;
    font-size: var(--menu-item-font-size) !important;
    line-height: var(--menu-item-line-height) !important;
    text-align: left !important;
    justify-content: flex-start !important;
    color: var(--text) !important;
    border-radius: var(--menu-item-radius) !important;
  }
  :global([data-streamdown-mermaid] .download-menu button + button) {
    margin-top: var(--menu-item-stack-gap) !important;
  }
  :global([data-streamdown-mermaid] .download-menu button:hover) {
    background: var(--interactive-state-bg) !important;
    color: var(--text) !important;
  }
</style>
