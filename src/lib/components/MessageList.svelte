<script lang="ts">
  import { onMount, tick } from "svelte";
  import StreamItemRenderer from "./StreamItemRenderer.svelte";
  import ToolCallGroup from "./ToolCallGroup.svelte";
  import ProcessRecordGroup from "./ProcessRecordGroup.svelte";
  import AgentBookReader, { type AgentBookTurn } from "./AgentBookReader.svelte";
  import Tooltip from "./Tooltip.svelte";
  import TranscriptList from "./TranscriptList.svelte";
  import NewConversationContext from "./NewConversationContext.svelte";
  import FollowUpSuggestions from "./FollowUpSuggestions.svelte";
  import { t } from "$lib/i18n";
  import { finalAssistantOutput } from "$lib/assistantOutput";
  import { latestTurnAssistantMessageId } from "$lib/followUpSuggestions";
  import { getSiblingInfoForUserMessage, type ConvTree } from "$lib/checkpointTree";
  import type { ChatMemoryRetrievalStage } from "$lib/openagent";
  import type {
    ChatAttachment,
    ChatMessage,
    HtmlPreviewConfig,
    StreamItem,
    UserMessageContext,
  } from "$lib/types";
  import AttachmentPreview from "./AttachmentPreview.svelte";
  import UserQuote from "./UserQuote.svelte";
  import type { MermaidConfig } from "$lib/mermaidTheme";
  import { selectionTextWithMath } from "$lib/streamdown/selectionText";
  import {
    appendLiveStreamEntry,
    groupAssistantTurns,
    groupMessageToolCalls,
    groupStreamItems,
    isAssistantTurnEntry,
    partitionAssistantSegments,
    type MessageRenderEntry,
    type StreamItemSegment,
  } from "$lib/toolCallGroups";

  interface Props {
    messages: ChatMessage[];
    scrollElement: HTMLElement | null;
    isStreaming: boolean;
    isAwaitingStreamOutput: boolean;
    memoryRetrievalStage?: ChatMemoryRetrievalStage | null;
    memoryRetrievalCanSkip?: boolean;
    currentStreamItems: StreamItem[];
    currentStreamMessageId: string | null;
    activeConvId: string | null;
    activeBranchId: string | null;
    debugMode: boolean;
    activeTree: ConvTree | undefined;
    paddingBottom: number;
    showApiKeyWarn: boolean;
    shikiTheme: string;
    mermaidConfig: MermaidConfig;
    htmlPreviewConfig?: HtmlPreviewConfig;
    messageLayout?: "single" | "responsive_double";
    messageDoubleColumnMinWidth?: number;
    bookModeFontSize?: number;
    followTail?: boolean;
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
    memoryRetrievalStage = null,
    memoryRetrievalCanSkip = false,
    currentStreamItems,
    currentStreamMessageId,
    activeConvId,
    activeBranchId,
    debugMode,
    activeTree,
    paddingBottom,
    showApiKeyWarn,
    shikiTheme,
    mermaidConfig,
    htmlPreviewConfig,
    messageLayout = "single",
    messageDoubleColumnMinWidth = 1200,
    bookModeFontSize = 17,
    followTail = true,
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

  function memoryRetrievalLabel(stage: ChatMemoryRetrievalStage): string {
    switch (stage) {
      case "query_rewrite":
        return $t("memoryRetrievalQueryRewrite");
      case "embedding":
        return $t("memoryRetrievalEmbedding");
      case "searching":
        return $t("memoryRetrievalSearching");
      case "completed":
        return $t("memoryRetrievalCompleted");
      case "skipped":
        return $t("memoryRetrievalSkipped");
    }
  }

  let editingMsgId = $state<string | null>(null);
  let editingText = $state("");
  let removedAttachmentPaths = $state(new Set<string>());
  let removedContextKeys = $state(new Set<string>());
  let editingTextarea = $state<HTMLTextAreaElement | null>(null);
  let expandedUserMessageIds = $state(new Set<string>());
  let streamedOpenThinkingItemKeys = $state(new Set<string>());
  let copiedAssistantMessageId = $state<string | null>(null);
  let readingTurnKey = $state<string | null>(null);
  let suggestionHostMessageId = $derived(latestTurnAssistantMessageId(messages));
  let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  let transcriptList = $state<TranscriptList | null>(null);
  let messagesRoot = $state<HTMLElement | null>(null);
  let selectionPopover = $state<{
    text: string;
    sourceMessageId: string;
    left: number;
    top: number;
  } | null>(null);
  function isHiddenMessage(msg: ChatMessage) {
    return msg.role === "system";
  }
  function isCompactionReplayUser(msg: ChatMessage) {
    return msg.role === "user" && msg.tags?.includes("context_compaction") === true;
  }
  let visibleMessages = $derived(
    messages.map((msg, index) => ({ msg, index })).filter(({ msg }) => !isHiddenMessage(msg)),
  );
  let renderEntries = $derived(groupAssistantTurns(groupMessageToolCalls(visibleMessages)));
  let bookTurns = $derived(
    renderEntries.flatMap((entry): AgentBookTurn[] =>
      isAssistantTurnEntry(entry) ? [{ key: entry.key, items: assistantItems(entry) }] : [],
    ),
  );
  let transcriptEntries = $derived(
    appendLiveStreamEntry(renderEntries, isStreaming ? currentStreamMessageId : null),
  );
  let currentSegments = $derived(groupStreamItems(currentStreamItems));
  let userMessageIndex = $derived(
    visibleMessages.filter(({ msg }) => msg.role === "user" && !isCompactionReplayUser(msg)),
  );
  const USER_MESSAGE_COLLAPSE_LENGTH = 800;
  const USER_MESSAGE_COLLAPSE_LINES = 8;

  function cancelEdit() {
    editingMsgId = null;
    editingText = "";
    removedAttachmentPaths = new Set();
    removedContextKeys = new Set();
  }

  // Editing is local to this message list. Do not carry it into another
  // conversation when the shared component receives a new active ID.
  $effect(() => {
    activeConvId;
    cancelEdit();
    readingTurnKey = null;
  });

  function contextKey(context: UserMessageContext): string {
    return `${context.sourceMessageId ?? ""}\u0000${context.text}`;
  }

  function commitEdit(
    convId: string,
    userMsgIdx: number,
    attachments: ChatAttachment[],
    contexts: UserMessageContext[],
  ) {
    const text = editingText;
    const retainedAttachments = attachments.filter(
      (attachment) => !removedAttachmentPaths.has(attachment.path),
    );
    const retainedContexts = contexts.filter(
      (context) => !removedContextKeys.has(contextKey(context)),
    );
    cancelEdit();
    onCommitEdit(convId, userMsgIdx, text, retainedAttachments, retainedContexts);
  }

  function switchBranch(parentKey: string, targetIdx: number) {
    // The selected branch can render a different version of the same turn.
    // Never carry an editor from the previous branch into that new message.
    cancelEdit();
    onSwitchBranch(activeConvId!, parentKey, targetIdx);
  }

  async function startEdit(msg: ChatMessage) {
    if (!editable || isStreaming) return;
    editingMsgId = msg.id;
    editingText = msg.content;
    removedAttachmentPaths = new Set();
    removedContextKeys = new Set();
    await tick();
    editingTextarea?.focus();
  }

  async function stageAttachmentRemoval(msg: ChatMessage, attachmentPath: string) {
    if (isStreaming) return;
    if (editingMsgId !== msg.id) {
      editingMsgId = msg.id;
      editingText = msg.content;
      removedAttachmentPaths = new Set();
      removedContextKeys = new Set();
    }
    removedAttachmentPaths = new Set([...removedAttachmentPaths, attachmentPath]);
    await tick();
    editingTextarea?.focus();
  }

  async function stageContextRemoval(msg: ChatMessage, context: UserMessageContext) {
    if (isStreaming) return;
    if (editingMsgId !== msg.id) {
      editingMsgId = msg.id;
      editingText = msg.content;
      removedAttachmentPaths = new Set();
      removedContextKeys = new Set();
    }
    removedContextKeys = new Set([...removedContextKeys, contextKey(context)]);
    await tick();
    editingTextarea?.focus();
  }

  function selectionOwner(node: Node | null): HTMLElement | null {
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest<HTMLElement>("[data-selection-source-message-id]") ?? null;
  }

  function captureAssistantSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !messagesRoot) {
      selectionPopover = null;
      return;
    }
    const anchorOwner = selectionOwner(selection.anchorNode);
    const focusOwner = selectionOwner(selection.focusNode);
    const sourceMessageId = anchorOwner?.dataset.selectionSourceMessageId;
    if (
      !anchorOwner ||
      !focusOwner ||
      !sourceMessageId ||
      focusOwner.dataset.selectionSourceMessageId !== sourceMessageId ||
      !messagesRoot.contains(anchorOwner) ||
      !messagesRoot.contains(focusOwner)
    ) {
      selectionPopover = null;
      return;
    }
    const text = selectionTextWithMath(selection);
    if (!text) {
      selectionPopover = null;
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) {
      selectionPopover = null;
      return;
    }
    selectionPopover = {
      text,
      sourceMessageId,
      left: Math.min(window.innerWidth - 72, Math.max(72, rect.left + rect.width / 2)),
      top: Math.max(8, rect.top - 8),
    };
  }

  function addSelectedQuote() {
    if (!selectionPopover) return;
    onAddQuote({
      type: "quote",
      text: selectionPopover.text,
      sourceMessageId: selectionPopover.sourceMessageId,
    });
    selectionPopover = null;
    window.getSelection()?.removeAllRanges();
  }

  onMount(() => {
    const closeOnViewportChange = () => (selectionPopover = null);
    const closeOnCollapsedSelection = () => {
      if (window.getSelection()?.isCollapsed) selectionPopover = null;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") selectionPopover = null;
    };
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("selectionchange", closeOnCollapsedSelection);
    return () => {
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("selectionchange", closeOnCollapsedSelection);
    };
  });

  function isLongUserMessage(content: string) {
    return (
      content.length > USER_MESSAGE_COLLAPSE_LENGTH ||
      content.split("\n").length > USER_MESSAGE_COLLAPSE_LINES
    );
  }

  function isUserMessageCollapsed(msg: ChatMessage) {
    return isLongUserMessage(msg.content) && !expandedUserMessageIds.has(msg.id);
  }

  function toggleUserMessage(msgId: string) {
    const next = new Set(expandedUserMessageIds);
    if (next.has(msgId)) next.delete(msgId);
    else next.add(msgId);
    expandedUserMessageIds = next;
  }

  // A live row and its finalized durable message intentionally share the same
  // assistant ID. Capture its open thinking blocks by stable item key, but do
  // not let toggle events from the outgoing live DOM mutate this handoff
  // snapshot. The durable component consumes it only as its initial state.
  $effect(() => {
    if (!isStreaming || !currentStreamMessageId) return;
    const next = new Set(streamedOpenThinkingItemKeys);
    let changed = false;
    for (const segment of currentSegments) {
      if (segment.kind !== "item" || segment.item.type !== "thinking") continue;
      const itemKey = `${currentStreamMessageId}-${segment.startIndex}`;
      if (!next.has(itemKey)) {
        next.add(itemKey);
        changed = true;
      }
    }
    if (changed) streamedOpenThinkingItemKeys = next;
  });

  function formatDuration(milliseconds: number) {
    if (milliseconds < 1_000) return `${Math.max(0, Math.round(milliseconds))}ms`;
    if (milliseconds < 60_000)
      return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`;
    const seconds = Math.round(milliseconds / 1_000);
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  function runTiming(msg: ChatMessage, msgIdx: number, turnMessages: ChatMessage[]) {
    const turn = turnMessages.find((message) => message.turn)?.turn;
    if (turn) {
      if (turn.duration_ms == null) return null;
      return {
        firstToken:
          turn.first_token_at != null
            ? formatDuration(turn.first_token_at - turn.started_at)
            : null,
        total: formatDuration(turn.duration_ms),
      };
    }
    if (!msg.completedAt) return null;
    const userMessage = [...messages.slice(0, msgIdx)]
      .reverse()
      .find((item) => item.role === "user" && !isCompactionReplayUser(item));
    if (!userMessage) return null;
    return {
      firstToken: msg.firstTokenAt
        ? formatDuration(msg.firstTokenAt - userMessage.timestamp)
        : null,
      total: formatDuration(msg.completedAt - userMessage.timestamp),
    };
  }

  function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function userIndexTitle(content: string, index: number) {
    const text = content.trim().replace(/\s+/g, " ");
    return text ? `${index + 1}. ${text.slice(0, 80)}` : `${index + 1}`;
  }

  function scrollToMessage(id: string) {
    transcriptList?.scrollToKey(id);
  }

  function entryAssistantMessages(entry: MessageRenderEntry): ChatMessage[] {
    if (entry.kind === "assistant_turn") {
      return entry.messages.filter((message) => message.role === "assistant");
    }
    if (entry.kind === "message" && entry.msg.role === "assistant") return [entry.msg];
    return [];
  }

  function assistantItems(entry: MessageRenderEntry): StreamItem[] {
    if (entry.kind === "live_stream") return currentStreamItems;
    if (entry.kind === "assistant_turn") {
      return entry.messages.flatMap((message) => {
        if (isCompactionReplayUser(message)) return [{ type: "compaction_boundary" as const }];
        if (message.role !== "assistant") return [];
        return message.items?.length
          ? message.items
          : message.content
            ? [{ type: "text" as const, content: message.content }]
            : [];
      });
    }
    return entryAssistantMessages(entry).flatMap((message) =>
      message.items?.length
        ? message.items
        : message.content
          ? [{ type: "text" as const, content: message.content }]
          : [],
    );
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
</script>

<div
  class="messages-inner"
  bind:this={messagesRoot}
  onpointerup={captureAssistantSelection}
  role="presentation"
  class:messages-inner-empty={visibleMessages.length === 0 && !isStreaming}
  class:messages-inner-responsive-double={messageLayout === "responsive_double"}
  style="padding-bottom: {paddingBottom}px; --user-message-collapse-lines: {USER_MESSAGE_COLLAPSE_LINES}"
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
        <Tooltip text={userIndexTitle(item.msg.content, index)} side="left">
          {#snippet trigger(props)}
            <button
              {...props}
              type="button"
              aria-label={userIndexTitle(item.msg.content, index)}
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
    {tailAnchorToken}
    {onTailAnchorSettled}
  >
    {#snippet children(entry)}
      {#if isAssistantTurnEntry(entry)}
        {@const turnMessages = entryAssistantMessages(entry)}
        {@const assistantMsg = turnMessages.at(-1) ?? null}
        {@const assistantMsgIdx =
          entry.kind === "assistant_turn"
            ? entry.finalIndex
            : entry.kind === "message"
              ? entry.index
              : -1}
        {@const renderedAssistantItems = assistantItems(entry)}
        {@const turnMetadata = turnMessages.find((message) => message.turn)?.turn}
        {@const turnIsTerminal = turnMetadata
          ? ["completed", "cancelled", "failed"].includes(turnMetadata.status)
          : !isStreaming}
        {@const assistantSegments = groupStreamItems(renderedAssistantItems)}
        {@const assistantIsStreaming = entry.kind === "live_stream"}
        {@const { processSegments, finalSegments } = partitionAssistantSegments(assistantSegments)}
        {@const isRerunnable =
          assistantMsg !== null &&
          assistantMsgIdx >= 0 &&
          !isStreaming &&
          turnIsTerminal &&
          Boolean(assistantMsg.checkpointId) &&
          Boolean(activeTree?.nodes[assistantMsg.checkpointId!])}
        {@const copyableOutput = finalAssistantOutput(turnMessages)}
        {@const showAssistantActions =
          !isStreaming &&
          turnIsTerminal &&
          (isRerunnable || Boolean(copyableOutput) || renderedAssistantItems.length > 0)}
        {@const timing = assistantMsg
          ? runTiming(assistantMsg, assistantMsgIdx, turnMessages)
          : null}
        {@const turnSuggestions = assistantMsg
          ? (followUpSuggestionsByMessageId[assistantMsg.id] ?? [])
          : []}
        {#snippet renderAssistantSegments(segments: StreamItemSegment[])}
          {#each segments as segment (`${entry.key}-${segment.startIndex}`)}
            {#if segment.kind === "tool_group"}
              <div
                class="stream-item message-record"
                data-stream-item={`${entry.key}-${segment.startIndex}`}
              >
                <ToolCallGroup
                  items={segment.items}
                  isStreaming={assistantIsStreaming}
                  {htmlPreviewConfig}
                  {onSubmitUserInput}
                  {onCancelUserInput}
                />
              </div>
            {:else}
              <StreamItemRenderer
                item={segment.item}
                itemKey={`${entry.key}-${segment.startIndex}`}
                messageId={segment.startIndex === 0 && assistantMsg ? assistantMsg.id : undefined}
                selectionSourceMessageId={assistantMsg?.id}
                isLastText={segment.item.type === "text" &&
                  (assistantIsStreaming
                    ? segment.startIndex === renderedAssistantItems.length - 1
                    : !renderedAssistantItems
                        .slice(segment.startIndex + 1)
                        .some((next) => next.type === "text"))}
                isStreaming={assistantIsStreaming}
                debugCheckpointId={debugMode && isRerunnable
                  ? assistantMsg?.checkpointId
                  : undefined}
                initialThinkingOpen={streamedOpenThinkingItemKeys.has(
                  `${entry.key}-${segment.startIndex}`,
                )}
                {shikiTheme}
                {mermaidConfig}
                {htmlPreviewConfig}
                {onSubmitUserInput}
                {onCancelUserInput}
              />
            {/if}
          {/each}
        {/snippet}
        {#if processSegments.length > 0 && (assistantIsStreaming || finalSegments.length > 0)}
          <ProcessRecordGroup isStreaming={assistantIsStreaming} duration={timing?.total}>
            {@render renderAssistantSegments(processSegments)}
          </ProcessRecordGroup>
          {@render renderAssistantSegments(finalSegments)}
        {:else}
          {@render renderAssistantSegments(assistantSegments)}
        {/if}
        {#if assistantIsStreaming && memoryRetrievalStage}
          <div class="thinking-status memory-retrieval-status" role="status" aria-live="polite">
            <span class="thinking-dot"></span>
            <span>{memoryRetrievalLabel(memoryRetrievalStage)}</span>
            {#if memoryRetrievalCanSkip}
              <button class="skip-memory-btn" type="button" onclick={onSkipMemoryRetrieval}
                >{$t("skipMemoryRetrieval")}</button
              >
            {/if}
          </div>
        {:else if assistantIsStreaming && isAwaitingStreamOutput}
          <div class="thinking-status" role="status" aria-live="polite">
            <span class="thinking-dot"></span>
            <span>{$t("awaitingStreamOutput")}</span>
          </div>
        {/if}
        {#if assistantMsg}
          {#if isRerunnable || timing || assistantMsg.timestamp > 0 || renderedAssistantItems.length > 0}
            <div
              class="msg-footer-row message-record pagination-footer"
              id={renderedAssistantItems.length > 0 ? undefined : `message-${assistantMsg.id}`}
              data-message-id={renderedAssistantItems.length > 0 ? undefined : assistantMsg.id}
            >
              {#if showAssistantActions}
                <div class="msg-actions">
                  {#if isRerunnable}
                    <button
                      class="msg-action-btn"
                      aria-label={$t("rerun")}
                      onclick={() => onReExecute(activeConvId!, assistantMsgIdx)}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        width="12"
                        height="12"
                        aria-hidden="true"
                      >
                        <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5M14 2v4h-4" />
                      </svg>
                      <span>{$t("rerun")}</span>
                    </button>
                  {/if}
                  {#if copyableOutput}
                    <button
                      class="msg-action-btn"
                      aria-label={$t("copyFinalAnswer")}
                      onclick={() => copyAssistantOutput(entry.key, copyableOutput)}
                    >
                      {#if copiedAssistantMessageId === entry.key}
                        <svg
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.6"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          width="12"
                          height="12"
                          aria-hidden="true"
                        >
                          <path d="m3 8.5 3 3 7-7" />
                        </svg>
                        <span>{$t("copied")}</span>
                      {:else}
                        <svg
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.6"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          width="12"
                          height="12"
                          aria-hidden="true"
                        >
                          <rect x="5" y="5" width="8" height="8" rx="1.5" />
                          <path
                            d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"
                          />
                        </svg>
                        <span>{$t("copyFinalAnswer")}</span>
                      {/if}
                    </button>
                  {/if}
                  {#if renderedAssistantItems.length > 0}
                    <button
                      class="msg-action-btn"
                      aria-label={$t("openBookMode")}
                      onclick={() => (readingTurnKey = entry.key)}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.4"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        width="12"
                        height="12"
                        aria-hidden="true"
                      >
                        <path d="M2.5 3.2c1.7-.5 3.5-.1 5.5 1.2v8.4c-2-1.3-3.8-1.7-5.5-1.2V3.2Z" />
                        <path d="M13.5 3.2c-1.7-.5-3.5-.1-5.5 1.2v8.4c2-1.3 3.8-1.7 5.5-1.2V3.2Z" />
                      </svg>
                      <span>{$t("bookMode")}</span>
                    </button>
                  {/if}
                </div>
              {/if}
              {#if timing}
                <span class="run-timing">
                  {#if timing.firstToken}{$t("firstTokenTime")} {timing.firstToken} ·
                  {/if}{$t("totalRunTime")}
                  {timing.total}
                </span>
              {/if}
              {#if assistantMsg.timestamp > 0}<span class="ts"
                  >{formatTime(assistantMsg.timestamp)}</span
                >{/if}
            </div>
          {/if}
          {#if !isStreaming && turnIsTerminal && assistantMsg.id === suggestionHostMessageId && turnSuggestions.length === 3}
            <div class="message-record pagination-footer">
              <FollowUpSuggestions suggestions={turnSuggestions} onSelect={onSelectSuggestion} />
            </div>
          {/if}
        {/if}
      {:else if entry.kind === "tool_group"}
        {@const firstMessage = entry.messages[0]}
        <div
          class="stream-item message-record"
          id={`message-${firstMessage.id}`}
          data-message-id={firstMessage.id}
        >
          <ToolCallGroup
            items={entry.items}
            {htmlPreviewConfig}
            {onSubmitUserInput}
            {onCancelUserInput}
          />
        </div>
      {:else if entry.kind === "message"}
        {@const msg = entry.msg}
        {@const msgIdx = entry.index}
        {#if isCompactionReplayUser(msg)}
          <div
            class="compaction-divider message-record"
            id={`message-${msg.id}`}
            data-message-id={msg.id}
            role="separator"
          >
            <span>{$t("compactionCompleted")}</span>
          </div>
        {:else if msg.role === "user"}
          {@const siblingInfo = activeConvId
            ? getSiblingInfoForUserMessage(activeTree, msg.id)
            : null}
          {@const attachmentItems = msg.items?.filter((item) => item.type === "attachment") ?? []}
          {@const attachments = attachmentItems.map((item) => item.attachment)}
          {@const quoteItems = msg.items?.filter((item) => item.type === "quote") ?? []}
          {@const contexts = quoteItems.map((item) => item.context)}
          {@const isEditingThisMessage = editingMsgId === msg.id}
          {@const retainedAttachmentCount = attachments.filter(
            (attachment) => !removedAttachmentPaths.has(attachment.path),
          ).length}
          {@const retainedContextCount = contexts.filter(
            (context) => !removedContextKeys.has(contextKey(context)),
          ).length}
          {@const isDirty =
            isEditingThisMessage &&
            (editingText !== msg.content ||
              removedAttachmentPaths.size > 0 ||
              removedContextKeys.size > 0)}
          {@const canSubmitEdit =
            isDirty &&
            (editingText.trim().length > 0 ||
              retainedAttachmentCount > 0 ||
              retainedContextCount > 0)}
          <div class="user-msg message-record" id={`message-${msg.id}`} data-message-id={msg.id}>
            {#if contexts.length > 0}
              <div class="user-contexts">
                {#each contexts.filter((context) => !isEditingThisMessage || !removedContextKeys.has(contextKey(context))) as context (contextKey(context))}
                  <UserQuote
                    {context}
                    onRemove={!editable || isStreaming || !isEditingThisMessage
                      ? undefined
                      : () => stageContextRemoval(msg, context)}
                  />
                {/each}
              </div>
            {/if}
            {#if editingMsgId === msg.id}
              <textarea
                bind:this={editingTextarea}
                class="user-content-edit"
                value={editingText}
                readonly={isStreaming}
                oninput={(e) => {
                  editingText = e.currentTarget.value;
                }}
                onkeydown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && canSubmitEdit) {
                    e.preventDefault();
                    commitEdit(activeConvId!, msgIdx, attachments, contexts);
                  } else if (e.key === "Escape") {
                    cancelEdit();
                    (e.currentTarget as HTMLTextAreaElement).blur();
                  }
                }}></textarea>
            {:else if editable}
              <Tooltip text={$t("editMsgTitle")}>
                {#snippet trigger(props)}
                  <div
                    {...props}
                    class="user-content"
                    class:collapsed={isUserMessageCollapsed(msg)}
                    role="button"
                    tabindex="0"
                    aria-label={$t("editMsgTitle")}
                    onclick={() => startEdit(msg)}
                    onkeydown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        startEdit(msg);
                      }
                    }}
                  >
                    <span class="user-content-text">{msg.content}</span>
                    <span class="user-edit-hint" aria-hidden="true">
                      <svg
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        width="13"
                        height="13"
                      >
                        <path d="M11.5 2.5a1.4 1.4 0 0 1 2 2L6 12l-3 .75.75-3 7.75-7.25Z" />
                        <path d="m10 4 2 2" />
                      </svg>
                    </span>
                  </div>
                {/snippet}
              </Tooltip>
            {:else}
              <div class="user-content readonly" class:collapsed={isUserMessageCollapsed(msg)}>
                <span class="user-content-text">{msg.content}</span>
              </div>
            {/if}
            {#if attachments.length > 0}
              <div class="user-attachments">
                {#each attachments.filter((attachment) => !isEditingThisMessage || !removedAttachmentPaths.has(attachment.path)) as attachment (attachment.path)}
                  <AttachmentPreview
                    {attachment}
                    loadPreview={attachmentPreviewLoader}
                    onRemove={!editable || isStreaming
                      ? undefined
                      : () => stageAttachmentRemoval(msg, attachment.path)}
                  />
                {/each}
              </div>
            {/if}
            {#if isLongUserMessage(msg.content) && editingMsgId !== msg.id}
              <button
                class="user-collapse-btn"
                type="button"
                aria-expanded={!isUserMessageCollapsed(msg)}
                onclick={(e) => {
                  e.stopPropagation();
                  toggleUserMessage(msg.id);
                }}
                >{isUserMessageCollapsed(msg) ? $t("expandSection") : $t("collapseSection")}</button
              >
            {/if}
            <div class="edit-actions" class:show={isDirty}>
              <button class="edit-cancel-btn" type="button" onclick={cancelEdit}
                >{$t("cancel")}</button
              >
              <button
                class="edit-confirm-btn"
                type="button"
                disabled={!canSubmitEdit}
                onclick={() => commitEdit(activeConvId!, msgIdx, attachments, contexts)}
                >{$t("send")}</button
              >
            </div>
            <div class="msg-meta-row">
              {#if debugMode && msg.checkpointId}
                <Tooltip text={msg.checkpointId}>
                  <code class="debug-checkpoint">checkpoint: {msg.checkpointId}</code>
                </Tooltip>
              {/if}
              {#if siblingInfo}
                <div class="msg-branch-nav">
                  <Tooltip text={isStreaming ? $t("branchLockedWhileStreaming") : ""}>
                    <button
                      class="branch-nav-btn"
                      disabled={siblingInfo.activeIdx === 0 || isStreaming}
                      onclick={() => switchBranch(siblingInfo.parentKey, siblingInfo.activeIdx - 1)}
                      >‹</button
                    >
                  </Tooltip>
                  <span class="branch-nav-label"
                    >{siblingInfo.activeIdx + 1} / {siblingInfo.siblings.length}</span
                  >
                  <Tooltip text={isStreaming ? $t("branchLockedWhileStreaming") : ""}>
                    <button
                      class="branch-nav-btn"
                      disabled={siblingInfo.activeIdx === siblingInfo.siblings.length - 1 ||
                        isStreaming}
                      onclick={() => switchBranch(siblingInfo.parentKey, siblingInfo.activeIdx + 1)}
                      >›</button
                    >
                  </Tooltip>
                </div>
              {/if}
              {#if msg.timestamp > 0}<span class="ts">{formatTime(msg.timestamp)}</span>{/if}
            </div>
          </div>
        {/if}
      {/if}
    {/snippet}
  </TranscriptList>
</div>

{#if selectionPopover}
  <button
    class="selection-add-button"
    type="button"
    style={`left: ${selectionPopover.left}px; top: ${selectionPopover.top}px`}
    onpointerdown={(event) => event.preventDefault()}
    onclick={addSelectedQuote}
  >
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M3 8h7M3 11.5h5" /></svg>
    <span>{$t("addSelectionToChat")}</span>
  </button>
{/if}

{#if readingTurnKey}
  <AgentBookReader
    turns={bookTurns}
    activeKey={readingTurnKey}
    {shikiTheme}
    {mermaidConfig}
    {htmlPreviewConfig}
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

  .thinking-status {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 7px;
    min-height: 28px;
    margin: 2px 0 8px;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .thinking-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--primary);
    animation: thinking-pulse 1.2s ease-in-out infinite;
  }

  .skip-memory-btn {
    margin-left: 3px;
    padding: 2px 7px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    cursor: pointer;
  }

  .skip-memory-btn:hover:not(:disabled) {
    border-color: var(--primary);
    color: var(--text-primary);
  }

  .skip-memory-btn:disabled {
    cursor: default;
    opacity: 0.55;
  }

  @keyframes thinking-pulse {
    0%,
    100% {
      opacity: 0.35;
      transform: scale(0.82);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .thinking-dot {
      animation: none;
    }
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

  .debug-context code,
  .debug-checkpoint {
    font-family: var(--font-mono, ui-monospace, monospace);
    overflow-wrap: anywhere;
  }

  .debug-checkpoint {
    margin-right: auto;
    color: var(--text-muted);
    font-size: 10px;
  }

  .user-message-index {
    position: fixed;
    top: 50%;
    right: calc(16px + var(--flow-panel-index-offset, 0px));
    z-index: 12;
    display: flex;
    width: 28px;
    max-height: min(52vh, 360px);
    transform: translateY(-50%);
    flex-direction: column;
    align-items: flex-end;
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
    justify-content: flex-end;
    width: 28px;
    min-height: 18px;
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    transition: transform 0.12s ease;
  }

  .user-message-index button:hover,
  .user-message-index button:focus-visible {
    outline: none;
    transform: translateX(-2px);
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
      width 0.12s ease,
      background 0.12s ease,
      transform 0.12s ease;
  }

  .user-message-index button:hover .index-mark,
  .user-message-index button:focus-visible .index-mark {
    width: 28px;
    background: var(--text-muted);
    transform: scaleY(1.6);
  }

  @media (max-width: 720px) {
    .user-message-index {
      right: calc(8px + var(--flow-panel-index-offset, 0px));
      width: 38px;
    }
  }

  .user-msg {
    align-self: flex-end;
    max-width: 72%;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .user-attachments {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 6px;
  }

  .user-contexts {
    display: flex;
    width: min(100%, 680px);
    flex-direction: column;
    align-items: flex-end;
    gap: 5px;
    margin-bottom: 6px;
  }

  .selection-add-button {
    position: fixed;
    z-index: 80;
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border: 0;
    border-radius: 9px;
    background: var(--control-surface);
    color: var(--text);
    font: inherit;
    font-size: 12px;
    line-height: 18px;
    box-shadow: var(--raised-shadow);
    cursor: pointer;
    transform: translate(-50%, -100%);
    -webkit-backdrop-filter: blur(18px) saturate(1.18);
    backdrop-filter: blur(18px) saturate(1.18);
  }

  .selection-add-button:hover {
    background: color-mix(in srgb, var(--control-surface) 86%, var(--primary) 14%);
  }

  .selection-add-button:focus-visible {
    outline: none;
    box-shadow: var(--raised-shadow), var(--focus-ring);
  }

  .selection-add-button svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
  }

  .user-content-edit {
    display: block;
    width: auto;
    max-width: 100%;
    box-sizing: border-box;
    background: var(--control-surface);
    border: 0;
    border-radius: 18px;
    padding: 9px 14px;
    margin: 0;
    font-family: inherit;
    font-size: 14px;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text);
    line-height: 1.47;
    letter-spacing: -0.374px;
    text-align: left;
    resize: none;
    outline: none;
    overflow: hidden;
    field-sizing: content;
    -webkit-backdrop-filter: blur(12px) saturate(1.05);
    backdrop-filter: blur(12px) saturate(1.05);
    box-shadow: none;
    transition: box-shadow 0.15s;
  }
  .user-content {
    position: relative;
    width: auto;
    max-width: 100%;
    box-sizing: border-box;
    padding: 9px 14px;
    border: 0;
    border-radius: 18px;
    background: var(--control-surface);
    color: var(--text);
    font-size: 14px;
    line-height: 1.47;
    letter-spacing: -0.374px;
    cursor: text;
    text-align: left;
    outline: none;
    -webkit-backdrop-filter: blur(12px) saturate(1.05);
    backdrop-filter: blur(12px) saturate(1.05);
    box-shadow: none;
  }
  .user-edit-hint {
    position: absolute;
    top: 50%;
    right: calc(100% + 7px);
    display: inline-flex;
    width: 24px;
    height: 24px;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: var(--control-surface);
    color: var(--text-muted);
    box-shadow: var(--control-shadow);
    opacity: 0;
    pointer-events: none;
    transform: translate(3px, -50%);
    transition:
      opacity 0.12s ease,
      transform 0.12s ease,
      color 0.12s ease;
  }
  .user-content:hover .user-edit-hint,
  .user-content:focus-visible .user-edit-hint {
    color: var(--text);
    opacity: 1;
    transform: translate(0, -50%);
  }
  .user-content:focus-visible {
    box-shadow: var(--focus-ring);
  }
  .user-content.readonly {
    cursor: default;
  }
  .user-content-text {
    display: block;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .user-content.collapsed .user-content-text {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--user-message-collapse-lines);
    line-clamp: var(--user-message-collapse-lines);
    overflow: hidden;
  }
  .user-content.collapsed::after {
    content: "";
    position: absolute;
    right: 0;
    bottom: 9px;
    width: 64px;
    height: 2.2em;
    background: linear-gradient(90deg, transparent, var(--control-surface) 72%);
    pointer-events: none;
  }
  .user-collapse-btn {
    margin-top: 4px;
    padding: 2px 6px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .user-collapse-btn:hover {
    background: var(--surface2);
    color: var(--text);
  }
  .user-content-edit:not(:read-only):focus {
    box-shadow: var(--focus-ring);
  }
  .user-content-edit:read-only {
    cursor: default;
  }

  .edit-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    overflow: hidden;
    max-height: 0;
    opacity: 0;
    transform: translateY(6px);
    transition:
      max-height 0.2s ease,
      opacity 0.18s ease,
      transform 0.18s ease,
      margin-top 0.18s ease;
    pointer-events: none;
  }
  .edit-actions.show {
    max-height: 40px;
    margin-top: 5px;
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
  .edit-cancel-btn,
  .edit-confirm-btn {
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    border: 0;
    background: var(--surface2);
    color: var(--text-muted);
    transition:
      background 0.1s,
      color 0.1s;
  }
  .edit-confirm-btn {
    background: var(--primary);
    color: white;
  }
  .edit-cancel-btn:hover {
    background: var(--border);
    color: var(--text);
  }
  .edit-confirm-btn:hover:not(:disabled) {
    background: var(--primary-hover);
  }
  .edit-confirm-btn:disabled {
    cursor: default;
    opacity: 0.45;
  }

  .msg-meta-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  .msg-meta-row .ts {
    margin-top: 0;
  }

  .msg-branch-nav {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--text-muted);
    font-size: 11px;
    user-select: none;
  }
  .branch-nav-btn {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 0;
    transition:
      background 0.1s,
      color 0.1s;
  }
  .branch-nav-btn:hover:not(:disabled) {
    background: var(--surface2);
    color: var(--text);
  }
  .branch-nav-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .branch-nav-label {
    min-width: 32px;
    text-align: center;
    letter-spacing: 0.2px;
  }

  .msg-footer-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
  }
  .msg-footer-row .ts {
    margin-top: 0;
  }

  .msg-actions {
    display: flex;
    gap: 6px;
  }
  .run-timing {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1;
    user-select: none;
  }
  .msg-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    border-radius: 5px;
    font-size: 11px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
  }
  .msg-action-btn {
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s;
  }
  .msg-action-btn:hover {
    background: var(--surface2);
    color: var(--text);
  }

  .ts {
    font-size: 10px;
    color: var(--text-muted);
    margin-top: 4px;
    display: block;
    user-select: none;
  }

  .compaction-divider {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 22px 0;
    color: var(--text-muted);
    font-size: 11px;
  }
  .compaction-divider::before,
  .compaction-divider::after {
    content: "";
    height: 1px;
    flex: 1;
    background: color-mix(in srgb, var(--border) 75%, transparent);
  }
</style>
