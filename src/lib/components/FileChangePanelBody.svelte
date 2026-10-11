<script lang="ts">
  import { Accordion } from "bits-ui";
  import { t } from "$lib/i18n";
  import { fileChangeContent, fileChangeFullDiffLines } from "$lib/fileChangeDiff";
  import type { FileChange } from "$lib/types";
  import FileDiffView from "./FileDiffView.svelte";
  import ScrollArea from "./ui/ScrollArea.svelte";
  import Tooltip from "./Tooltip.svelte";

  let {
    changes,
    onRevert,
    expandedPath = $bindable<string | null>(null),
  }: {
    changes: FileChange[];
    onRevert: (changeId: string) => Promise<void>;
    expandedPath?: string | null;
  } = $props();

  let revertingIds = $state(new Set<string>());
  let errors = $state<Record<string, string>>({});

  $effect(() => {
    // Empty string is an explicit collapse; null is a new conversation/branch.
    if (
      changes.length &&
      (expandedPath === null ||
        (expandedPath !== "" && !changes.some((change) => change.path === expandedPath)))
    )
      expandedPath = changes[0].path;
  });

  function filename(path: string): string {
    return path.split(/[/\\]/).at(-1) || path;
  }

  async function handleRevert(change: FileChange): Promise<void> {
    revertingIds = new Set(revertingIds).add(change.id);
    errors = { ...errors, [change.id]: "" };
    try {
      await onRevert(change.id);
    } catch (error) {
      errors = { ...errors, [change.id]: String(error) };
    } finally {
      const next = new Set(revertingIds);
      next.delete(change.id);
      revertingIds = next;
    }
  }
</script>

<div class="file-panel">
  <ScrollArea height="100%" class="file-list-scroll" scrollHideDelay={350}>
    <Accordion.Root
      type="single"
      value={expandedPath ?? ""}
      onValueChange={(value) => (expandedPath = value)}
      class="file-list"
      aria-label={$t("fileChangesPanelTabs")}
    >
      {#each changes as change (change.path)}
        {@const kind =
          change.projection?.kind ?? (change.old_patch === null ? "created" : "edited")}
        <Accordion.Item value={change.path} class="file-item">
          <Accordion.Header class="file-heading">
            <Accordion.Trigger class="file-row">
              <svg class="file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3.25 1.75h5l4.5 4.5v8H3.25zM8.25 1.75v4.5h4.5" />
              </svg>
              <span class="file-copy">
                <strong>{filename(change.path)}</strong>
                <small>{change.path}</small>
              </span>
              <span class="change-kind"
                >{$t(
                  kind === "created"
                    ? "fileChangeCreated"
                    : kind === "deleted"
                      ? "fileChangeDeleted"
                      : "fileChangeEdited",
                )}</span
              >
              <svg class="file-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"
                ><path d="m7 8 3 3 3-3" /></svg
              >
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content class="file-detail">
            {#if expandedPath === change.path}
              {@const content = fileChangeContent(change)}
              <div class="file-toolbar">
                <span>{$t("fileChangeBranchScope")}</span>
                <Tooltip text={$t("fileChangeRevertBranch")}>
                  {#snippet trigger(props)}
                    <button
                      {...props}
                      class="revert-button"
                      type="button"
                      disabled={revertingIds.has(change.id) || !change.projection?.available}
                      aria-label={$t("fileChangeRevertBranch")}
                      onclick={() => handleRevert(change)}
                    >
                      {#if revertingIds.has(change.id)}<span>…</span>{:else}
                        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"
                          ><path d="M5.5 6H3V3.5M3.5 6a6.25 6.25 0 1 1-.4 6" /></svg
                        >
                      {/if}
                    </button>
                  {/snippet}
                </Tooltip>
              </div>
              {#if errors[change.id]}<p class="file-error" role="alert">
                  {errors[change.id]}
                </p>{/if}
              <ScrollArea
                maxHeight="min(420px, 55vh)"
                class="file-content-scroll"
                scrollHideDelay={350}
              >
                <FileDiffView
                  lines={fileChangeFullDiffLines(change, content)}
                  path={change.path}
                  scrollable={false}
                  fullFile
                  emptyLabel={$t(
                    kind === "deleted"
                      ? "fileChangeDeletedContent"
                      : content === ""
                        ? "fileChangeEmptyContent"
                        : "fileChangeContentUnavailable",
                  )}
                />
              </ScrollArea>
            {/if}
          </Accordion.Content>
        </Accordion.Item>
      {/each}
    </Accordion.Root>
  </ScrollArea>
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
  :global(.file-panel .file-list-scroll) {
    min-height: 0;
    flex: 1;
  }
  :global(.file-panel .ui-scroll-area-viewport) {
    overflow-x: hidden;
  }
  :global(.file-panel .file-item) {
    border-bottom: 1px solid var(--border);
  }
  :global(.file-panel .file-item[data-state="open"]) {
    background: color-mix(in srgb, var(--component-neutral-bg) 45%, transparent);
  }
  :global(.file-panel .file-heading) {
    margin: 0;
  }
  :global(.file-panel .file-row) {
    display: grid;
    width: 100%;
    min-height: var(--file-row-height);
    grid-template-columns: 16px minmax(0, 1fr) auto 16px;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  :global(.file-panel .file-row:hover),
  :global(.file-panel .file-row[data-state="open"]) {
    background: var(--interactive-state-bg);
  }
  :global(.file-panel .file-row:focus-visible) {
    outline: none;
    box-shadow: inset var(--focus-ring);
  }
  :global(.file-panel .file-row:active:not(:disabled)) {
    background: color-mix(
      in srgb,
      var(--text) calc(var(--interactive-state-opacity) * 2),
      transparent
    );
  }
  .file-copy {
    display: grid;
    min-width: 0;
    gap: 3px;
  }
  .file-copy strong,
  .file-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-copy strong {
    font:
      600 11px/1.4 ui-monospace,
      "SFMono-Regular",
      Consolas,
      monospace;
  }
  .file-copy small {
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.3;
    font-weight: 400;
  }
  .file-icon,
  .file-chevron {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .file-icon,
  .file-chevron,
  .change-kind {
    color: var(--text-muted);
  }
  .file-chevron {
    transition: transform var(--motion-panel) var(--ease-standard);
  }
  :global(.file-row[data-state="open"]) .file-chevron {
    transform: rotate(180deg);
  }
  .change-kind {
    font-size: 10px;
    font-weight: 400;
  }
  .file-toolbar {
    display: flex;
    min-height: 32px;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    color: var(--text-muted);
    font-size: 10px;
  }
  .revert-button {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .revert-button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--danger) 9%, transparent);
    color: var(--danger);
  }
  .revert-button:focus-visible {
    outline: none;
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
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .file-error {
    margin: 0;
    padding: 8px;
    color: var(--danger);
    font-size: 11px;
    overflow-wrap: anywhere;
  }
  @container (max-width: 220px) {
    .change-kind {
      display: none;
    }
  }
</style>
