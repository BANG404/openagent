<script lang="ts">
  import { Streamdown } from "svelte-streamdown";
  import Code from "svelte-streamdown/code";
  import MathBlock from "svelte-streamdown/math";
  import Mermaid from "$lib/streamdown/Mermaid.svelte";
  import CustomToken from "$lib/streamdown/CustomToken.svelte";
  import { chatMarkdownTheme } from "$lib/streamdown/chatMarkdownTheme";
  import { customExtensions } from "$lib/streamdown/extensions";
  import type { ComponentToken } from "$lib/streamdown/extensions";
  import type { HtmlPreviewConfig, StreamItem } from "$lib/types";
  import type { MermaidConfig } from "$lib/mermaidTheme";
  import { t } from "$lib/i18n";
  import ToolCallCard from "./ToolCallCard.svelte";
  import ToolCallGroup from "./ToolCallGroup.svelte";
  import UserInputForm from "./UserInputForm.svelte";
  import UserInputSummary from "./UserInputSummary.svelte";
  import { groupStreamItems } from "$lib/toolCallGroups";

  interface Props {
    item: Extract<StreamItem, { type: "retry" }>;
    shikiTheme: string;
    mermaidConfig: MermaidConfig;
    htmlPreviewConfig?: HtmlPreviewConfig;
    onSubmitUserInput: (requestId: string, values: Record<string, unknown>) => void;
    onCancelUserInput: (requestId: string) => void;
  }

  let {
    item,
    shikiTheme,
    mermaidConfig,
    htmlPreviewConfig,
    onSubmitUserInput,
    onCancelUserInput,
  }: Props = $props();

  let expandedToolCalls = $state(new Set<number>());
  const attemptSegments = $derived(groupStreamItems(item.items));

  function toggleToolCall(index: number) {
    const next = new Set(expandedToolCalls);
    next.has(index) ? next.delete(index) : next.add(index);
    expandedToolCalls = next;
  }

  function toolArgHint(args: string): string {
    try {
      const first = Object.values(JSON.parse(args))[0];
      if (first !== undefined) {
        const text = String(first);
        return text.length > 48 ? `${text.slice(0, 48)}…` : text;
      }
    } catch {}
    return "";
  }
</script>

<div class="retry-attempt">
  <div class="attempt-content">
    {#each attemptSegments as segment (segment.startIndex)}
      {#if segment.kind === "tool_group"}
        <ToolCallGroup
          items={segment.items}
          {htmlPreviewConfig}
          {onSubmitUserInput}
          {onCancelUserInput}
        />
      {:else}
        {@const attemptItem = segment.item}
        {@const idx = segment.startIndex}
        {#if attemptItem.type === "text"}
          <Streamdown
            content={attemptItem.content.trimEnd()}
            controls={{ table: false }}
            components={{ code: Code, mermaid: Mermaid, math: MathBlock }}
            extensions={customExtensions}
            theme={chatMarkdownTheme}
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
        {:else if attemptItem.type === "thinking"}
          <details class="thinking-block">
            <summary>Thinking</summary>
            <pre>{attemptItem.content.trimEnd()}</pre>
          </details>
        {:else if attemptItem.type === "tool_call"}
          <ToolCallCard
            name={attemptItem.name}
            args={attemptItem.args}
            result={attemptItem.result}
            expanded={expandedToolCalls.has(idx)}
            argHint={toolArgHint(attemptItem.args)}
            approval={attemptItem.approval}
            onApprove={(requestId) => onSubmitUserInput(requestId, { approved: true })}
            onDeny={onCancelUserInput}
            {htmlPreviewConfig}
            {mermaidConfig}
            onToggle={() => toggleToolCall(idx)}
          />
        {:else if attemptItem.type === "user_input"}
          {#if attemptItem.state === "pending"}
            <UserInputForm
              request={attemptItem.request}
              onSubmit={onSubmitUserInput}
              onCancel={onCancelUserInput}
            />
          {:else}
            <UserInputSummary
              request={attemptItem.request}
              state={attemptItem.state}
              response={attemptItem.response}
            />
          {/if}
        {:else if attemptItem.type === "attachment"}
          <div class="attempt-attachment">{attemptItem.attachment.name}</div>
        {/if}
      {/if}
    {/each}
  </div>
  <div class="retry-divider" role="separator">
    <span
      >{$t("retryAttempt")} · {item.attempt}/{item.maxAttempts}{item.model
        ? ` · ${item.model}`
        : ""}</span
    >
  </div>
  {#if item.error}<p class="retry-error">{item.error}</p>{/if}
</div>

<style>
  .retry-attempt {
    display: contents;
  }

  .attempt-content {
    color: var(--text);
  }

  .thinking-block {
    margin: 0 0 4px;
    border-left: 2px solid var(--border);
    padding: 4px 0 4px 10px;
  }

  .thinking-block summary {
    cursor: pointer;
    font-size: 12px;
  }

  .thinking-block pre {
    margin: 6px 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    font-size: 12px;
    line-height: 1.45;
  }

  .attempt-attachment {
    margin: 0 0 8px;
    padding: 6px 8px;
    border: 0;
    border-radius: 6px;
    background: var(--surface2);
    box-shadow: var(--control-shadow);
  }

  .retry-error {
    color: var(--text-muted);
  }

  .retry-divider {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 22px 0 8px;
    color: var(--text-muted);
    font-size: 11px;
  }

  .retry-divider::before,
  .retry-divider::after {
    content: "";
    height: 1px;
    flex: 1;
    background: color-mix(in srgb, var(--border) 75%, transparent);
  }

  .retry-error {
    margin: 0 0 16px;
    padding: 0 12px;
    text-align: center;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    font-size: 11px;
    line-height: 1.4;
  }
</style>
