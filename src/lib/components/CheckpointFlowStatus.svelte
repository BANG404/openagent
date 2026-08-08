<script lang="ts">
  import { checkpointFlowProgress, type CheckpointFlow } from "$lib/checkpointFlow";
  import { t } from "$lib/i18n";

  interface Props {
    flow: CheckpointFlow;
    width: number;
    collapsed: boolean;
    onToggle: () => void;
    onResizeStart: (event: PointerEvent) => void;
  }

  let { flow, width, collapsed, onToggle, onResizeStart }: Props = $props();
  let progress = $derived(checkpointFlowProgress(flow));
  let percent = $derived(progress.total > 0 ? (progress.completed / progress.total) * 100 : 0);

  function statusLabel(status: string): string {
    if (status === "completed") return $t("checkpointFlowCompleted");
    if (status === "failed") return $t("checkpointFlowFailed");
    if (status === "blocked") return $t("checkpointFlowBlocked");
    if (status === "in_progress") return $t("checkpointFlowInProgress");
    if (status === "pending") return $t("checkpointFlowPending");
    return $t("checkpointFlowRunning");
  }
</script>

<aside
  class="flow-panel"
  class:collapsed
  style:width={collapsed ? "42px" : `${width}px`}
  aria-label={$t(flow.kind === "goal" ? "checkpointGoal" : "checkpointGraph")}
>
  {#if !collapsed}
    <button
      class="resize-handle"
      type="button"
      aria-label={$t("checkpointFlowResize")}
      onpointerdown={onResizeStart}
    ></button>
  {/if}

  <header class="flow-header">
    <span class="flow-symbol {flow.kind}" aria-hidden="true">
      {#if flow.kind === "goal"}
        <svg viewBox="0 0 16 16" fill="none"
          ><circle cx="8" cy="8" r="5.4" /><circle cx="8" cy="8" r="2" /></svg
        >
      {:else}
        <svg viewBox="0 0 16 16" fill="none"
          ><circle cx="4" cy="4" r="1.5" /><circle cx="12" cy="5" r="1.5" /><circle
            cx="7"
            cy="12"
            r="1.5"
          /><path d="m5.4 4.5 5.1.2M4.8 5.3l1.6 5.3m4.5-4.2-2.8 4.4" /></svg
        >
      {/if}
    </span>
    {#if !collapsed}
      <span class="flow-heading">
        <strong>{$t(flow.kind === "goal" ? "checkpointGoal" : "checkpointGraph")}</strong>
        <span>{flow.objective}</span>
      </span>
    {/if}
    <button
      class="collapse-button"
      type="button"
      aria-label={$t(collapsed ? "checkpointFlowExpand" : "checkpointFlowCollapse")}
      onclick={onToggle}
    >
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"
        ><path d={collapsed ? "m6 4 4 4-4 4" : "m10 4-4 4 4 4"} /></svg
      >
    </button>
  </header>

  {#if !collapsed}
    <div class="flow-overview">
      <div class="overview-row">
        <span class="flow-status {flow.status}">{statusLabel(flow.status)}</span>
        <span class="flow-count">{progress.completed}/{progress.total}</span>
      </div>
      <div
        class="progress-track"
        aria-label={$t("checkpointFlowProgress")}
        aria-valuemin="0"
        aria-valuemax={progress.total}
        aria-valuenow={progress.completed}
        role="progressbar"
      >
        <span style:width={`${percent}%`}></span>
      </div>
    </div>

    <div class="flow-body">
      {#if flow.kind === "goal"}
        {#if flow.todos.length === 0}
          <p class="flow-empty">{$t("checkpointGoalNoTodos")}</p>
        {:else}
          {#each flow.todos as todo (todo.id)}
            <div class="flow-item {todo.status}">
              <span class="status-dot" aria-hidden="true"></span>
              <span class="item-copy"
                ><strong>{todo.task}</strong>{#if todo.result}<small>{todo.result}</small
                  >{/if}</span
              >
              <span class="item-status">{statusLabel(todo.status)}</span>
            </div>
          {/each}
        {/if}
      {:else}
        {#if flow.nodes.length === 0}
          <p class="flow-empty">{$t("checkpointGraphPlanning")}</p>
        {:else}
          {#each flow.nodes as node (node.id)}
            <div class="graph-node {node.status}">
              <div class="node-main">
                <span class="status-dot" aria-hidden="true"></span>
                <span class="item-copy"
                  ><strong>{node.task}</strong>{#if node.result}<small>{node.result}</small
                    >{/if}</span
                >
                <span class="item-status">{statusLabel(node.status)}</span>
              </div>
              {#if node.dependsOn.length > 0}
                <div class="dependencies">
                  <span>{$t("checkpointDependsOn")}</span
                  >{#each node.dependsOn as dependency (`${node.id}:${dependency}`)}<code
                      >{dependency}</code
                    >{/each}
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      {/if}

      {#if flow.summary}<p class="flow-summary">{flow.summary}</p>{/if}
    </div>
  {/if}
</aside>

<style>
  .flow-panel {
    position: relative;
    z-index: 12;
    display: flex;
    height: 100%;
    min-width: 240px;
    max-width: min(520px, 48vw);
    flex: 0 0 auto;
    flex-direction: column;
    overflow: hidden;
    border-left: 1px solid var(--border);
    background: color-mix(in srgb, var(--surface) 97%, var(--primary) 3%);
    transition: width 160ms ease;
  }

  .flow-panel.collapsed {
    min-width: 42px;
    max-width: 42px;
  }
  .resize-handle {
    position: absolute;
    inset: 0 auto 0 -4px;
    z-index: 2;
    width: 8px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: col-resize;
    touch-action: none;
  }
  .resize-handle:hover,
  .resize-handle:focus-visible {
    background: color-mix(in srgb, var(--primary) 36%, transparent);
    outline: 0;
  }
  .flow-header {
    display: flex;
    min-height: 50px;
    align-items: center;
    gap: 9px;
    padding: 9px 8px 9px 10px;
    border-bottom: 1px solid var(--border);
  }
  .collapsed .flow-header {
    flex-direction: column;
    gap: 8px;
    padding: 10px 6px;
    border-bottom: 0;
  }
  .flow-symbol {
    display: grid;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    place-items: center;
    border-radius: 9px;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
  }
  .flow-symbol svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 1.45;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .flow-heading {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }
  .flow-heading strong {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }
  .flow-heading span {
    overflow: hidden;
    font-size: 11px;
    color: var(--text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .collapse-button {
    display: grid;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 7px;
    color: var(--text-muted);
    background: transparent;
    cursor: pointer;
  }
  .collapse-button:hover,
  .collapse-button:focus-visible {
    color: var(--text);
    background: var(--surface2);
    outline: none;
  }
  .collapse-button:focus-visible {
    box-shadow: var(--focus-ring);
  }
  .collapse-button svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .flow-overview {
    display: grid;
    gap: 8px;
    padding: 10px;
    border-bottom: 1px solid var(--border);
  }
  .overview-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .flow-count {
    font:
      500 11px/1.4 "JetBrains Mono",
      monospace;
    color: var(--text-muted);
  }
  .flow-status,
  .item-status {
    flex: 0 0 auto;
    border-radius: 999px;
    padding: 2px 7px;
    font-size: 10px;
    color: var(--text-muted);
    background: var(--surface2);
  }
  .flow-status.running,
  .item-status.in_progress {
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 11%, transparent);
  }
  .flow-status.completed {
    color: #18794e;
    background: color-mix(in srgb, #18794e 11%, transparent);
  }
  .flow-status.failed,
  .flow-status.blocked {
    color: #b42318;
    background: color-mix(in srgb, #b42318 10%, transparent);
  }
  .progress-track {
    height: 4px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface2);
  }
  .progress-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--primary);
    transition: width 180ms ease;
  }
  .flow-body {
    display: grid;
    flex: 1;
    align-content: start;
    gap: 6px;
    overflow-y: auto;
    padding: 10px;
  }
  .flow-item,
  .graph-node {
    border: 1px solid var(--border);
    border-radius: 9px;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
  }
  .flow-item,
  .node-main {
    display: flex;
    min-height: 36px;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
  }
  .status-dot {
    width: 7px;
    height: 7px;
    flex: 0 0 7px;
    border-radius: 50%;
    background: var(--text-muted);
  }
  .completed .status-dot {
    background: #18794e;
  }
  .running .status-dot,
  .in_progress .status-dot {
    background: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 12%, transparent);
  }
  .failed .status-dot,
  .blocked .status-dot {
    background: #b42318;
  }
  .item-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }
  .item-copy strong {
    font-size: 11px;
    font-weight: 500;
    line-height: 1.35;
    color: var(--text);
  }
  .item-copy small {
    display: -webkit-box;
    overflow: hidden;
    font-size: 10px;
    color: var(--text-muted);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .item-status {
    padding: 1px 6px;
  }
  .dependencies {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 0 8px 7px 23px;
    font-size: 10px;
    color: var(--text-muted);
  }
  .dependencies code {
    border-radius: 4px;
    padding: 1px 4px;
    background: var(--surface2);
    color: var(--text);
    font-size: 10px;
  }
  .flow-empty,
  .flow-summary {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .flow-summary {
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  @media (max-width: 760px) {
    .flow-panel:not(.collapsed) {
      position: absolute;
      inset: 0 0 0 auto;
      max-width: min(88vw, 420px);
      box-shadow: -16px 0 36px rgba(0, 0, 0, 0.12);
    }
  }
</style>
