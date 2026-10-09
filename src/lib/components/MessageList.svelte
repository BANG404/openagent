<script lang="ts">
  import { fade } from "svelte/transition";
  import ToolCallGroup from "./ToolCallGroup.svelte";
  import type { AgentBookTurn } from "./AgentBookReader.svelte";
  import Tooltip from "./Tooltip.svelte";
  import TranscriptList from "./TranscriptList.svelte";
  import UserMessageRow from "./transcript/UserMessageRow.svelte";
  import AssistantTurnRow from "./transcript/AssistantTurnRow.svelte";
  import {
    entryAssistantMessages,
    assistantItems,
    isCompactionReplayUser,
  } from "$lib/transcript/assistantContent";
  import { createUserMessageEditor } from "$lib/transcript/userEditor.svelte";
  import { USER_MESSAGE_COLLAPSE_LINES } from "$lib/transcript/userContent";
  import NewConversationContext from "./NewConversationContext.svelte";
  import { t } from "$lib/i18n";
  import { latestTurnSuggestionHostMessageId } from "$lib/followUpSuggestions";
  import type { ConvTree } from "$lib/checkpointTree";
  import { assistantTurnStatus } from "$lib/processRecordState";
  import type { ChatMemoryRetrievalStage } from "$lib/openagent";
  import type {
    ChatAttachment,
    ChatMessage,
    FileChange,
    StreamItem,
    TaskTokenUsage,
    UserMessageContext,
  } from "$lib/types";
  import PluginMessage from "./PluginMessage.svelte";
  import ConversationUiRecord from "./ConversationUiRecord.svelte";
  import type { MermaidConfig } from "$lib/mermaidTheme";
  import { isPluginMessage } from "$lib/types";
  import { createTranscriptSelection } from "$lib/transcript/selection.svelte";
  import { motionDuration } from "$lib/motion";
  import {
    appendLiveStreamEntry,
    groupAssistantTurns,
    groupMessageToolCalls,
    groupStreamItems,
    isAssistantTurnEntry,
  } from "$lib/toolCallGroups";

  interface Props {
    messages: ChatMessage[];
    scrollElement: HTMLElement | null;
    isStreaming: boolean;
    isAwaitingStreamOutput: boolean;
    streamStartedAt?: number | null;
    memoryRetrievalStage?: ChatMemoryRetrievalStage | null;
    memoryRetrievalCanSkip?: boolean;
    currentStreamItems: StreamItem[];
    currentStreamMessageId: string | null;
    pendingCheckpointId?: string | null;
    activeConvId: string | null;
    activeBranchId: string | null;
    debugMode: boolean;
    fileChanges?: FileChange[];
    taskUsagesByCheckpointId?: Record<string, TaskTokenUsage[]>;
    activeTree: ConvTree | undefined;
    paddingBottom: number;
    showApiKeyWarn: boolean;
    shikiTheme: string;
    mermaidConfig: MermaidConfig;
    messageLayout?: "single" | "responsive_double";
    messageDoubleColumnMinWidth?: number;
    bookModeFontSize?: number;
    followTail?: boolean;
    onTailPin?: () => void;
    tailAnchorToken?: number | null;
    onTailAnchorSettled?: (token: number) => void;
    newConversationGreeting: string | null;
    newConversationGreetingLoading: boolean;
    showNewConversationContext?: boolean;
    checkpointLoadError?: string | null;
    followUpSuggestionsByMessageId?: Record<string, string[]>;
    editable?: boolean;
    attachmentPreviewLoader?: (
      locator: string,
      name: string,
    ) => Promise<{ kind: "image" | "text" | "file"; data_url?: string; text?: string }>;
    onCommitEdit: (
      convId: string,
      userMsgIdx: number,
      newText: string,
      attachments: ChatAttachment[],
      contexts: UserMessageContext[],
    ) => void;
    onAddQuote: (context: UserMessageContext) => void;
    onReExecute: (convId: string, assistantMsgIdx: number) => void;
    onSwitchBranch: (convId: string, parentKey: string, targetIdx: number) => void;
    onSubmitUserInput: (requestId: string, values: Record<string, unknown>) => void;
    onCancelUserInput: (requestId: string) => void;
    onSkipMemoryRetrieval?: () => void;
    onSelectSuggestion?: (suggestion: string) => void | Promise<void>;
  }
  let {
    messages,
    scrollElement,
    isStreaming,
    isAwaitingStreamOutput,
    streamStartedAt = null,
    memoryRetrievalStage = null,
    memoryRetrievalCanSkip = false,
    currentStreamItems,
    currentStreamMessageId,
    pendingCheckpointId = null,
    activeConvId,
    activeBranchId,
    debugMode,
    fileChanges = [],
    taskUsagesByCheckpointId = {},
    activeTree,
    paddingBottom,
    showApiKeyWarn,
    shikiTheme,
    mermaidConfig,
    messageLayout = "single",
    messageDoubleColumnMinWidth = 1200,
    bookModeFontSize = 17,
    followTail = true,
    onTailPin,
    tailAnchorToken = null,
    onTailAnchorSettled,
    newConversationGreeting,
    newConversationGreetingLoading,
    showNewConversationContext = true,
    checkpointLoadError = null,
    followUpSuggestionsByMessageId = {},
    editable = true,
    attachmentPreviewLoader,
    onCommitEdit,
    onAddQuote,
    onReExecute,
    onSwitchBranch,
    onSubmitUserInput,
    onCancelUserInput,
    onSkipMemoryRetrieval = () => {},
    onSelectSuggestion = () => {},
  }: Props = $props();

  let streamedOpenThinkingItemKey = $state<string | null>(null);
  let copiedAssistantMessageId = $state<string | null>(null);
  let readingTurnKey = $state<string | null>(null);
  let loadingBookTurnKey = $state<string | null>(null);
  let BookReader = $state<typeof import("./AgentBookReader.svelte").default | null>(null);
  let suggestionHostMessageId = $derived(latestTurnSuggestionHostMessageId(messages));
  let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => () => {
    if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
  });
  let transcriptList = $state<TranscriptList | null>(null);
  let messagesRoot = $state<HTMLElement | null>(null);
  let userMessageIndexLeft = $state(16);
  const userEditor = createUserMessageEditor({
    get activeConvId() {
      return activeConvId;
    },
    get editable() {
      return editable;
    },
    get isStreaming() {
      return isStreaming;
    },
    get onCommitEdit() {
      return onCommitEdit;
    },
    get onSwitchBranch() {
      return onSwitchBranch;
    },
  });
  const transcriptSelection = createTranscriptSelection({
    get root() {
      return messagesRoot;
    },
    get onAddQuote() {
      return onAddQuote;
    },
  });
  function isHiddenMessage(msg: ChatMessage) {
    return msg.role === "system";
  }
  let visibleMessages = $derived(
    messages.map((msg, index) => ({ msg, index })).filter(({ msg }) => !isHiddenMessage(msg)),
  );
  let renderEntries = $derived(groupAssistantTurns(groupMessageToolCalls(visibleMessages)));
  let bookTurns = $derived(
    renderEntries.flatMap((entry): AgentBookTurn[] =>
      isAssistantTurnEntry(entry)
        ? [
            {
              key: entry.key,
              items: assistantItems(entry, currentStreamItems, activeConvId, activeBranchId),
              status: assistantTurnStatus(entryAssistantMessages(entry), false),
            },
          ]
        : [],
    ),
  );
  let transcriptEntries = $derived(
    appendLiveStreamEntry(renderEntries, isStreaming ? currentStreamMessageId : null),
  );
  let currentSegments = $derived(groupStreamItems(currentStreamItems));
  // The live row carries its own divider while the running stream reports
  // compaction. A replay that reaches the transcript without a durable
  // continuation is the live row's own boundary, so it yields to the marker
  // the stream is already showing; any other replay describes a completed
  // compaction and stays mounted while a later turn streams.
  let liveCompactionDivider = $derived(
    isStreaming &&
      currentStreamItems.some(
        (item) => item.type === "compaction" || item.type === "compaction_boundary",
      ),
  );
  let userMessageIndex = $derived(
    visibleMessages.filter(
      ({ msg }) => msg.role === "user" && !isCompactionReplayUser(msg) && !isPluginMessage(msg),
    ),
  );

  // Keep reader selection scoped to the mounted conversation.
  $effect(() => {
    activeConvId;
    readingTurnKey = null;
    loadingBookTurnKey = null;
  });

  // The index is fixed to the viewport, so anchor it to the conversation
  // column rather than the window's left edge (which is occupied by the
  // desktop sidebar). The observer also follows sidebar resizing.
  $effect(() => {
    const root = messagesRoot;
    const main = root?.closest<HTMLElement>(".main");
    if (!main) return;

    const update = () => {
      userMessageIndexLeft = Math.max(8, Math.round(main.getBoundingClientRect().left + 16));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(main);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  });

  // A live row and its finalized durable message intentionally share the same
  // assistant ID. Capture the thinking record the stream leaves open — the
  // trailing one — by stable item key, but do not let toggle events from the
  // outgoing live DOM mutate this handoff snapshot. The durable component
  // consumes it only as its initial state, so records that already collapsed
  // during streaming must not reopen when the live row hands off.
  $effect(() => {
    if (!isStreaming || !currentStreamMessageId) return;
    const trailing = currentSegments.at(-1);
    streamedOpenThinkingItemKey =
      trailing?.kind === "item" && trailing.item.type === "thinking"
        ? `${currentStreamMessageId}-${trailing.startIndex}`
        : null;
  });

  function userIndexTitle(content: string) {
    const text = content.trim().replace(/\s+/g, " ");
    return text.slice(0, 80);
  }

  function userIndexAriaLabel(content: string, index: number) {
    return userIndexTitle(content) || `User message ${index + 1}`;
  }

  function scrollToMessage(id: string) {
    transcriptList?.scrollToKey(id);
  }

  async function copyAssistantOutput(turnId: string, output: string) {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      copiedAssistantMessageId = turnId;
      if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
      copyFeedbackTimer = setTimeout(() => {
        if (copiedAssistantMessageId === turnId) copiedAssistantMessageId = null;
        copyFeedbackTimer = null;
      }, 1800);
    } catch (error) {
      console.warn("Failed to copy assistant output", error);
    }
  }

  async function openBook(turnKey: string) {
    const conversationId = activeConvId;
    loadingBookTurnKey = turnKey;
    try {
      const module = await import("./AgentBookReader.svelte");
      if (conversationId !== activeConvId || loadingBookTurnKey !== turnKey) return;
      BookReader = module.default;
      readingTurnKey = turnKey;
    } finally {
      if (loadingBookTurnKey === turnKey) loadingBookTurnKey = null;
    }
  }
</script>

<div
  class="messages-inner"
  bind:this={messagesRoot}
  onpointerup={transcriptSelection.captureAssistantSelection}
  role="presentation"
  class:messages-inner-empty={visibleMessages.length === 0 && !isStreaming}
  class:messages-inner-responsive-double={messageLayout === "responsive_double"}
  style="padding-bottom: {paddingBottom}px; --user-message-collapse-lines: {USER_MESSAGE_COLLAPSE_LINES}; --user-message-index-left: {userMessageIndexLeft}px"
>
  {#if checkpointLoadError}
    <div class="checkpoint-load-error" role="alert">{checkpointLoadError}</div>
  {/if}
  {#if debugMode && activeConvId}
    <aside class="debug-context" aria-label="Debug context">
      <span>debug</span>
      <Tooltip text={activeConvId}>
        <code>conversation: {activeConvId}</code>
      </Tooltip>
      <Tooltip text={activeBranchId ?? "No active branch"}>
        <code>branch: {activeBranchId ?? "pending"}</code>
      </Tooltip>
    </aside>
  {/if}

  {#if userMessageIndex.length > 1}
    <nav class="user-message-index" aria-label="User message index">
      {#each userMessageIndex as item, index (item.msg.id)}
        <Tooltip text={userIndexTitle(item.msg.content)} side="right">
          {#snippet trigger(props)}
            <button
              {...props}
              type="button"
              aria-label={userIndexAriaLabel(item.msg.content, index)}
              onclick={() => scrollToMessage(item.msg.id)}
            >
              <span class="index-mark" aria-hidden="true"></span>
            </button>
          {/snippet}
        </Tooltip>
      {/each}
    </nav>
  {/if}

  {#if visibleMessages.length === 0 && !isStreaming && showNewConversationContext}
    <NewConversationContext
      prompt={newConversationGreeting}
      loading={newConversationGreetingLoading}
      {showApiKeyWarn}
    />
  {/if}

  <TranscriptList
    bind:this={transcriptList}
    items={transcriptEntries}
    {scrollElement}
    responsiveColumns={messageLayout === "responsive_double"}
    doubleColumnMinWidth={messageDoubleColumnMinWidth}
    {followTail}
    {onTailPin}
    {tailAnchorToken}
    {onTailAnchorSettled}
  >
    {#snippet children(entry)}
      {#if isAssistantTurnEntry(entry)}
        <AssistantTurnRow
          {entry}
          {messages}
          {currentStreamItems}
          {activeConvId}
          {activeBranchId}
          {activeTree}
          {debugMode}
          {pendingCheckpointId}
          {streamedOpenThinkingItemKey}
          {shikiTheme}
          {mermaidConfig}
          {fileChanges}
          {taskUsagesByCheckpointId}
          {memoryRetrievalStage}
          {memoryRetrievalCanSkip}
          {isAwaitingStreamOutput}
          {streamStartedAt}
          {followUpSuggestionsByMessageId}
          {suggestionHostMessageId}
          {copiedAssistantMessageId}
          {loadingBookTurnKey}
          {copyAssistantOutput}
          {onReExecute}
          {onSubmitUserInput}
          {onCancelUserInput}
          {onSkipMemoryRetrieval}
          {onSelectSuggestion}
          onOpenBook={openBook}
        />
      {:else if entry.kind === "tool_group"}
        {@const firstMessage = entry.messages[0]}
        <div
          class="stream-item message-record"
          id={`message-${firstMessage.id}`}
          data-message-id={firstMessage.id}
        >
          <ToolCallGroup
            items={entry.items}
            {fileChanges}
            {onSubmitUserInput}
            {onCancelUserInput}
          />
        </div>
      {:else if entry.kind === "message"}
        {@const msg = entry.msg}
        {@const msgIdx = entry.index}
        {#if msg.role === "ui" && msg.ui}
          {#if !(liveCompactionDivider && msg.ui.component === "builtin.divider" && msg.ui.props.label_key === "compactionCompleted")}
            <ConversationUiRecord
              ui={msg.ui}
              messageId={msg.id}
              conversationId={activeConvId}
              branchId={activeBranchId}
            />
          {/if}
        {:else if isCompactionReplayUser(msg) && !liveCompactionDivider}
          <ConversationUiRecord
            ui={{
              version: 1,
              component: "builtin.divider",
              props: { label_key: "compactionCompleted" },
              fallback: $t("compactionCompleted"),
            }}
            streamItemKey={`compaction-boundary-${msg.id}`}
            messageId={msg.id}
            conversationId={null}
            branchId={null}
          />
        {:else if msg.role === "user" && isPluginMessage(msg)}
          <PluginMessage message={msg} />
        {:else if msg.role === "user"}
          <UserMessageRow
            {msg}
            {msgIdx}
            {activeConvId}
            {activeTree}
            {isStreaming}
            {editable}
            {debugMode}
            edit={userEditor}
            {attachmentPreviewLoader}
          />
        {/if}
      {/if}
    {/snippet}
  </TranscriptList>
</div>

{#if transcriptSelection.selectionPopover}
  <button
    class="selection-add-button floating-application-surface"
    type="button"
    transition:fade={{ duration: motionDuration(120) }}
    style={`left: ${transcriptSelection.selectionPopover.left}px; top: ${transcriptSelection.selectionPopover.top}px`}
    onpointerdown={(event) => event.preventDefault()}
    onclick={transcriptSelection.addSelectedQuote}
  >
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M3 8h7M3 11.5h5" /></svg>
    <span>{$t("addSelectionToChat")}</span>
  </button>
{/if}

{#if readingTurnKey && BookReader}
  <BookReader
    turns={bookTurns}
    activeKey={readingTurnKey}
    {shikiTheme}
    {mermaidConfig}
    fontSize={bookModeFontSize}
    onClose={() => (readingTurnKey = null)}
    {onSubmitUserInput}
    {onCancelUserInput}
  />
{/if}

<style>
  .messages-inner {
    position: relative;
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
    padding: 16px 32px 120px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    box-sizing: border-box;
  }

  .messages-inner-empty {
    max-width: none;
    padding-bottom: 0 !important;
  }

  .messages-inner-responsive-double:not(.messages-inner-empty) {
    max-width: 1680px;
  }

  .debug-context {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    align-items: center;
    margin: 0 0 18px;
    padding: 7px 9px;
    border: 1px dashed color-mix(in srgb, var(--warning, #d99000) 55%, var(--border));
    border-radius: 6px;
    background: color-mix(in srgb, var(--warning, #d99000) 8%, transparent);
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.35;
  }

  .checkpoint-load-error {
    margin: 0 0 18px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--danger, #c33) 55%, var(--border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--danger, #c33) 8%, transparent);
    color: var(--text);
    font-size: 13px;
    line-height: 1.45;
  }

  .debug-context > span {
    color: var(--warning, #b67800);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .debug-context code {
    font-family: var(--font-mono, ui-monospace, monospace);
    overflow-wrap: anywhere;
  }

  .user-message-index {
    position: fixed;
    top: 50%;
    left: var(--user-message-index-left, 16px);
    z-index: 12;
    display: flex;
    width: 28px;
    max-height: min(52vh, 360px);
    transform: translateY(-50%);
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 1px;
    padding: 8px 0;
    overflow: visible;
    pointer-events: auto;
  }

  .user-message-index button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    width: 28px;
    min-height: 18px;
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    transition: transform var(--motion-fast) var(--ease-standard);
  }

  .user-message-index button:hover,
  .user-message-index button:focus-visible {
    background: transparent;
    outline: none;
    transform: translateX(2px);
  }

  .user-message-index button:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .index-mark {
    width: 16px;
    height: 1px;
    margin-right: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-muted) 64%, transparent);
    transition:
      width var(--motion-fast) var(--ease-standard),
      background var(--motion-fast) var(--ease-standard),
      transform var(--motion-fast) var(--ease-standard);
  }

  .user-message-index button:hover .index-mark,
  .user-message-index button:focus-visible .index-mark {
    width: 28px;
    background: var(--text-muted);
    transform: scaleY(1.6);
  }

  @media (max-width: 720px) {
    .user-message-index {
      left: 8px;
      width: 38px;
    }
  }

  .selection-add-button {
    position: fixed;
    z-index: 80;
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    color: var(--text);
    font: inherit;
    font-size: 12px;
    line-height: 18px;
    cursor: pointer;
    transform: translate(-50%, -100%);
  }

  .selection-add-button:hover {
    background: var(--interactive-state-bg);
  }

  .selection-add-button:focus-visible {
    outline: none;
    box-shadow: var(--mica-shadow), var(--focus-ring);
  }

  .selection-add-button svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
  }
</style>
