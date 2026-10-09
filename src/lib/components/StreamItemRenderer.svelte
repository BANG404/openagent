<script lang="ts">
  import { Streamdown } from "svelte-streamdown";
  import Code from "svelte-streamdown/code";
  import ChatMath from "$lib/streamdown/ChatMath.svelte";
  import Mermaid from "$lib/streamdown/Mermaid.svelte";
  import ToolCallCard from "./ToolCallCard.svelte";
  import UserInputForm from "./UserInputForm.svelte";
  import UserInputSummary from "./UserInputSummary.svelte";
  import RetryAttempt from "./RetryAttempt.svelte";
  import ConversationUiRecord from "./ConversationUiRecord.svelte";
  import CompactionStatus from "./CompactionStatus.svelte";
  import { t } from "$lib/i18n";
  import type { FileChange, StreamItem } from "$lib/types";
  import type { MermaidConfig } from "$lib/mermaidTheme";
  import { customExtensions, type ComponentToken } from "$lib/streamdown/extensions";
  import { chatMarkdownTheme } from "$lib/streamdown/chatMarkdownTheme";
  import { runtimeNoticeDetail } from "$lib/runtimeNotice";
  import CustomToken from "$lib/streamdown/CustomToken.svelte";
  import { externalLinks } from "$lib/streamdown/externalLink";
  import { useOpenAgentUiCapabilities } from "$lib/openagent";
  import { latestThinkingLine, normalizeThinkingContent } from "$lib/transcript/thinkingContent";

  interface Props {
    item: StreamItem;
    itemKey: string;
    messageId?: string;
    selectionSourceMessageId?: string;
    isLastText?: boolean;
    debugCheckpointId?: string;
    isStreaming?: boolean;
    shikiTheme: string;
    mermaidConfig: MermaidConfig;
    fileChanges?: FileChange[];
    onSubmitUserInput: (requestId: string, values: Record<string, unknown>) => void;
    onCancelUserInput: (requestId: string) => void;
  }

  let {
    item,
    itemKey,
    messageId,
    selectionSourceMessageId,
    isLastText = false,
    debugCheckpointId,
    isStreaming = false,
    shikiTheme,
    mermaidConfig,
    fileChanges = [],
    onSubmitUserInput,
    onCancelUserInput,
  }: Props = $props();

  let expanded = $state(false);
  let thinkingExpanded = $state(false);
  const thinkingContent = $derived(
    item.type === "thinking" ? normalizeThinkingContent(item.content) : "",
  );
  const thinkingPreview = $derived(latestThinkingLine(thinkingContent));
  const capabilities = useOpenAgentUiCapabilities();
  const streamingTextAnimation = {
    enabled: true,
    type: "fade" as const,
    duration: 360,
    timingFunction: "ease-out" as const,
    tokenize: "word" as const,
    animateOnMount: false,
  };

  function toolArgHint(args: string): string {
    try {
      const first = Object.values(JSON.parse(args))[0];
      if (first !== undefined) {
        const value = String(first);
        return value.length > 48 ? `${value.slice(0, 48)}…` : value;
      }
    } catch {}
    return "";
  }
</script>

{#if item.type === "ui"}
  <ConversationUiRecord
    ui={item.ui}
    messageId={item.messageId}
    conversationId={item.conversationId ?? null}
    branchId={item.branchId ?? null}
  />
{:else if item.type === "text"}
  <div
    class="assistant-msg stream-item message-record"
    id={messageId ? `message-${messageId}` : undefined}
    data-message-id={messageId}
    data-selection-source-message-id={selectionSourceMessageId}
    data-stream-item={itemKey}
    use:externalLinks={capabilities.openUrl}
  >
    <Streamdown
      content={isLastText ? item.content : item.content.trimEnd()}
      animation={isStreaming && isLastText ? streamingTextAnimation : undefined}
      controls={{ table: false }}
      components={{ code: Code, mermaid: Mermaid, math: ChatMath }}
      extensions={customExtensions}
      theme={chatMarkdownTheme}
      {shikiTheme}
      {mermaidConfig}
    >
      {#snippet children({ token })}
        {#if (token as ComponentToken).type === "component"}
          <CustomToken token={token as ComponentToken} isDark={shikiTheme === "github-dark"} />
        {/if}
      {/snippet}
    </Streamdown>
    {#if isLastText && item.content.trim() && debugCheckpointId}
      <span class="checkpoint-btn">{$t("checkpointLabel")}: {debugCheckpointId}</span>
    {/if}
  </div>
{:else if item.type === "thinking"}
  <div
    class="thinking-block stream-item message-record"
    class:thinking-expanded={thinkingExpanded}
    id={messageId ? `message-${messageId}` : undefined}
    data-message-id={messageId}
    data-stream-item={itemKey}
  >
    <button
      type="button"
      class="thinking-summary"
      aria-expanded={thinkingExpanded}
      onclick={() => (thinkingExpanded = !thinkingExpanded)}
    >
      <span class="thinking-marker" aria-hidden="true">{thinkingExpanded ? "▾" : "▸"}</span>
      <span class="thinking-label">{$t("thinking")}</span>
      {#if !thinkingExpanded && thinkingPreview}
        <span class="thinking-preview">{thinkingPreview}</span>
      {/if}
    </button>
    {#if thinkingExpanded}<pre>{thinkingContent}</pre>{/if}
  </div>
{:else if item.type === "tool_call"}
  <div
    class="stream-item message-record"
    id={messageId ? `message-${messageId}` : undefined}
    data-message-id={messageId}
    data-stream-item={itemKey}
  >
    <ToolCallCard
      name={item.name}
      args={item.args}
      result={item.result}
      mcpUi={item.mcpUi}
      images={item.images}
      {expanded}
      argHint={toolArgHint(item.args)}
      approval={item.approval}
      onApprove={(requestId) => onSubmitUserInput(requestId, { approved: true })}
      onDeny={onCancelUserInput}
      {fileChanges}
      {mermaidConfig}
      showRunning={isStreaming}
      onToggle={() => (expanded = !expanded)}
    />
  </div>
{:else if item.type === "compaction"}
  <CompactionStatus {item} {itemKey} {messageId} />
{:else if item.type === "compaction_boundary"}
  <ConversationUiRecord
    ui={{
      version: 1,
      component: "builtin.divider",
      props: { label_key: "compactionCompleted" },
      fallback: $t("compactionCompleted"),
    }}
    messageId={messageId ?? itemKey}
    conversationId={null}
    branchId={null}
  />
{:else if item.type === "runtime_notice"}
  <ConversationUiRecord
    ui={{
      version: 1,
      component: "builtin.divider",
      props: {
        title: item.kind === "error" ? $t("agentRunFailed") : $t("agentRunInterrupted"),
        detail: runtimeNoticeDetail(
          item,
          item.kind === "error" ? $t("agentRunFailed") : $t("agentRunInterrupted"),
        ),
        tone: item.kind === "error" ? "danger" : "neutral",
      },
      fallback: item.kind === "error" ? $t("agentRunFailed") : $t("agentRunInterrupted"),
    }}
    streamItemKey={itemKey}
    messageId={messageId ?? itemKey}
    conversationId={null}
    branchId={null}
  />
{:else if item.type === "retry"}
  <div
    class="stream-item message-record"
    id={messageId ? `message-${messageId}` : undefined}
    data-message-id={messageId}
    data-stream-item={itemKey}
  >
    <RetryAttempt
      {item}
      {fileChanges}
      {shikiTheme}
      {mermaidConfig}
      {onSubmitUserInput}
      {onCancelUserInput}
    />
  </div>
{:else if item.type === "user_input"}
  <div
    class="stream-item message-record pagination-atom"
    id={messageId ? `message-${messageId}` : undefined}
    data-message-id={messageId}
    data-stream-item={itemKey}
  >
    {#if item.state === "pending"}
      <UserInputForm
        request={item.request}
        onSubmit={onSubmitUserInput}
        onCancel={onCancelUserInput}
      />
    {:else}
      <UserInputSummary request={item.request} state={item.state} response={item.response} />
    {/if}
  </div>
{/if}

<style>
  .assistant-msg {
    width: 100%;
    color: var(--text);
    font-size: 14px;
    line-height: 1.47;
    letter-spacing: -0.374px;
  }
  .checkpoint-btn {
    display: inline-flex;
    align-items: center;
    margin-top: 6px;
    padding: 3px 6px;
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text-muted);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    line-height: 1;
  }
  .message-record {
    content-visibility: auto;
    contain-intrinsic-size: auto 120px;
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.assistant-msg span[style*="animation-name: sd-"]) {
      animation: none !important;
    }
  }
  :global(.message-record[data-file-preview-open]) {
    content-visibility: visible;
  }
  :global(.message-record[data-mermaid-expanded]) {
    content-visibility: visible;
  }
  .thinking-block {
    min-width: 0;
    contain-intrinsic-size: auto 24px;
    margin: 0 0 4px;
    border-left: 2px solid var(--border);
    padding: 4px 0 4px 10px;
    color: var(--text-muted);
    font-size: 13px;
    letter-spacing: 0;
  }
  .thinking-block.thinking-expanded {
    contain-intrinsic-size: auto 120px;
  }
  .thinking-summary {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    user-select: none;
    font: inherit;
    font-size: 12px;
    line-height: 1.3;
    text-align: left;
  }
  .thinking-summary:focus-visible {
    border-radius: 3px;
    box-shadow: var(--focus-ring);
  }
  .thinking-marker {
    width: 9px;
    flex: none;
    text-align: center;
  }
  .thinking-label {
    flex: none;
  }
  .thinking-preview {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .thinking-block pre {
    margin: 6px 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    font-size: 12px;
    line-height: 1.45;
  }
</style>
