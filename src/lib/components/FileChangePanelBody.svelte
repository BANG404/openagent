<script lang="ts">
  import { Accordion } from "bits-ui";
  import { t } from "$lib/i18n";
  import { fileChangeContent, fileChangeFullDiffLines } from "$lib/fileChangeDiff";
  import type { FileChange } from "$lib/types";
  import FileDiffView from "./FileDiffView.svelte";
  import ScrollArea from "./ui/ScrollArea.svelte";

  let {
    changes,
    expandedPath = $bindable<string | null>(null),
  }: {
    changes: FileChange[];
    expandedPath?: string | null;
  } = $props();

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
        {@const kind = change.projection?.kind ?? "edited"}
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
              {#if change.projection?.complete === false}
                <div class="file-toolbar">
                  <span>{$t("fileChangeFragmentScope")}</span>
                </div>
              {/if}
              <ScrollArea
                maxHeight="min(420px, 55vh)"
                horizontal
                class="file-content-scroll"
                scrollHideDelay={350}
              >
                <FileDiffView
                  lines={fileChangeFullDiffLines(change, content)}
                  path={change.path}
                  scrollable={false}
                  fullFile={content !== null && change.projection?.complete !== false}
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
  :global(.file-panel .file-content-scroll .ui-scroll-area-viewport) {
    overflow-x: auto;
    padding-bottom: 8px;
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
    border-radius: calc(var(--radius) * 0.5);
    background: transparent;
    color: var(--foreground);
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
      var(--foreground) calc(var(--interactive-state-opacity) * 2),
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
    color: var(--muted-foreground);
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
    color: var(--muted-foreground);
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
    flex-wrap: wrap;
    gap: 4px 8px;
    padding: 0 8px;
    color: var(--muted-foreground);
    font-size: 10px;
  }
  @container (max-width: 220px) {
    .change-kind {
      display: none;
    }
  }
</style>
