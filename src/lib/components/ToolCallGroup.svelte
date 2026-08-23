<script lang="ts">
  import { t } from "$lib/i18n";
  import { toolCallStatus, type ToolCallItem, type ToolCallStatus } from "$lib/toolCallGroups";
  import type { HtmlPreviewConfig } from "$lib/types";
  import ToolCallCard from "./ToolCallCard.svelte";
  import Tooltip from "./Tooltip.svelte";

  interface Props {
    items: ToolCallItem[];
    isStreaming?: boolean;
    htmlPreviewConfig?: HtmlPreviewConfig;
    onSubmitUserInput: (requestId: string, values: Record<string, unknown>) => void;
    onCancelUserInput: (requestId: string) => void;
  }

  let {
    items,
    isStreaming = false,
    htmlPreviewConfig,
    onSubmitUserInput,
    onCancelUserInput,
  }: Props = $props();

  let expanded = $state(false);
  let expandedCalls = $state(new Set<number>());

  const statuses = $derived(items.map((item) => toolCallStatus(item, isStreaming)));
  const statusCounts = $derived.by(() => {
    const counts: Record<ToolCallStatus, number> = {
      pending: 0,
      running: 0,
      success: 0,
      failed: 0,
    };
    for (const status of statuses) counts[status] += 1;
    return counts;
  });

  function toggleCall(index: number) {
    const next = new Set(expandedCalls);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    expandedCalls = next;
  }

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

  function statusLabel(status: ToolCallStatus): string {
    return $t(
      status === "success"
        ? "toolStatusSuccess"
        : status === "failed"
          ? "toolStatusFailed"
          : status === "running"
            ? "toolStatusRunning"
            : "toolStatusPending",
    );
  }
</script>

<section class="tool-call-group">
  <button
    class="tool-call-group-toggle"
    type="button"
    aria-expanded={expanded}
    onclick={() => (expanded = !expanded)}
  >
    <span class="group-chevron" class:expanded aria-hidden="true">
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M6 4l4 4-4 4" />
      </svg>
    </span>
    <span class="group-title">{$t("toolCallGroup")}</span>
    <span class="group-count">{items.length}</span>
    <span class="group-names" aria-hidden="true">
      {items.map((item) => item.name).join(" · ")}
    </span>
    <span class="group-statuses">
      {#if statusCounts.failed}
        <Tooltip text={`${statusCounts.failed} ${statusLabel("failed")}`}>
          <span class="status failed">
            <span aria-hidden="true">×</span><span>{statusCounts.failed}</span>
          </span>
        </Tooltip>
      {/if}
      {#if statusCounts.running}
        <Tooltip text={`${statusCounts.running} ${statusLabel("running")}`}>
          <span class="status running">
            <span aria-hidden="true">…</span><span>{statusCounts.running}</span>
          </span>
        </Tooltip>
      {/if}
      {#if statusCounts.pending}
        <Tooltip text={`${statusCounts.pending} ${statusLabel("pending")}`}>
          <span class="status pending">
            <span aria-hidden="true">○</span><span>{statusCounts.pending}</span>
          </span>
        </Tooltip>
      {/if}
      {#if statusCounts.success}
        <Tooltip text={`${statusCounts.success} ${statusLabel("success")}`}>
          <span class="status success">
            <span aria-hidden="true">✓</span><span>{statusCounts.success}</span>
          </span>
        </Tooltip>
      {/if}
    </span>
    <span class="sr-only">{expanded ? $t("toolCallGroupCollapse") : $t("toolCallGroupExpand")}</span
    >
  </button>

  {#if expanded}
    <div class="tool-call-group-items">
      {#each items as item, index (`${item.toolUseId ?? item.name}-${index}`)}
        <ToolCallCard
          name={item.name}
          args={item.args}
          result={item.result}
          expanded={expandedCalls.has(index)}
          argHint={toolArgHint(item.args)}
          approval={item.approval}
          onApprove={(requestId) => onSubmitUserInput(requestId, { approved: true })}
          onDeny={onCancelUserInput}
          {htmlPreviewConfig}
          showRunning={isStreaming}
          onToggle={() => toggleCall(index)}
        />
      {/each}
    </div>
  {/if}
</section>

<style>
  .tool-call-group {
    margin: 2px 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--user-message-bg);
    font-size: 12px;
  }

  .tool-call-group-toggle {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
    min-height: 32px;
    gap: 7px;
    padding: 5px 10px;
    border: 0;
    background: var(--user-message-bg);
    color: var(--text-muted);
    cursor: pointer;
    text-align: left;
  }

  .tool-call-group-toggle:hover {
    background: var(--interactive-state-bg);
  }

  .tool-call-group-toggle:focus-visible {
    box-shadow: var(--focus-ring);
    outline: none;
  }

  .group-chevron {
    display: inline-flex;
    width: 14px;
    height: 14px;
    flex: none;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s ease;
  }

  .group-chevron.expanded {
    transform: rotate(90deg);
  }

  .group-chevron svg {
    width: 12px;
    height: 12px;
  }

  .group-title {
    flex: none;
    color: var(--text);
    font-weight: 600;
  }

  .group-count {
    display: inline-flex;
    min-width: 18px;
    height: 18px;
    flex: none;
    align-items: center;
    justify-content: center;
    padding: 0 5px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-muted);
    font-size: 10px;
  }

  .group-names {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: var(--text-muted);
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-statuses {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 5px;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 10px;
    line-height: 1;
  }

  .status.success {
    color: #22c55e;
  }
  .status.failed {
    color: var(--danger, #dc2626);
  }
  .status.running {
    color: var(--primary);
    animation: pulse 1.2s ease-in-out infinite;
  }
  .status.pending {
    color: var(--text-muted);
  }

  .tool-call-group-items {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 5px;
    border-top: 1px solid var(--border);
    background: var(--user-message-bg);
  }

  .tool-call-group-items :global(.tool-call-card) {
    margin: 0;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .group-chevron {
      transition: none;
    }

    .status.running {
      animation: none;
    }
  }
</style>
