<script lang="ts">
  import { useOpenAgentUiCapabilities } from "$lib/openagent/uiCapabilities";
  import { onDestroy } from "svelte";
  import { t } from "$lib/i18n";
  import type { Value } from "../parser";
  import { parseFileLineRange } from "../fileLines";
  import Tooltip from "$lib/components/Tooltip.svelte";
  import {
    clearContainingFilePreviewOpen,
    setContainingFilePreviewOpen,
  } from "../filePreviewContainment";

  let {
    args,
  }: {
    args: Record<string, unknown>;
    rawArgs?: Array<[string, Value]>;
  } = $props();

  const path = $derived(typeof args.path === "string" ? args.path : "");
  const lines = $derived(
    typeof args.lines === "string" || typeof args.lines === "number" ? String(args.lines) : "",
  );
  const lineRange = $derived(parseFileLineRange(args.lines));
  const label = $derived(typeof args.label === "string" ? args.label : "");

  let previewOpen = $state(false);
  let previewLoading = $state(false);
  let previewError = $state("");
  const capabilities = useOpenAgentUiCapabilities();
  let preview = $state<Awaited<ReturnType<typeof capabilities.readTextSnippet>> | null>(null);
  let loadedKey = $state("");
  let referenceElement: HTMLSpanElement;
  let previewMessageRecord: HTMLElement | null = null;

  const filename = $derived(path.split(/[\\/]/).pop() ?? path);
  const dirHint = $derived(() => {
    const parts = path.split(/[\\/]/);
    if (parts.length <= 1) return "";
    return parts.slice(0, -1).join("/");
  });

  async function open() {
    if (!path) return;
    try {
      await capabilities.openPath(path);
    } catch (e) {
      console.warn("open_path failed", e);
      const msg = typeof e === "string" ? e : ((e as { message?: string })?.message ?? String(e));
      alert(msg);
    }
  }

  async function showPreview() {
    if (!path || !lineRange) return;
    setPreviewOpen(true);
    const key = `${path}:${lineRange.start}-${lineRange.end}`;
    if (loadedKey === key && (preview || previewError)) return;

    loadedKey = key;
    preview = null;
    previewError = "";
    previewLoading = true;
    try {
      preview = await capabilities.readTextSnippet(path, lineRange.start, lineRange.end);
    } catch (error) {
      previewError = typeof error === "string" ? error : "Preview unavailable";
    } finally {
      previewLoading = false;
    }
  }

  function setPreviewOpen(open: boolean) {
    previewOpen = open;
    if (open) {
      previewMessageRecord = setContainingFilePreviewOpen(referenceElement);
    } else {
      clearContainingFilePreviewOpen(previewMessageRecord);
      previewMessageRecord = null;
    }
  }

  onDestroy(() => setPreviewOpen(false));
</script>

<span
  bind:this={referenceElement}
  class="file-reference"
  role="group"
  aria-label={path}
  onmouseenter={showPreview}
  onmouseleave={() => setPreviewOpen(false)}
>
  <Tooltip text={lineRange ? "" : path}>
    {#snippet trigger(props)}
      <button
        {...props}
        class="file-ref"
        onclick={open}
        onfocus={showPreview}
        onblur={() => setPreviewOpen(false)}
        disabled={!path}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          width="13"
          height="13"
          aria-hidden="true"
        >
          <path d="M3 2.5h6l4 4V13a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 13V3a.5.5 0 0 1 .5-.5z" />
          <path d="M9 2.5V6.5h4" />
        </svg>
        <span class="name">{label || filename}</span>{#if lines}<span class="lines">:{lines}</span
          >{/if}{#if dirHint() && !label}<span class="dir">{dirHint()}</span>{/if}
      </button>
    {/snippet}
  </Tooltip>
  {#if previewOpen && lineRange}
    <span class="file-preview" role="tooltip">
      <span class="preview-heading">{path}:{lineRange.start}-{lineRange.end}</span>
      {#if previewLoading}
        <span class="preview-status">{$t("filePreviewLoading")}</span>
      {:else if previewError}
        <Tooltip text={previewError}>
          <span class="preview-status preview-error">{$t("filePreviewUnavailable")}</span>
        </Tooltip>
      {:else if preview}
        <span class="preview-code">
          {#each preview.lines as content, index (preview.startLine + index)}
            <span class="preview-row">
              <span class="preview-line">{preview.startLine + index}</span>
              <span class="preview-content">{content}</span>
            </span>
          {:else}
            <span class="preview-status">{$t("filePreviewEmpty")}</span>
          {/each}
        </span>
      {/if}
    </span>
  {/if}
</span>

<style>
  .file-reference {
    position: relative;
    display: inline-flex;
    vertical-align: baseline;
  }

  .file-ref {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    padding: 1px 7px 1px 6px;
    margin: 0 2px;
    border-radius: 5px;
    border: 1px solid var(--border);
    background: var(--surface2);
    color: var(--text);
    font-size: 0.92em;
    line-height: 1.3;
    cursor: pointer;
    vertical-align: baseline;
    transition:
      background 0.12s,
      border-color 0.12s;
    font-family: inherit;
  }
  .file-ref:hover:not(:disabled) {
    background: var(--interactive-state-bg);
    border-color: var(--primary);
  }
  .file-ref:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .file-ref svg {
    color: var(--text-muted);
    flex-shrink: 0;
    transform: translateY(1px);
  }
  .name {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.94em;
  }
  .lines {
    color: var(--text-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.88em;
  }
  .dir {
    color: var(--text-muted);
    font-size: 0.8em;
    margin-left: 2px;
  }

  .file-preview {
    position: absolute;
    z-index: 30;
    top: calc(100% + 5px);
    left: 0;
    display: flex;
    flex-direction: column;
    width: min(640px, calc(100vw - 48px));
    max-height: 320px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
    text-align: left;
  }

  .preview-heading,
  .preview-status {
    display: block;
    padding: 7px 10px;
    color: var(--text-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
  }

  .preview-heading {
    overflow: hidden;
    border-bottom: 1px solid var(--border);
    background: var(--surface2);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-code {
    display: block;
    overflow: auto;
    padding: 5px 0;
    background: var(--bg);
  }

  .preview-row {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr);
    min-width: max-content;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.55;
  }

  .preview-line {
    padding: 0 8px;
    border-right: 1px solid var(--border);
    color: var(--text-muted);
    text-align: right;
    user-select: none;
  }

  .preview-content {
    padding: 0 10px;
    white-space: pre;
  }

  .preview-error {
    color: var(--danger, #dc2626);
  }
</style>
