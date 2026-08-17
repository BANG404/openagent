<script lang="ts">
  import type { FileChange } from "$lib/types";
  import { t } from "$lib/i18n";
  import Tooltip from "./Tooltip.svelte";

  let {
    changes,
    onRevert,
  }: {
    changes: FileChange[];
    onRevert: (changeId: string) => Promise<void>;
  } = $props();

  let expanded = $state(false);
  let expandedDiffs = $state(new Set<string>());
  let revertingIds = $state(new Set<string>());

  function toggleExpand() {
    expanded = !expanded;
  }

  function toggleDiff(id: string) {
    const next = new Set(expandedDiffs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedDiffs = next;
  }

  function shortPath(path: string): string {
    const parts = path.split(/[/\\]/);
    if (parts.length <= 2) return path;
    return "…/" + parts.slice(-2).join("/");
  }

  type DiffLine = { type: "add" | "remove" | "context" | "header"; text: string };

  function parseDiff(patch: string): DiffLine[] {
    // Stored patch is a reverse diff (new → old) for revert. For display we
    // want forward (old → new), so flip + / - and rewrite the line prefix.
    return patch.split("\n").map((line) => {
      if (line.startsWith("+++") || line.startsWith("---")) return { type: "header", text: line };
      if (line.startsWith("@@")) return { type: "header", text: line };
      if (line.startsWith("+")) return { type: "remove", text: "-" + line.slice(1) };
      if (line.startsWith("-")) return { type: "add", text: "+" + line.slice(1) };
      return { type: "context", text: line };
    });
  }

  async function handleRevert(id: string) {
    const s = new Set(revertingIds);
    s.add(id);
    revertingIds = s;
    try {
      await onRevert(id);
    } finally {
      const s2 = new Set(revertingIds);
      s2.delete(id);
      revertingIds = s2;
    }
  }

  $effect(() => {
    // Collapse diffs when banner collapses
    if (!expanded) expandedDiffs = new Set();
  });
</script>

<div class="banner conversation-input-surface">
  <button class="banner-header" onclick={toggleExpand}>
    <svg
      class="banner-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M9 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V7L9 2z" />
      <path d="M9 2v5h5" />
    </svg>
    <span class="banner-title"
      >{changes.length}
      {$t(changes.length === 1 ? "fileChangeModified" : "fileChangesModified")}</span
    >
    <svg
      class="banner-chevron"
      class:open={expanded}
      viewBox="0 0 10 6"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M1 1l4 4 4-4" />
    </svg>
  </button>

  {#if expanded}
    <div class="banner-list">
      {#each changes as change (change.id)}
        <div class="change-row">
          <div class="change-main">
            <svg
              class="change-icon"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M2 4h12M2 8h8M2 12h5" />
            </svg>
            <Tooltip text={change.path}>
              <span class="change-path">{shortPath(change.path)}</span>
            </Tooltip>
            <span
              class="change-op"
              class:change-op-write={change.old_patch === null}
              class:change-op-edit={change.old_patch !== null}
              >{$t(change.old_patch === null ? "fileChangeCreated" : "fileChangeEdited")}</span
            >
            <div class="change-actions">
              {#if change.old_patch !== null}
                <Tooltip text={$t("fileChangeViewDiff")}>
                  <button
                    class="diff-btn"
                    class:active={expandedDiffs.has(change.id)}
                    onclick={() => toggleDiff(change.id)}>diff</button
                  >
                </Tooltip>
              {/if}
              <Tooltip
                text={$t(
                  change.old_patch === null ? "fileChangeDeleteCreated" : "fileChangeRestoreEdited",
                )}
              >
                <button
                  class="revert-btn"
                  disabled={revertingIds.has(change.id)}
                  onclick={() => handleRevert(change.id)}
                >
                  {revertingIds.has(change.id) ? "…" : $t("fileChangeRevert")}
                </button>
              </Tooltip>
            </div>
          </div>

          {#if expandedDiffs.has(change.id) && change.old_patch}
            <div class="diff-view">
              {#each parseDiff(change.old_patch) as line, index (`${line.type}-${index}`)}
                {#if line.type !== "header"}
                  <div class="diff-line diff-{line.type}">{line.text}</div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .banner {
    margin-bottom: 8px;
    overflow: hidden;
  }

  .banner-header {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    background: none;
    border: none;
    padding: 8px 12px;
    cursor: pointer;
    text-align: left;
    color: var(--text-muted);
    font-size: 12px;
    transition: background 0.12s;
    user-select: none;
  }

  .banner-header:hover {
    background: var(--surface2);
  }

  .banner-icon {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    color: var(--primary);
  }

  .banner-title {
    flex: 1;
    font-size: 12px;
    color: var(--text-muted);
  }

  .banner-chevron {
    width: 10px;
    height: 10px;
    flex-shrink: 0;
    transition: transform 0.15s;
  }

  .banner-chevron.open {
    transform: rotate(180deg);
  }

  .banner-list {
    border-top: 1px solid var(--border);
    max-height: 260px;
    overflow-y: auto;
  }

  .change-row {
    border-bottom: 1px solid var(--border);
  }

  .change-row:last-child {
    border-bottom: none;
  }

  .change-main {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 10px;
    min-width: 0;
  }

  .change-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .change-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: var(--text);
  }

  .change-op {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    flex-shrink: 0;
    font-weight: 500;
  }

  .change-op-write {
    background: rgba(34, 197, 94, 0.12);
    color: #16a34a;
  }

  .change-op-edit {
    background: rgba(99, 102, 241, 0.12);
    color: var(--primary);
  }

  .change-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .diff-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 10px;
    color: var(--text-muted);
    cursor: pointer;
    font-family: "JetBrains Mono", monospace;
    transition:
      background 0.1s,
      color 0.1s,
      border-color 0.1s;
  }

  .diff-btn:hover,
  .diff-btn.active {
    background: var(--surface2);
    border-color: var(--primary);
    color: var(--primary);
  }

  .revert-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 11px;
    color: var(--text-muted);
    cursor: pointer;
    transition:
      background 0.1s,
      color 0.1s,
      border-color 0.1s;
  }

  .revert-btn:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.35);
    color: #ef4444;
  }

  .revert-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .diff-view {
    border-top: 1px solid var(--border);
    background: var(--bg);
    max-height: 140px;
    overflow-y: auto;
    overflow-x: auto;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    line-height: 1.55;
  }

  .diff-line {
    padding: 0 12px;
    white-space: pre;
  }

  .diff-add {
    background: rgba(34, 197, 94, 0.1);
    color: #16a34a;
  }

  .diff-remove {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .diff-context {
    color: var(--text-muted);
  }
</style>
