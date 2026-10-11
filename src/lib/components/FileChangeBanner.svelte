<script lang="ts">
  import type { FileChange } from "$lib/types";
  import { t } from "$lib/i18n";
  import FileChangePanel from "./FileChangePanel.svelte";

  let { changes }: { changes: FileChange[] } = $props();
  let expanded = $state(false);
</script>

<div class="banner conversation-input-surface">
  <button
    class="banner-header"
    type="button"
    aria-expanded={expanded}
    onclick={() => (expanded = !expanded)}
  >
    <svg
      class="banner-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      aria-hidden="true"
    >
      <path d="M9 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7L9 2zM9 2v5h5" />
    </svg>
    <span
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
      aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg
    >
  </button>
  <div class="banner-list" hidden={!expanded}>
    <FileChangePanel {changes} />
  </div>
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
  }
  .banner-header:hover {
    background: var(--interactive-state-bg);
  }
  .banner-header:focus-visible {
    outline: none;
    box-shadow: inset var(--focus-ring);
  }
  .banner-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }
  .banner-chevron {
    width: 10px;
    height: 6px;
    margin-left: auto;
    transition: transform var(--motion-fast) var(--ease-standard);
  }
  .banner-chevron.open {
    transform: rotate(180deg);
  }
  .banner-list {
    display: flex;
    height: 380px;
    min-height: 0;
    border-top: 1px solid var(--border);
  }
  .banner-list[hidden] {
    display: none;
  }
</style>
