<script lang="ts">
  import { t } from "$lib/i18n";
  import { diffCodeText, type FileChangeDiffLine } from "$lib/fileChangeDiff";
  import type { ThemedToken } from "shiki/core";
  import { highlightDiffInWorker } from "$lib/streamdown/diffHighlightClient";

  let {
    lines,
    compact = false,
    scrollable = true,
    path = "",
    contentMode = false,
    fullFile = false,
    emptyLabel = "",
  }: {
    lines: FileChangeDiffLine[];
    compact?: boolean;
    scrollable?: boolean;
    path?: string;
    contentMode?: boolean;
    fullFile?: boolean;
    emptyLabel?: string;
  } = $props();

  let singleLineNumbers = $derived(
    fullFile || contentMode || lines.every((line) => line.type !== "context"),
  );
  let hasLineNumbers = $derived(lines.some((line) => line.oldLine != null || line.newLine != null));
  let highlighted = $state.raw<{
    lines: FileChangeDiffLine[];
    path: string;
    tokens: ThemedToken[][];
  } | null>(null);
  const tokens = $derived(
    highlighted?.lines === lines && highlighted.path === path ? highlighted.tokens : null,
  );
  $effect(() => {
    const source = lines;
    const filename = path;
    const controller = new AbortController();
    void highlightDiffInWorker(source, filename, controller.signal).then((tokens) => {
      if (!controller.signal.aborted && tokens)
        highlighted = { lines: source, path: filename, tokens };
    });
    return () => controller.abort();
  });

  function tokenStyle(token: ThemedToken): string {
    return Object.entries(token.htmlStyle ?? {})
      .map(([key, value]) => `${key}:${value}`)
      .join(";");
  }
</script>

<div
  class="diff-viewport"
  class:compact
  class:scrollable
  class:full-file={fullFile}
  style:--full-file-gutter-width={`${Math.max(32, (String(lines.length).length + 1) * 7)}px`}
>
  {#if lines.length > 0}
    <div class="diff-table">
      {#each lines as line, index (`${line.type}-${index}`)}
        <div
          class="diff-row {line.type}"
          class:single-line-numbers={singleLineNumbers}
          class:content-mode={contentMode}
          class:full-file={fullFile}
          class:unnumbered={!hasLineNumbers}
        >
          {#if hasLineNumbers && singleLineNumbers}
            <span class="line-number">{line.newLine ?? line.oldLine ?? ""}</span>
          {:else if hasLineNumbers}
            <span class="line-number">{line.oldLine ?? ""}</span>
            <span class="line-number">{line.newLine ?? ""}</span>
          {/if}
          {#if !contentMode}<span class="line-marker" aria-hidden="true"
              >{line.type === "add" ? "+" : line.type === "remove" ? "−" : ""}</span
            >{/if}
          <code
            >{#if tokens?.[index]?.length}{#each tokens[index] as token, tokenIndex (tokenIndex)}<span
                  class="diff-token"
                  style={tokenStyle(token)}>{token.content}</span
                >{/each}{:else}{diffCodeText(line) || " "}{/if}</code
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
      <span>{emptyLabel || $t("fileChangePreviewUnavailable")}</span>
    </div>
  {/if}
</div>

<style>
  .diff-viewport {
    min-width: 0;
    min-height: 0;
    flex: 1;
    overflow-x: hidden;
    background: var(--component-neutral-bg, color-mix(in srgb, var(--card) 88%, var(--background)));
    color-scheme: light dark;
  }
  .diff-viewport.scrollable {
    overflow-y: auto;
  }
  .diff-viewport.compact {
    max-height: 280px;
    width: 100%;
    flex: 1 1 auto;
  }
  .diff-table {
    width: 100%;
    min-width: 0;
    padding: 6px 0;
  }
  .diff-row {
    display: grid;
    grid-template-columns: 44px 44px 24px minmax(0, 1fr);
    width: 100%;
    min-width: 0;
    min-height: 20px;
    align-items: start;
    color: var(--muted-foreground);
    font:
      400 var(--code-font-size, 12px)/1.6 "JetBrains Mono",
      monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .diff-row > * {
    box-sizing: border-box;
  }
  .line-number {
    width: 44px;
    padding: 0 8px;
    border-right: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
    color: color-mix(in srgb, var(--muted-foreground) 65%, transparent);
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
  .diff-row.content-mode {
    grid-template-columns: 44px minmax(0, 1fr);
    color: var(--foreground);
  }
  .diff-row code {
    min-width: 0;
    padding: 0 12px 0 4px;
    color: inherit;
    font: inherit;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .diff-viewport.full-file,
  .diff-viewport.full-file .diff-table {
    width: max-content;
    min-width: 100%;
    overflow: visible;
  }
  .diff-row.full-file {
    grid-template-columns: var(--full-file-gutter-width) 18px minmax(0, 1fr);
    font-size: 11px;
    color: var(--foreground);
  }
  .diff-row.full-file .line-number {
    width: var(--full-file-gutter-width);
    padding: 0 6px;
  }
  .diff-row.full-file .line-marker {
    width: 18px;
  }
  .diff-row.full-file code {
    white-space: pre;
    overflow-wrap: normal;
    tab-size: 4;
  }
  .diff-row.unnumbered {
    grid-template-columns: 18px minmax(0, 1fr);
  }
  .diff-row.unnumbered .line-marker {
    width: 18px;
  }
  .diff-row.unnumbered.content-mode {
    grid-template-columns: minmax(0, 1fr);
  }
  .diff-row.add {
    background: color-mix(in srgb, #18794e 24%, transparent);
    color: var(--foreground);
  }
  .diff-token {
    color: var(--shiki-light, inherit);
    font-style: var(--shiki-light-font-style, normal);
    font-weight: var(--shiki-light-font-weight, normal);
    text-decoration: var(--shiki-light-text-decoration, none);
  }
  :global(.dark) .diff-token {
    color: var(--shiki-dark, inherit);
    font-style: var(--shiki-dark-font-style, normal);
    font-weight: var(--shiki-dark-font-weight, normal);
    text-decoration: var(--shiki-dark-text-decoration, none);
  }
  .diff-row.remove {
    background: color-mix(in srgb, #b42318 24%, transparent);
    color: var(--foreground);
  }
  .diff-row.add .line-marker {
    color: color-mix(in srgb, #18794e 82%, var(--foreground));
  }
  .diff-row.remove .line-marker {
    color: color-mix(in srgb, #b42318 82%, var(--foreground));
  }
  .diff-empty {
    display: grid;
    min-height: 100%;
    place-content: center;
    justify-items: center;
    gap: 9px;
    padding: 24px;
    box-sizing: border-box;
    color: var(--muted-foreground);
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
