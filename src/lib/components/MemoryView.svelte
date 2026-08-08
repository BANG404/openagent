<script lang="ts">
  import { invoke } from "$lib/openagent/tauriClient";
  import { onMount } from "svelte";
  import MdxMarkdownEditor from "./MdxMarkdownEditor.svelte";
  import LoadingSkeleton from "./LoadingSkeleton.svelte";
  import ScopeToggle from "./ScopeToggle.svelte";
  import WindowControls from "./WindowControls.svelte";
  import Tooltip from "./Tooltip.svelte";
  import { t } from "$lib/i18n";
  import type { AgentMemoryEntry, WorkspaceContext } from "$lib/types";

  let {
    workspace,
    isMemorySyncing,
    onOpenSource,
    winMinimize,
    winMaximize,
    winClose,
    preview = false,
  }: {
    workspace: WorkspaceContext | null;
    isMemorySyncing: boolean;
    onOpenSource: (convId: string, messageId: string) => void;
    winMinimize: () => void;
    winMaximize: () => void;
    winClose: () => void;
    preview?: boolean;
  } = $props();

  type MemoryScope = "global" | "local";

  let activeScope = $state<MemoryScope>("global");
  let globalMemory = $state("");
  let localMemory = $state("");
  let agentMemories = $state<AgentMemoryEntry[]>([]);
  let memoryContentEl = $state<HTMLElement | null>(null);
  let agentPanelHeight = $state(280);
  let userCollapsed = $state(false);
  let agentCollapsed = $state(false);
  let memoryLoading = $state(true);
  let agentMemoriesLoading = $state(true);
  let loadedMemoryScopes = new Set<MemoryScope>();
  let currentMemory = $derived(activeScope === "global" ? globalMemory : localMemory);
  let agentScope = $derived(activeScope === "global" ? "global" : (workspace?.path ?? "global"));

  onMount(() => {
    if (preview) {
      memoryLoading = false;
      agentMemoriesLoading = false;
      return;
    }
    void loadMemory();
    return () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      if (loadedMemoryScopes.has("global")) {
        invoke("save_memory", { scope: "global", content: globalMemory }).catch(() => {});
      }
      if (workspace?.path && loadedMemoryScopes.has("local")) {
        invoke("save_memory", { scope: "local", content: localMemory }).catch(() => {});
      }
    };
  });

  async function loadMemory() {
    memoryLoading = true;
    const globalRequest = invoke<string>("get_memory", { scope: "global" })
      .then((value) => {
        globalMemory = value;
        loadedMemoryScopes.add("global");
      })
      .catch(() => {});
    const localRequest = workspace?.path
      ? invoke<string>("get_memory", { scope: "local" })
          .then((value) => {
            localMemory = value;
            loadedMemoryScopes.add("local");
          })
          .catch(() => {})
      : Promise.resolve();
    await Promise.all([globalRequest, localRequest, loadAgentMemories()]);
    memoryLoading = false;
  }

  async function loadAgentMemories() {
    agentMemoriesLoading = true;
    try {
      agentMemories = await invoke<AgentMemoryEntry[]>("get_agent_memories", {
        scope: agentScope,
        query: null,
      });
    } catch {
      agentMemories = [];
    } finally {
      agentMemoriesLoading = false;
    }
  }

  async function switchScope(scope: MemoryScope) {
    if (activeScope === scope) return;
    if (scope === "local" && !workspace?.path) return;
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
      await saveMemory();
    }
    activeScope = scope;
    await loadAgentMemories();
  }

  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  function handleUserInput(value: string) {
    if (activeScope === "global") globalMemory = value;
    else localMemory = value;

    // Auto-save after 600 ms of inactivity
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => saveMemory(), 600);
  }

  async function saveMemory() {
    try {
      await invoke("save_memory", {
        scope: activeScope,
        content: activeScope === "global" ? globalMemory : localMemory,
      });
    } catch (err) {
      console.error(`Save failed: ${err}`);
    }
  }

  async function deleteAgentMemory(id: string) {
    try {
      await invoke("delete_agent_memory", { id });
      agentMemories = agentMemories.filter((m) => m.id !== id);
    } catch (err) {
      alert(`Delete failed: ${err}`);
    }
  }

  function formatDate(ts: number) {
    return new Date(ts * 1000).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function clampAgentHeight(height: number) {
    const contentHeight = memoryContentEl?.clientHeight ?? 0;
    if (contentHeight <= 0) return height;
    const minPanelHeight = 140;
    const sectionHeaderHeight = 35;
    const splitterHeight = 7;
    const reservedHeight = sectionHeaderHeight * 2 + splitterHeight;
    const maxHeight = Math.max(minPanelHeight, contentHeight - reservedHeight - minPanelHeight);
    return Math.min(Math.max(height, minPanelHeight), maxHeight);
  }

  function startResize(event: PointerEvent) {
    if (userCollapsed || agentCollapsed) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = agentPanelHeight;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    document.body.classList.add("memory-resizing");

    const onPointerMove = (moveEvent: PointerEvent) => {
      agentPanelHeight = clampAgentHeight(startHeight - (moveEvent.clientY - startY));
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      target.releasePointerCapture(upEvent.pointerId);
      document.body.classList.remove("memory-resizing");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }
</script>

<div class="memory-panel">
  <div class="memory-header" data-tauri-drag-region>
    <div class="header-leading">
      <span class="memory-header-title">{$t("memoryFiles")}</span>
      <ScopeToggle
        value={activeScope}
        projectEnabled={Boolean(workspace?.path)}
        onChange={switchScope}
      />
    </div>
    <div class="title-actions">
      {#if isMemorySyncing}
        <Tooltip text="Memory syncing">
          <span class="sync-dot">●</span>
        </Tooltip>
      {/if}
      <WindowControls onMinimize={winMinimize} onMaximize={winMaximize} onClose={winClose} />
    </div>
  </div>

  {#snippet bodyPanel()}
    <div class="memory-content-col" bind:this={memoryContentEl}>
      <!-- User memory editor -->
      <div class="memory-section user-section" class:collapsed={userCollapsed}>
        <div class="section-header">
          <h4 class="section-title">{$t("userMemory")}</h4>
          <Tooltip text={userCollapsed ? $t("expandSection") : $t("collapseSection")}>
            <button
              class="section-toggle-btn"
              aria-label={userCollapsed ? $t("expandSection") : $t("collapseSection")}
              aria-expanded={!userCollapsed}
              onclick={() => (userCollapsed = !userCollapsed)}
            >
              <svg
                class:expanded={!userCollapsed}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </button>
          </Tooltip>
        </div>
        {#if !userCollapsed}
          {#if memoryLoading}
            <LoadingSkeleton variant="editor" rows={7} label={$t("loadingContent")} />
          {:else}
            <MdxMarkdownEditor
              class="memory-mdx-editor"
              value={currentMemory}
              onChange={handleUserInput}
              placeholder="在此编写你的个人记忆、偏好、项目背景..."
            />
          {/if}
        {/if}
      </div>

      <div
        class="memory-resizer"
        class:disabled={userCollapsed || agentCollapsed}
        role="separator"
        aria-orientation="horizontal"
        aria-label={$t("resizeMemorySections")}
        onpointerdown={startResize}
      >
        <span></span>
      </div>

      <!-- Agent memories -->
      <div
        class="memory-section agent-section"
        class:collapsed={agentCollapsed}
        style={userCollapsed || agentCollapsed ? undefined : `height: ${agentPanelHeight}px;`}
      >
        <div class="section-header">
          <h4 class="section-title">
            {$t("agentMemory")}
            {#if agentMemories.length > 0}
              <span class="count-badge">{agentMemories.length}</span>
            {/if}
          </h4>
          <Tooltip text={agentCollapsed ? $t("expandSection") : $t("collapseSection")}>
            <button
              class="section-toggle-btn"
              aria-label={agentCollapsed ? $t("expandSection") : $t("collapseSection")}
              aria-expanded={!agentCollapsed}
              onclick={() => (agentCollapsed = !agentCollapsed)}
            >
              <svg
                class:expanded={!agentCollapsed}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </button>
          </Tooltip>
        </div>

        {#if !agentCollapsed}
          {#if agentMemoriesLoading}
            <LoadingSkeleton variant="memory-list" rows={3} label={$t("loadingContent")} />
          {:else if agentMemories.length === 0}
            <div class="agent-empty">
              <div class="agent-empty-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
                  <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
                </svg>
              </div>
              <p class="agent-empty-text">{$t("agentMemoryEmpty")}</p>
              <p class="agent-empty-hint">{$t("agentMemoryHint")}</p>
            </div>
          {:else}
            <div class="agent-list">
              {#each agentMemories as entry (entry.id)}
                <div class="agent-entry">
                  <div class="agent-entry-meta">
                    <span class="agent-entry-time">{formatDate(entry.created_at)}</span>
                    {#if entry.source_conv_id && entry.source_message_id}
                      <button
                        type="button"
                        class="agent-source-btn"
                        onclick={() =>
                          onOpenSource(entry.source_conv_id!, entry.source_message_id!)}
                        >{$t("memorySource")}</button
                      >
                    {/if}
                  </div>
                  <div class="agent-entry-body">
                    <p class="agent-entry-content">{entry.content}</p>
                    <Tooltip text={$t("deleteMemory")}>
                      <button
                        class="agent-delete-btn"
                        aria-label={$t("deleteMemory")}
                        onclick={() => deleteAgentMemory(entry.id)}
                      >
                        <svg
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                        >
                          <path d="M3 4h10M6 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4" />
                          <path d="M5 4l.5 9h5l.5-9" />
                          <path d="M7 7v4M9 7v4" />
                        </svg>
                      </button>
                    </Tooltip>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/snippet}

  {@render bodyPanel()}
</div>

<style>
  .memory-panel {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
  }

  .memory-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    background: var(--bg);
    height: 48px;
    flex-shrink: 0;
  }

  .memory-header-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .title-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sync-dot {
    color: var(--primary);
    font-size: 10px;
    margin-right: 2px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  :global(.memory-body) {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ─── Content col ─────────────────────────────────────────────────────────── */

  .memory-content-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .memory-section {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .user-section {
    flex: 1;
    min-height: 0;
  }

  .memory-section.collapsed {
    flex: 0 0 auto;
    min-height: 0;
  }

  .header-leading {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .agent-section {
    height: 280px;
    flex-shrink: 0;
  }

  .user-section.collapsed + .memory-resizer + .agent-section:not(.collapsed) {
    flex: 1;
    height: auto;
  }

  .agent-section.collapsed {
    height: auto;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 20px 8px;
    background: var(--bg);
    flex-shrink: 0;
  }

  .section-toggle-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    transition:
      background 0.12s,
      color 0.12s;
  }

  .section-toggle-btn:hover {
    background: var(--surface2);
    color: var(--text);
  }

  .section-toggle-btn svg {
    width: 14px;
    height: 14px;
    transform: rotate(-90deg);
    transition: transform 0.12s;
  }

  .section-toggle-btn svg.expanded {
    transform: rotate(0deg);
  }

  .memory-resizer {
    position: relative;
    height: 7px;
    flex: 0 0 7px;
    background: var(--bg);
    cursor: row-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
  }

  .memory-resizer::before {
    content: "";
    position: absolute;
    inset: -4px 0;
  }

  .memory-resizer span {
    width: 28px;
    height: 1px;
    background: color-mix(in srgb, var(--border) 55%, transparent);
  }

  .memory-resizer:hover,
  :global(.memory-resizing) .memory-resizer {
    background: color-mix(in srgb, var(--surface2) 45%, transparent);
  }

  .memory-resizer:hover span,
  :global(.memory-resizing) .memory-resizer span {
    background: color-mix(in srgb, var(--primary) 70%, transparent);
  }

  .memory-resizer.disabled {
    cursor: default;
  }

  .memory-resizer.disabled span {
    opacity: 0.35;
  }

  :global(.memory-resizing) {
    cursor: row-resize;
    user-select: none;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.04em;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .count-badge {
    background: var(--surface2);
    border: 0;
    border-radius: 10px;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: none;
    letter-spacing: 0;
  }

  /* ─── Markdown editor ─────────────────────────────────────────────────────── */

  :global(.memory-mdx-editor) {
    flex: 1;
    min-height: 0;
    border: none;
  }

  /* ─── Agent memories ──────────────────────────────────────────────────────── */

  .agent-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    color: var(--text-muted);
    flex: 1;
  }

  .agent-empty-icon {
    width: 28px;
    height: 28px;
    color: var(--text-muted);
    opacity: 0.4;
  }

  .agent-empty-icon svg {
    width: 100%;
    height: 100%;
  }

  .agent-empty-text {
    font-size: 13px;
    color: var(--text-muted);
    margin: 0;
  }

  .agent-empty-hint {
    font-size: 11px;
    color: var(--text-muted);
    opacity: 0.7;
    margin: 0;
    text-align: center;
  }

  .agent-list {
    overflow-y: auto;
    padding: 6px 8px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .agent-entry {
    border: 0;
    border-radius: 8px;
    background: var(--surface);
    overflow: hidden;
    flex-shrink: 0;
    box-shadow: var(--control-shadow);
  }

  .agent-entry-meta {
    padding: 5px 10px 0;
  }

  .agent-entry-time {
    font-size: 10px;
    color: var(--text-muted);
  }

  .agent-source-btn {
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--primary);
    font: inherit;
    cursor: pointer;
  }

  .agent-source-btn:hover {
    text-decoration: underline;
  }

  .agent-entry-body {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 8px 8px 10px;
  }

  .agent-entry-content {
    flex: 1;
    font-size: 13px;
    color: var(--text);
    line-height: 1.5;
    margin: 0;
    word-break: break-word;
  }

  .agent-delete-btn {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-muted);
    transition:
      background 0.12s,
      color 0.12s;
    padding: 3px;
    margin-top: 1px;
  }

  .agent-delete-btn:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #dc2626;
  }

  .agent-delete-btn svg {
    width: 100%;
    height: 100%;
  }
</style>
