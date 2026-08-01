<script lang="ts">
  import { Streamdown } from "svelte-streamdown";
  import Code from "svelte-streamdown/code";
  import MathBlock from "svelte-streamdown/math";
  import Mermaid from "$lib/streamdown/Mermaid.svelte";
  import ToolCallCard from "./ToolCallCard.svelte";
  import UserInputForm from "./UserInputForm.svelte";
  import UserInputSummary from "./UserInputSummary.svelte";
  import RetryAttempt from "./RetryAttempt.svelte";
  import MessageDivider from "./MessageDivider.svelte";
  import { t } from "$lib/i18n";
  import type { HtmlPreviewConfig, StreamItem } from "$lib/types";
  import type { MermaidConfig } from "$lib/mermaidTheme";
  import { customExtensions, type ComponentToken } from "$lib/streamdown/extensions";
  import CustomToken from "$lib/streamdown/CustomToken.svelte";

  interface Props {
    item: StreamItem;
    itemKey: string;
    messageId?: string;
    isLastText?: boolean;
    debugCheckpointId?: string;
    isStreaming?: boolean;
    initialThinkingOpen?: boolean;
    shikiTheme: string;
    mermaidConfig: MermaidConfig;
    htmlPreviewConfig?: HtmlPreviewConfig;
    onSubmitUserInput: (requestId: string, values: Record<string, unknown>) => void;
    onCancelUserInput: (requestId: string) => void;
  }

  let {
    item,
    itemKey,
    messageId,
    isLastText = false,
    debugCheckpointId,
    isStreaming = false,
    initialThinkingOpen = false,
    shikiTheme,
    mermaidConfig,
    htmlPreviewConfig,
    onSubmitUserInput,
    onCancelUserInput,
  }: Props = $props();

  let expanded = $state(false);
  let thinkingOpen = $state(false);

  $effect.pre(() => {
    if (initialThinkingOpen || isStreaming) thinkingOpen = true;
  });

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

  function renderThinkingContent(content: string): string {
    return content.replace(/^\s*(analysis|reasoning)\s*[:：]\s*/i, "");
  }

  function compactionText(streamItem: Extract<StreamItem, { type: "compaction" }>): string {
    const labels: Record<typeof streamItem.stage, string> = {
      checking: "Checking context…",
      summarizing: "Summarizing context…",
      creating: "Creating compacted context…",
      done: "Context compacted",
      skipped: "Compaction skipped",
      failed: streamItem.error ? `Compaction failed: ${streamItem.error}` : "Compaction failed",
    };
    return labels[streamItem.stage];
  }
</script>

{#if item.type === "text"}
  <div
    class="assistant-msg stream-item message-record"
    id={messageId ? `message-${messageId}` : undefined}
    data-message-id={messageId}
    data-stream-item={itemKey}
  >
    <Streamdown
      content={isStreaming && isLastText
        ? item.content + "▋"
        : isLastText
          ? item.content
          : item.content.trimEnd()}
      controls={{ table: false }}
      components={{ code: Code, mermaid: Mermaid, math: MathBlock }}
      extensions={customExtensions}
      {shikiTheme}
      {mermaidConfig}
    >
      {#snippet children({ token })}
        {#if (token as ComponentToken).type === "component"}
          <CustomToken
            token={token as ComponentToken}
            {htmlPreviewConfig}
            isDark={shikiTheme === "github-dark"}
          />
        {/if}
      {/snippet}
    </Streamdown>
    {#if isLastText && item.content.trim() && debugCheckpointId}
      <span class="checkpoint-btn">checkpoint: {debugCheckpointId}</span>
    {/if}
  </div>
{:else if item.type === "thinking"}
  <div
    class="thinking-block stream-item message-record"
    id={messageId ? `message-${messageId}` : undefined}
    data-message-id={messageId}
    data-stream-item={itemKey}
  >
    <button
      type="button"
      class="thinking-summary"
      aria-expanded={thinkingOpen}
      onclick={() => {
        thinkingOpen = !thinkingOpen;
      }}
    >
      <span class="thinking-marker" aria-hidden="true">{thinkingOpen ? "▾" : "▸"}</span>
      <span>Thinking</span>
    </button>
    {#if thinkingOpen}<pre>{renderThinkingContent(item.content)}</pre>{/if}
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
      {expanded}
      argHint={toolArgHint(item.args)}
      approval={item.approval}
      onApprove={(requestId) => onSubmitUserInput(requestId, { approved: true })}
      onDeny={onCancelUserInput}
      {htmlPreviewConfig}
      {mermaidConfig}
      showRunning={isStreaming}
      onToggle={() => (expanded = !expanded)}
    />
  </div>
{:else if item.type === "compaction"}
  <div
    class="compaction-status stream-item message-record"
    id={messageId ? `message-${messageId}` : undefined}
    data-message-id={messageId}
    data-stream-item={itemKey}
    class:failed={item.stage === "failed"}
  >
    <span class="compaction-spinner" aria-hidden="true"></span>
    <span>{compactionText(item)}</span>
  </div>
{:else if item.type === "compaction_boundary"}
  <MessageDivider title={$t("compactionCompleted")} streamItemKey={itemKey} {messageId} />
{:else if item.type === "runtime_notice"}
  <MessageDivider
    title={item.kind === "error" ? $t("agentRunFailed") : $t("agentRunInterrupted")}
    detail={item.reason}
    tone={item.kind === "error" ? "danger" : "neutral"}
    streamItemKey={itemKey}
    {messageId}
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
      {shikiTheme}
      {mermaidConfig}
      {htmlPreviewConfig}
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
  :global(.message-record[data-file-preview-open]) {
    content-visibility: visible;
  }
  :global(.message-record[data-mermaid-expanded]) {
    content-visibility: visible;
  }
  .thinking-block {
    margin: 0 0 4px;
    border-left: 2px solid var(--border);
    padding: 4px 0 4px 10px;
    color: var(--text-muted);
    font-size: 13px;
    letter-spacing: 0;
  }
  .thinking-summary {
    display: inline-flex;
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
  .thinking-block pre {
    margin: 6px 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    font-size: 12px;
    line-height: 1.45;
  }
  .compaction-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface2);
    color: var(--text-muted);
    font-size: 13px;
  }
  .compaction-status.failed {
    color: #b45309;
    border-color: rgba(245, 158, 11, 0.35);
    background: rgba(245, 158, 11, 0.1);
  }
  .compaction-spinner {
    width: 10px;
    height: 10px;
    flex: none;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  .failed .compaction-spinner {
    animation: none;
    border-right-color: currentColor;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
