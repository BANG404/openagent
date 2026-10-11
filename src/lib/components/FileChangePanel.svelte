<script lang="ts">
  import { t } from "$lib/i18n";
  import type { FileChange } from "$lib/types";
  import LoadingSkeleton from "./LoadingSkeleton.svelte";

  let {
    changes,
    expandedPath = $bindable<string | null>(null),
  }: {
    changes: FileChange[];
    expandedPath?: string | null;
  } = $props();
  const panel = import("./FileChangePanelBody.svelte");
</script>

<div class="file-panel-shell">
  {#await panel}
    <LoadingSkeleton
      variant="sidebar"
      rows={Math.min(changes.length, 6)}
      label={$t("loadingContent")}
    />
  {:then module}
    <module.default {changes} bind:expandedPath />
  {:catch}
    <p role="alert">{$t("fileChangeContentUnavailable")}</p>
  {/await}
</div>

<style>
  .file-panel-shell {
    --file-row-height: 50px;
    --list-item-compact-height: var(--file-row-height);
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    width: 100%;
  }
</style>
