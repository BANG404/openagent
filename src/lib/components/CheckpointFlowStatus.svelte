<script lang="ts">
  import {
    checkpointFlowProgress,
    type CheckpointFlow,
  } from "$lib/checkpointFlow";
  import type { AgentPluginSidebarViewSummary, FileChange } from "$lib/types";
  import type { BackgroundTerminalSession } from "$lib/openagent";
  import type { RightSidebarPanel } from "$lib/rightSidebar";
  import {
    conversationBranchScopeKey,
    RightSidebarPanelStateStore,
    type RightSidebarPanelState,
  } from "$lib/sidebarPanelScope";
  import { t } from "$lib/i18n";
  import BackgroundTerminalPanel from "$lib/components/BackgroundTerminalPanel.svelte";
  import FileChangePanel from "$lib/components/FileChangePanel.svelte";
  import ScrollArea from "$lib/components/ui/ScrollArea.svelte";
  import PluginSidebarPanel from "$lib/components/PluginSidebarPanel.svelte";
  import { isPluginSidebarPanel } from "$lib/rightSidebar";

  interface Props {
    flow: CheckpointFlow | null;
    changes: FileChange[];
    width: number;
    collapsed: boolean;
    resizing: boolean;
    onResizeStart: (event: PointerEvent) => void;
    onRevert: (changeId: string) => Promise<void>;
    activePanel?: RightSidebarPanel;
    terminalEnabled?: boolean;
    terminalAvailable?: boolean;
    terminalConversationId?: string | null;
    terminalBranchId?: string | null;
    /** Scope shared by every right-sidebar tab so tab-local choices survive switching. */
    rightSidebarScopeKey?: string;
    onTerminalSummaryChange?: (runningCount: number, sessionCount: number) => void;
    terminalPreviewSessions?: BackgroundTerminalSession[] | null;
    terminalPreviewOutputs?: Record<string, string>;
    pluginSidebarViews?: AgentPluginSidebarViewSummary[];
    /** Package identity of the visible plugins; a change reloads each panel. */
    pluginSidebarRevision?: string;
    pluginSidebarContext?: {
      workspacePath?: string | null;
      conversationId?: string | null;
      branchId?: string | null;
      fileChanges?: Array<{ path: string; status: string }>;
      locale?: string;
      theme?: string;
    };
    conversationCollapsed?: boolean;
  }

  let {
    flow,
    changes,
    width,
    collapsed,
    resizing,
    onResizeStart,
    onRevert,
    activePanel = $bindable<RightSidebarPanel>("status"),
    terminalEnabled = false,
    terminalAvailable = false,
    terminalConversationId = null,
    terminalBranchId = null,
    rightSidebarScopeKey = conversationBranchScopeKey(null, null),
    onTerminalSummaryChange = () => {},
    terminalPreviewSessions = null,
    terminalPreviewOutputs = {},
    pluginSidebarViews = [],
    pluginSidebarRevision = "",
    pluginSidebarContext = {},
    conversationCollapsed = false,
  }: Props = $props();
  const panelSnapshots = new RightSidebarPanelStateStore();
  let currentScopeKey = $state<string | null>(null);
  let fileSelectedId = $state<string | null>(null);

  $effect(() => {
    const scope = rightSidebarScopeKey;
    if (scope === currentScopeKey) return;
    const current: RightSidebarPanelState = { fileSelectedId };
    const restored = panelSnapshots.switchScope(currentScopeKey, current, scope, {
      fileSelectedId: null,
    });
    currentScopeKey = scope;
    fileSelectedId = restored.fileSelectedId;
  });

  $effect(() => {
    const scope = currentScopeKey;
    if (scope !== null) panelSnapshots.save(scope, { fileSelectedId });
  });
  let progress = $derived(flow ? checkpointFlowProgress(flow) : { completed: 0, total: 0 });
  let flatItems = $derived(flow?.items ?? []);
  // The package projection carries its own title; the host does not need a
  // product-specific flow registry or domain-specific renderer.
  let heading = $derived(flow ? $t("checkpointPluginFlow") : "");

  $effect(() => {
    if (activePanel === "status" && !flow) {
      if (changes.length > 0) activePanel = "files";
      else if (terminalAvailable) activePanel = "terminal";
    }
    if (activePanel === "files" && changes.length === 0) {
      if (flow) activePanel = "status";
      else if (terminalAvailable) activePanel = "terminal";
    }
    if (activePanel === "terminal" && !terminalAvailable) {
      activePanel = flow
        ? "status"
        : changes.length > 0
          ? "files"
          : "status";
    }
    if (
      isPluginSidebarPanel(activePanel) &&
      !pluginSidebarViews.some((view) => view.id === activePanel)
    ) {
      activePanel = flow
        ? "status"
        : changes.length > 0
          ? "files"
          : terminalAvailable
            ? "terminal"
            : "status";
    }
  });

  function statusLabel(status: string): string {
    if (status === "completed") return $t("checkpointFlowCompleted");
    if (status === "failed") return $t("checkpointFlowFailed");
    if (status === "blocked") return $t("checkpointFlowBlocked");
    if (status === "in_progress") return $t("checkpointFlowInProgress");
    if (status === "pending") return $t("checkpointFlowPending");
    if (status === "running") return $t("checkpointFlowRunning");
    // A package owns its status vocabulary, so an unmapped token is shown as
    // the package reported it rather than relabelled.
    return status;
  }
</script>

<aside
  id="checkpoint-flow-panel"
  class="flow-panel"
  class:collapsed
  class:conversation-collapsed={conversationCollapsed}
  class:resizing
  style:--flow-panel-width={`${width}px`}
  aria-label={$t("conversationDetails")}
  aria-hidden={collapsed}
>
  {#if !collapsed}
    <button
      class="resize-handle"
      type="button"
      aria-label={$t("checkpointFlowResize")}
      onpointerdown={onResizeStart}
    ></button>
  {/if}
  <div class="flow-panel-surface">
    {#if !collapsed}
      <nav class="panel-navigation" aria-label={$t("conversationDetails")}>
        {#if flow}
          <button
            type="button"
            class:active={activePanel === "status"}
            aria-current={activePanel === "status" ? "page" : undefined}
            onclick={() => (activePanel = "status")}>{$t("conversationStatus")}</button
          >
        {/if}
        {#if changes.length > 0}
          <button
            type="button"
            class:active={activePanel === "files"}
            aria-current={activePanel === "files" ? "page" : undefined}
            onclick={() => (activePanel = "files")}
          >
            {$t("conversationFiles")}
            <span>{changes.length}</span>
          </button>
        {/if}
        {#if terminalAvailable}
          <button
            type="button"
            class:active={activePanel === "terminal"}
            aria-current={activePanel === "terminal" ? "page" : undefined}
            onclick={() => (activePanel = "terminal")}
          >
            {$t("backgroundTerminals")}
            {#if terminalPreviewSessions?.length}
              <span>{terminalPreviewSessions.length}</span>
            {/if}
          </button>
        {/if}
        {#each pluginSidebarViews as view (view.id)}
          <button
            type="button"
            class:active={activePanel === view.id}
            aria-current={activePanel === view.id ? "page" : undefined}
            onclick={() => (activePanel = view.id)}>{view.title}</button
          >
        {/each}
      </nav>
    {/if}

    {#if !collapsed && activePanel === "status" && flow}
      <header class="flow-header">
        <span class="flow-heading">
          <strong>{heading}</strong>
          <span>{flow.objective}</span>
        </span>
        <span class="flow-count">{progress.completed}/{progress.total}</span>
      </header>

      <div class="flow-body">
        <ScrollArea height="100%" class="flow-body-scroll" scrollHideDelay={350}>
          <div class="flow-body-content">
            {#if flatItems.length === 0}
              <p class="flow-empty">{$t("checkpointPluginFlowEmpty")}</p>
            {:else}
              {#each flatItems as item (item.id)}
                <div class="flow-item {item.status}">
                  <span class="status-dot" aria-hidden="true"></span>
                  <span class="item-copy"
                    ><strong>{item.label}</strong>{#if item.detail}<small>{item.detail}</small
                      >{/if}</span
                  >
                  <span class="item-status">{statusLabel(item.status)}</span>
                </div>
              {/each}
            {/if}
          </div>
        </ScrollArea>

        {#if flow.summary}<p class="flow-summary">{flow.summary}</p>{/if}
      </div>
    {/if}

    <!-- Keep tab-local data mounted while the sidebar is collapsed or another
         tab is active. This preserves plugin panels and file selection instead
         of rebuilding the first tab on every return. -->
    <div
      class="panel-cache-slot"
      hidden={collapsed || activePanel !== "files"}
      aria-hidden={collapsed || activePanel !== "files"}
    >
      {#if changes.length > 0}
        <FileChangePanel {changes} {onRevert} bind:selectedId={fileSelectedId} />
      {/if}
    </div>
    {#each pluginSidebarViews as view (view.id)}
      <div
        class="panel-cache-slot"
        hidden={collapsed || activePanel !== view.id}
        aria-hidden={collapsed || activePanel !== view.id}
      >
        <PluginSidebarPanel
          {view}
          {pluginSidebarRevision}
          scopeKey={rightSidebarScopeKey}
          context={pluginSidebarContext}
        />
      </div>
    {/each}
    {#if !collapsed && activePanel !== "status" && activePanel !== "files" && activePanel !== "terminal" && !isPluginSidebarPanel(activePanel)}
      <div class="flow-body">
        <p class="flow-empty">{$t("conversationDetailsEmpty")}</p>
      </div>
    {/if}
    {#if terminalEnabled}
      <BackgroundTerminalPanel
        active={!collapsed && activePanel === "terminal"}
        enabled={terminalEnabled}
        conversationId={terminalConversationId}
        branchId={terminalBranchId}
        onSummaryChange={onTerminalSummaryChange}
        previewSessions={terminalPreviewSessions}
        previewOutputs={terminalPreviewOutputs}
      />
    {/if}
  </div>
</aside>

<style>
  .flow-panel {
    --flow-panel-gap: 3px;
    position: relative;
    z-index: 12;
    display: flex;
    width: min(var(--flow-panel-width), 62%, calc(100% - var(--workspace-card-gap)));
    min-width: min(260px, 62%, calc(100% - var(--workspace-card-gap)));
    max-width: min(960px, 62%, calc(100% - var(--workspace-card-gap)));
    flex: 0 0 auto;
    flex-direction: column;
    margin-left: var(--flow-panel-gap);
    transition:
      width var(--motion-layout) var(--ease-enter),
      min-width var(--motion-layout) var(--ease-enter),
      max-width var(--motion-layout) var(--ease-enter),
      margin var(--motion-layout) var(--ease-enter),
      opacity var(--motion-fast) var(--ease-standard);
  }
  .flow-panel.collapsed {
    width: 0;
    min-width: 0;
    max-width: 0;
    margin-left: 0;
    opacity: 0;
    pointer-events: none;
  }
  .flow-panel.conversation-collapsed {
    width: 100%;
    max-width: none;
  }
  .flow-panel.collapsed.conversation-collapsed {
    width: 0;
    max-width: 0;
  }
  .flow-panel.conversation-collapsed .flow-panel-surface {
    border-radius: 12px;
  }
  .flow-panel.resizing {
    transition: none;
  }
  .flow-panel-surface {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
    border-radius: 0 12px 12px 0;
    background: var(--surface);
  }
  .panel-cache-slot {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
    flex-direction: column;
  }

  .panel-cache-slot[hidden] {
    display: none;
  }
  .resize-handle {
    position: absolute;
    /* Center the full hit target on the gap between the conversation and panel. */
    inset: 0 auto 0 calc(-1 * (var(--column-resize-hit-width) + var(--flow-panel-gap)) / 2);
    z-index: 2;
    width: var(--column-resize-hit-width);
    padding: 0;
    border: 0;
    background: transparent;
    cursor: col-resize;
    touch-action: none;
    outline: none;
  }
  .resize-handle::after {
    position: absolute;
    inset: 0 auto 0 3px;
    width: var(--column-resize-indicator-width);
    background: var(--primary);
    content: "";
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--motion-fast) var(--ease-standard);
  }
  .resize-handle:hover::after,
  .resize-handle:focus-visible::after,
  .resizing .resize-handle::after {
    opacity: var(--column-resize-indicator-opacity);
  }
  .panel-navigation {
    display: flex;
    min-height: 42px;
    align-items: end;
    gap: 2px;
    padding: 5px 7px 0;
    border-bottom: 1px solid var(--border);
  }
  .panel-navigation button {
    position: relative;
    display: flex;
    height: 36px;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px 6px 0 0;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 11px;
  }
  .panel-navigation button:hover,
  .panel-navigation button:focus-visible {
    background: var(--interactive-state-bg);
    color: var(--text);
    outline: none;
  }
  .panel-navigation button:focus-visible {
    box-shadow: inset var(--focus-ring);
  }
  .panel-navigation button.active {
    color: var(--text);
  }
  .panel-navigation button.active::after {
    position: absolute;
    inset: auto 8px -1px;
    height: 2px;
    background: var(--primary);
    content: "";
  }
  .panel-navigation span {
    display: grid;
    min-width: 17px;
    height: 17px;
    place-items: center;
    padding: 0 4px;
    box-sizing: border-box;
    border-radius: 9px;
    background: var(--surface2);
    color: var(--text-muted);
    font:
      500 9px/1 "JetBrains Mono",
      monospace;
  }
  .flow-header {
    display: flex;
    min-height: 50px;
    align-items: center;
    gap: 9px;
    padding: 9px 8px 9px 10px;
    border-bottom: 1px solid var(--border);
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
  .flow-count {
    flex: 0 0 auto;
    font:
      500 11px/1.4 "JetBrains Mono",
      monospace;
    color: var(--text-muted);
  }
  .item-status {
    display: inline-flex;
    flex: 0 0 auto;
    min-height: 18px;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border-radius: 999px;
    padding: 2px 7px;
    font-size: 10px;
    line-height: 1;
    text-align: center;
    color: var(--text-muted);
    background: var(--surface2);
  }
  .item-status.in_progress {
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 11%, transparent);
  }
  .flow-body {
    display: grid;
    min-width: 0;
    flex: 1;
    grid-auto-rows: max-content;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 6px;
    overflow-x: hidden;
    overflow-y: hidden;
    padding: 10px;
  }

  .flow-body-scroll {
    min-height: 0;
    flex: 1;
  }

  :global(.flow-body-scroll .ui-scroll-area-viewport) {
    padding: 10px 8px 10px 10px;
  }

  .flow-body-content {
    display: grid;
    min-height: 100%;
    grid-auto-rows: max-content;
    gap: 6px;
  }
  .flow-item {
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
  }
  .flow-item {
    display: flex;
    min-width: 0;
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
    overflow-wrap: anywhere;
  }
  .item-copy small {
    display: -webkit-box;
    overflow: hidden;
    font-size: 10px;
    color: var(--text-muted);
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .item-status {
    padding: 1px 6px;
  }
  .flow-empty,
  .flow-summary {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .flow-empty {
    margin: auto;
    text-align: center;
  }
  .flow-summary {
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    overflow-wrap: anywhere;
  }

  @media (max-width: 900px) {
    .flow-panel:not(.collapsed) {
      position: fixed;
      inset: var(--desktop-titlebar-height) var(--workspace-card-gap) var(--workspace-card-gap);
      width: auto;
      min-width: 0;
      max-width: none;
      margin-left: 0;
    }

    .flow-panel:not(.collapsed) .resize-handle {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .flow-panel,
    .resize-handle::after {
      transition: none;
    }
  }
</style>
