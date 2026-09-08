<script lang="ts">
  import { t } from "$lib/i18n";
  import type { FileChangeDiffLine } from "$lib/fileChangeDiff";

  let {
    lines,
    compact = false,
  }: {
    lines: FileChangeDiffLine[];
    compact?: boolean;
  } = $props();
</script>

<div class="diff-viewport" class:compact>
  {#if lines.length > 0}
    <div class="diff-table">
      {#each lines as line, index (`${line.type}-${index}`)}
        <div class="diff-row {line.type}">
          <span class="line-number">{line.oldLine ?? ""}</span>
          <span class="line-number">{line.newLine ?? ""}</span>
          <code>{line.text || " "}</code>
        </div>
      {/each}
    </div>
  {:else}
    <div class="diff-empty">
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M5 2.75h6l4 4v10.5H5z" />
        <path d="M11 2.75v4h4M7.5 11h5M7.5 13.75h3.5" />
      </svg>
      <span>{$t("fileChangePreviewUnavailable")}</span>
    </div>
  {/if}
</div>

<style>
  .diff-viewport {
    min-width: 0;
    min-height: 0;
    flex: 1;
    overflow: auto;
    background: color-mix(in srgb, var(--surface) 88%, var(--bg));
  }
  .diff-viewport.compact {
    max-height: 280px;
    flex: 0 1 auto;
  }
  .diff-table {
    width: 100%;
    padding: 8px 0;
  }
  .diff-row {
    display: grid;
    grid-template-columns: 34px 34px minmax(0, 1fr);
    color: var(--text-muted);
    font:
      400 11px/1.55 "JetBrains Mono",
      monospace;
  }
  .diff-row > * {
    box-sizing: border-box;
  }
  .line-number {
    width: 34px;
    padding: 0 6px;
    border-right: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
    color: color-mix(in srgb, var(--text-muted) 65%, transparent);
    text-align: right;
    user-select: none;
  }
  .diff-row code {
    min-width: 0;
    padding: 0 10px;
    color: inherit;
    font: inherit;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .diff-row.add {
    background: color-mix(in srgb, #18794e 12%, transparent);
    color: color-mix(in srgb, #18794e 85%, var(--text));
  }
  .diff-row.remove {
    background: color-mix(in srgb, #b42318 11%, transparent);
    color: color-mix(in srgb, #b42318 82%, var(--text));
  }
  .diff-empty {
    display: grid;
    min-height: 100%;
    place-content: center;
    justify-items: center;
    gap: 9px;
    padding: 24px;
    box-sizing: border-box;
    color: var(--text-muted);
    font-size: 11px;
    text-align: center;
  }
  .diff-empty svg {
    width: 28px;
    height: 28px;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.2;
  }
</style>
