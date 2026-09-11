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

  let singleLineNumbers = $derived(lines.every((line) => line.type !== "context"));
</script>

<div class="diff-viewport" class:compact>
  {#if lines.length > 0}
    <div class="diff-table">
      {#each lines as line, index (`${line.type}-${index}`)}
        <div class="diff-row {line.type}" class:single-line-numbers={singleLineNumbers}>
          {#if singleLineNumbers}
            <span class="line-number">{line.newLine ?? line.oldLine ?? ""}</span>
          {:else}
            <span class="line-number">{line.oldLine ?? ""}</span>
            <span class="line-number">{line.newLine ?? ""}</span>
          {/if}
          <span class="line-marker" aria-hidden="true"
            >{line.type === "add" ? "+" : line.type === "remove" ? "−" : ""}</span
          >
          <code
            >{line.type === "add" || line.type === "remove"
              ? line.text.slice(1) || " "
              : line.text || " "}</code
          >
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
    background: var(--component-neutral-bg, color-mix(in srgb, var(--surface) 88%, var(--bg)));
    color-scheme: light dark;
  }
  .diff-viewport.compact {
    max-height: 280px;
    flex: 0 1 auto;
  }
  .diff-table {
    width: max-content;
    min-width: 100%;
    padding: 6px 0;
  }
  .diff-row {
    display: grid;
    grid-template-columns: 44px 44px 24px minmax(0, 1fr);
    width: 100%;
    min-height: 20px;
    color: var(--text-muted);
    font:
      400 12px/20px "JetBrains Mono",
      monospace;
    white-space: pre;
  }
  .diff-row > * {
    box-sizing: border-box;
  }
  .line-number {
    width: 44px;
    padding: 0 8px;
    border-right: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
    color: color-mix(in srgb, var(--text-muted) 65%, transparent);
    text-align: right;
    user-select: none;
  }
  .line-marker {
    width: 24px;
    color: color-mix(in srgb, currentColor 82%, transparent);
    text-align: center;
    user-select: none;
  }
  .diff-row.single-line-numbers {
    grid-template-columns: 44px 24px minmax(0, 1fr);
  }
  .diff-row code {
    min-width: 0;
    padding: 0 12px 0 4px;
    color: inherit;
    font: inherit;
    white-space: pre;
  }
  .diff-row.add {
    background: color-mix(in srgb, #18794e 24%, transparent);
    color: var(--text);
  }
  .diff-row.remove {
    background: color-mix(in srgb, #b42318 24%, transparent);
    color: var(--text);
  }
  .diff-row.add .line-marker {
    color: color-mix(in srgb, #18794e 82%, var(--text));
  }
  .diff-row.remove .line-marker {
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
