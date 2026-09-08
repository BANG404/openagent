<script lang="ts">
  import { t } from "$lib/i18n";
  import { fileChangeDiffLines } from "$lib/fileChangeDiff";
  import type { FileChange } from "$lib/types";
  import FileDiffView from "./FileDiffView.svelte";
  import Tooltip from "./Tooltip.svelte";

  let {
    changes,
    onRevert,
  }: {
    changes: FileChange[];
    onRevert: (changeId: string) => Promise<void>;
  } = $props();

  let selectedId = $state<string | null>(null);
  let revertingIds = $state(new Set<string>());
  let selectedChange = $derived(changes.find((change) => change.id === selectedId) ?? changes[0]);
  let diffLines = $derived(fileChangeDiffLines(selectedChange));

  $effect(() => {
    if (!changes.some((change) => change.id === selectedId)) selectedId = changes[0]?.id ?? null;
  });

  function filename(path: string): string {
    return path.split(/[/\\]/).filter(Boolean).at(-1) ?? path;
  }

  async function handleRevert(id: string): Promise<void> {
    revertingIds = new Set(revertingIds).add(id);
    try {
      await onRevert(id);
    } finally {
      const next = new Set(revertingIds);
      next.delete(id);
      revertingIds = next;
    }
  }
</script>

<div class="file-panel">
  <div class="file-tabs" role="tablist" aria-label={$t("fileChangesPanelTabs")}>
    {#each changes as change (change.id)}
      <Tooltip text={change.path} side="bottom">
        {#snippet trigger(props)}
          <button
            {...props}
            class="file-tab"
            class:active={selectedChange?.id === change.id}
            type="button"
            role="tab"
            aria-selected={selectedChange?.id === change.id}
            onclick={() => (selectedId = change.id)}
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3.25 1.75h5.1l4.4 4.4v7.1a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1V2.75a1 1 0 0 1 1-1Z"
              />
              <path d="M8.25 1.75v4.5h4.5" />
            </svg>
            <span>{filename(change.path)}</span>
            <i class:created={change.old_patch === null} aria-hidden="true"></i>
          </button>
        {/snippet}
      </Tooltip>
    {/each}
  </div>

  {#if selectedChange}
    <div class="file-toolbar">
      <Tooltip text={selectedChange.path}>
        {#snippet trigger(props)}
          <span {...props} class="file-path">{selectedChange.path}</span>
        {/snippet}
      </Tooltip>
      <span class="change-kind">
        {$t(selectedChange.old_patch === null ? "fileChangeCreated" : "fileChangeEdited")}
      </span>
      <Tooltip
        text={$t(
          selectedChange.old_patch === null ? "fileChangeDeleteCreated" : "fileChangeRestoreEdited",
        )}
      >
        {#snippet trigger(props)}
          <button
            {...props}
            class="revert-button"
            type="button"
            disabled={revertingIds.has(selectedChange.id)}
            aria-label={$t("fileChangeRevert")}
            onclick={() => handleRevert(selectedChange.id)}
          >
            {#if revertingIds.has(selectedChange.id)}
              <span aria-hidden="true">...</span>
            {:else}
              <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M6.2 5.1H3.1V2" />
                <path d="M3.35 5.05a6.2 6.2 0 1 1-.35 7.3" />
              </svg>
            {/if}
          </button>
        {/snippet}
      </Tooltip>
    </div>

    <div class="diff-host" role="tabpanel">
      <FileDiffView lines={diffLines} />
    </div>
  {/if}
</div>

<style>
  .file-panel {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    container-type: inline-size;
  }
  .file-tabs {
    display: flex;
    min-height: 39px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 5px 6px 0;
    border-bottom: 1px solid var(--border);
    scrollbar-width: thin;
  }
  .file-tab {
    position: relative;
    display: flex;
    min-width: 104px;
    max-width: 184px;
    height: 33px;
    flex: 1 0 112px;
    align-items: center;
    gap: 6px;
    padding: 0 9px;
    border: 0;
    border-radius: 6px 6px 0 0;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .file-tab:hover,
  .file-tab:focus-visible {
    background: var(--interactive-state-bg);
    color: var(--text);
    outline: none;
  }
  .file-tab:focus-visible {
    box-shadow: inset var(--focus-ring);
  }
  .file-tab.active {
    background: var(--surface2);
    color: var(--text);
  }
  .file-tab.active::after {
    position: absolute;
    inset: auto 0 -1px;
    height: 2px;
    background: var(--primary);
    content: "";
  }
  .file-tab svg {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.35;
  }
  .file-tab span {
    overflow: hidden;
    min-width: 0;
    flex: 1;
    font-size: 11px;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-tab i {
    width: 6px;
    height: 6px;
    flex: 0 0 6px;
    border-radius: 50%;
    background: var(--primary);
  }
  .file-tab i.created {
    background: #18794e;
  }
  .file-toolbar {
    display: flex;
    box-sizing: border-box;
    width: 100%;
    min-height: 39px;
    min-width: 0;
    overflow: hidden;
    align-items: center;
    gap: 7px;
    padding: 0 8px 0 11px;
    border-bottom: 1px solid var(--border);
  }
  .file-path {
    overflow: hidden;
    min-width: 0;
    flex: 1 1 0;
    color: var(--text-muted);
    font:
      400 10px/1.4 "JetBrains Mono",
      monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .change-kind {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: 10px;
  }
  .revert-button {
    display: grid;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .revert-button:hover:not(:disabled),
  .revert-button:focus-visible {
    background: color-mix(in srgb, #b42318 9%, transparent);
    color: #b42318;
    outline: none;
  }
  .revert-button:focus-visible {
    box-shadow: var(--focus-ring);
  }
  .revert-button:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .revert-button svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.5;
  }
  .diff-host {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
  }
  @container (max-width: 220px) {
    .change-kind {
      display: none;
    }
  }
</style>
