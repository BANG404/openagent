<script lang="ts">
  import StreamItemRenderer from "../StreamItemRenderer.svelte";
  import ToolCallGroup from "../ToolCallGroup.svelte";
  import ProcessRecordGroup from "../ProcessRecordGroup.svelte";
  import FollowUpSuggestions from "../FollowUpSuggestions.svelte";
  import { t } from "$lib/i18n";
  import { finalAssistantOutput } from "$lib/assistantOutput";
  import {
    assistantTurnStatus,
    latestTurnMetadata,
    shouldShowProcessRecords,
    thinkingRecordOpen,
  } from "$lib/processRecordState";
  import {
    groupStreamItems,
    isAssistantTurnEntry,
    partitionAssistantSegments,
    type MessageRenderEntry,
    type StreamItemSegment,
  } from "$lib/toolCallGroups";
  import {
    entryAssistantMessages,
    assistantItems,
    runTiming,
    cacheUsageForMessage,
    formatTime,
    formatTokens,
    formatPercent,
    formatDuration,
  } from "$lib/transcript/assistantContent";
  import type { ConvTree } from "$lib/checkpointTree";
  import type { ChatMemoryRetrievalStage } from "$lib/openagent";
  import type { ChatMessage, StreamItem, FileChange, TaskTokenUsage } from "$lib/types";
  import type { MermaidConfig } from "$lib/mermaidTheme";

  interface Props {
    entry: MessageRenderEntry;
    messages: ChatMessage[];
    currentStreamItems: StreamItem[];
    activeConvId: string | null;
    activeBranchId: string | null;
    activeTree: ConvTree | undefined;
    debugMode: boolean;
    pendingCheckpointId: string | null;
    streamedOpenThinkingItemKey: string | null;
    shikiTheme: string;
    mermaidConfig: MermaidConfig;
    fileChanges: FileChange[];
    taskUsagesByCheckpointId: Record<string, TaskTokenUsage[]>;
    memoryRetrievalStage: ChatMemoryRetrievalStage | null;
    memoryRetrievalCanSkip: boolean;
    isAwaitingStreamOutput: boolean;
    streamStartedAt: number | null;
    followUpSuggestionsByMessageId: Record<string, string[]>;
    suggestionHostMessageId: string | null;
    copiedAssistantMessageId: string | null;
    loadingBookTurnKey: string | null;
    onOpenBook: (key: string) => void | Promise<void>;
    copyAssistantOutput: (key: string, output: string) => void | Promise<void>;
    onReExecute: (convId: string, assistantMsgIdx: number) => void;
    onSubmitUserInput: (requestId: string, values: Record<string, unknown>) => void;
    onCancelUserInput: (requestId: string) => void;
    onSkipMemoryRetrieval: () => void;
    onSelectSuggestion: (suggestion: string) => void | Promise<void>;
  }
  let {
    entry,
    messages,
    currentStreamItems,
    activeConvId,
    activeBranchId,
    activeTree,
    debugMode,
    pendingCheckpointId,
    streamedOpenThinkingItemKey,
    shikiTheme,
    mermaidConfig,
    fileChanges,
    taskUsagesByCheckpointId,
    memoryRetrievalStage,
    memoryRetrievalCanSkip,
    isAwaitingStreamOutput,
    streamStartedAt,
    followUpSuggestionsByMessageId,
    suggestionHostMessageId,
    copiedAssistantMessageId,
    loadingBookTurnKey,
    onOpenBook,
    copyAssistantOutput,
    onReExecute,
    onSubmitUserInput,
    onCancelUserInput,
    onSkipMemoryRetrieval,
    onSelectSuggestion,
  }: Props = $props();

  let liveNow = $state(Date.now());
  let liveStart = $state(Date.now());
  $effect(() => {
    if (entry.kind !== "live_stream") return;
    // The transport's clock survives switching conversations and model rounds.
    // Paired clients can instead recover the logical Turn clock from history.
    liveStart =
      streamStartedAt ??
      messages.findLast((message) => message.turn?.response_message_id === entry.key)?.turn
        ?.started_at ??
      messages.findLast(
        (message) => message.role === "user" && !message.tags?.includes("context_compaction"),
      )?.timestamp ??
      Date.now();
    liveNow = Date.now();
    const timer = window.setInterval(() => (liveNow = Date.now()), 1_000);
    return () => window.clearInterval(timer);
  });

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
</script>

{#if isAssistantTurnEntry(entry)}
  {@const turnMessages = entryAssistantMessages(entry)}
  {@const assistantMsg = turnMessages.at(-1) ?? null}
  {@const assistantMsgIdx =
    entry.kind === "assistant_turn"
      ? entry.finalIndex
      : entry.kind === "message"
        ? entry.index
        : -1}
  {@const renderedAssistantItems = assistantItems(
    entry,
    currentStreamItems,
    activeConvId,
    activeBranchId,
  )}
  {@const assistantIsStreaming = entry.kind === "live_stream"}
  {@const hasModelResponse = renderedAssistantItems.some(
    (item) =>
      item.type === "tool_call" ||
      ((item.type === "text" || item.type === "thinking") && item.content.length > 0),
  )}
  {@const showRunningStatus =
    assistantIsStreaming && !memoryRetrievalStage && (!isAwaitingStreamOutput || hasModelResponse)}
  {@const turnMetadata = latestTurnMetadata(turnMessages)}
  {@const turnStatus = assistantTurnStatus(turnMessages, assistantIsStreaming)}
  {@const turnSuggestionHostMessageId =
    turnMetadata?.response_message_id ?? assistantMsg?.id ?? null}
  {@const turnIsTerminal = ["completed", "cancelled", "failed"].includes(turnStatus)}
  {@const assistantSegments = groupStreamItems(renderedAssistantItems)}
  {@const { processSegments, finalSegments } = partitionAssistantSegments(
    assistantSegments,
    turnStatus,
  )}
  {@const showProcessRecords = shouldShowProcessRecords(turnStatus, processSegments.length)}
  {@const isRerunnable =
    assistantMsg !== null &&
    assistantMsgIdx >= 0 &&
    !assistantIsStreaming &&
    turnIsTerminal &&
    Boolean(assistantMsg.checkpointId) &&
    Boolean(activeTree?.nodes[assistantMsg.checkpointId!])}
  {@const copyableOutput = finalAssistantOutput(turnMessages)}
  {@const showAssistantActions =
    !assistantIsStreaming &&
    turnIsTerminal &&
    (isRerunnable || Boolean(copyableOutput) || renderedAssistantItems.length > 0)}
  {@const timing = assistantMsg
    ? runTiming(assistantMsg, assistantMsgIdx, turnMessages, messages)
    : null}
  {@const cacheUsage = assistantMsg
    ? cacheUsageForMessage(assistantMsg, taskUsagesByCheckpointId)
    : null}
  {@const turnSuggestions = turnSuggestionHostMessageId
    ? (followUpSuggestionsByMessageId[turnSuggestionHostMessageId] ?? [])
    : []}
  {#snippet renderAssistantSegments(segments: StreamItemSegment[])}
    {#each segments as segment, segmentIndex (`${entry.key}-${segment.startIndex}`)}
      {#if segment.kind === "tool_group"}
        <div
          class="stream-item message-record"
          data-stream-item={`${entry.key}-${segment.startIndex}`}
        >
          <ToolCallGroup
            items={segment.items}
            isStreaming={assistantIsStreaming}
            {fileChanges}
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
          debugCheckpointId={debugMode
            ? (assistantMsg?.checkpointId ??
              (assistantIsStreaming ? (pendingCheckpointId ?? undefined) : undefined))
            : undefined}
          thinkingOpen={thinkingRecordOpen(
            segmentIndex === segments.length - 1,
            turnStatus,
            streamedOpenThinkingItemKey === `${entry.key}-${segment.startIndex}`,
          )}
          {shikiTheme}
          {mermaidConfig}
          {fileChanges}
          {onSubmitUserInput}
          {onCancelUserInput}
        />
      {/if}
    {/each}
  {/snippet}
  <ProcessRecordGroup
    grouped={showProcessRecords}
    running={showRunningStatus}
    duration={showRunningStatus ? formatDuration(Math.max(0, liveNow - liveStart)) : timing?.total}
  >
    {@render renderAssistantSegments(processSegments)}
  </ProcessRecordGroup>
  {@render renderAssistantSegments(finalSegments)}
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
  {:else if assistantIsStreaming && isAwaitingStreamOutput && !hasModelResponse}
    <div class="thinking-status" role="status" aria-live="polite">
      <span class="thinking-dot"></span>
      <span>{$t("awaitingStreamOutput")}</span>
    </div>
  {/if}
  {#if assistantMsg}
    {#if isRerunnable || timing || cacheUsage || assistantMsg.timestamp > 0 || renderedAssistantItems.length > 0}
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
                disabled={loadingBookTurnKey === entry.key}
                aria-busy={loadingBookTurnKey === entry.key}
                onclick={() => onOpenBook(entry.key)}
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
        {#if cacheUsage?.kind === "available"}
          <span class="cache-usage">
            {$t("cacheHit")}
            {formatPercent(cacheUsage.readRate)} · {formatTokens(cacheUsage.cachedTokens)}
            {$t("cachedTokens")}
            {#if cacheUsage.writtenTokens > 0}
              · {$t("cacheWrite")} {formatPercent(cacheUsage.writeRate)}
            {/if}
          </span>
        {/if}
        {#if assistantMsg.timestamp > 0}<span class="ts">{formatTime(assistantMsg.timestamp)}</span
          >{/if}
      </div>
    {/if}
    {#if !assistantIsStreaming && turnIsTerminal && turnSuggestionHostMessageId === suggestionHostMessageId && turnSuggestions.length === 3}
      <div class="message-record pagination-footer">
        <FollowUpSuggestions suggestions={turnSuggestions} onSelect={onSelectSuggestion} />
      </div>
    {/if}
  {/if}
{/if}

<style>
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
    animation: thinking-pulse 1.8s ease-in-out infinite;
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
    background: var(--interactive-state-bg);
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
      opacity: 0.55;
      transform: scale(0.9);
    }
    50% {
      opacity: 0.85;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .thinking-dot {
      animation: none;
    }
  }

  .msg-footer-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 6px 0 10px;
  }
  .msg-footer-row .ts {
    margin-top: 0;
  }

  .msg-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 6px;
    margin-inline-end: 12px;
  }
  .run-timing,
  .cache-usage {
    min-width: 0;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1;
    user-select: none;
    overflow-wrap: anywhere;
  }
  .msg-action-btn {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    border-radius: 5px;
    font-size: 11px;
    white-space: nowrap;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
  }
  .msg-action-btn {
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease-standard),
      color var(--motion-fast) var(--ease-standard);
  }
  .msg-action-btn:hover {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  .ts {
    font-size: 10px;
    color: var(--text-muted);
    margin-top: 4px;
    display: block;
    user-select: none;
  }
</style>
