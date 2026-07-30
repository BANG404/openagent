<script lang="ts">
  import { invoke } from "$lib/openagent/tauriClient";
  import { onMount } from "svelte";
  import { t } from "$lib/i18n";
  import type { WorkspaceContext } from "$lib/types";
  import MdxMarkdownEditor from "./MdxMarkdownEditor.svelte";
  import LoadingSkeleton from "./LoadingSkeleton.svelte";
  import ScopeToggle from "./ScopeToggle.svelte";
  import WindowControls from "./WindowControls.svelte";

  type DesignScope = "global" | "local";

  let {
    workspace,
    winMinimize,
    winMaximize,
    winClose,
  }: {
    workspace: WorkspaceContext | null;
    onClose: () => void;
    winMinimize: () => void;
    winMaximize: () => void;
    winClose: () => void;
  } = $props();

  let activeScope = $state<DesignScope>("global");
  let content = $state("");
  let saveState = $state("");
  let documentLoading = $state(true);
  let documentLoaded = $state(false);
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    loadDocument();
    return () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      saveNow().catch(() => {});
    };
  });

  async function loadDocument() {
    if (activeScope === "local" && !workspace?.path) {
      content = "";
      documentLoading = false;
      documentLoaded = false;
      return;
    }
    documentLoading = true;
    documentLoaded = false;
    try {
      content = await invoke<string>("get_design_document", { scope: activeScope });
      documentLoaded = true;
    } catch {
      content = "";
    } finally {
      documentLoading = false;
    }
  }

  async function switchScope(scope: DesignScope) {
    if (scope === activeScope || (scope === "local" && !workspace?.path)) return;
    await saveNow();
    activeScope = scope;
    saveState = "";
    await loadDocument();
  }

  function handleInput(value: string) {
    content = value;
    saveState = "";
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => saveNow(), 600);
  }

  async function saveNow() {
    if ((activeScope === "local" && !workspace?.path) || !documentLoaded) return;
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    try {
      await invoke("save_design_document", { scope: activeScope, content });
      saveState = $t("draftSaved");
    } catch (err) {
      console.error(`Failed to save DESIGN.md: ${err}`);
    }
  }
</script>

<div class="design-panel">
  <div class="design-header" data-tauri-drag-region>
    <div class="header-leading">
      <span class="design-header-title">{$t("designModule")}</span>
      <ScopeToggle
        value={activeScope}
        projectEnabled={Boolean(workspace?.path)}
        onChange={switchScope}
      />
    </div>
    <div class="title-actions">
      {#if saveState}<span class="save-state">{saveState}</span>{/if}
      <WindowControls onMinimize={winMinimize} onMaximize={winMaximize} onClose={winClose} />
    </div>
  </div>

  {#if activeScope === "local" && !workspace?.path}
    <div class="design-empty">{$t("draftNoWorkspace")}</div>
  {:else}
    <div class="document-bar">
      <code>{$t("designFile")}</code>
      <span>{$t("designFormatHint")}</span>
    </div>
    {#if documentLoading}
      <LoadingSkeleton variant="editor" rows={10} label={$t("loadingContent")} />
    {:else}
      <MdxMarkdownEditor
        class="design-mdx-editor"
        value={content}
        onChange={handleInput}
        placeholder={$t("designPlaceholder")}
      />
    {/if}
  {/if}
</div>

<style>
  .design-panel {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
  }

  .design-header {
    height: 48px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }

  .header-leading,
  .title-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .title-actions {
    gap: 6px;
  }

  .design-header-title {
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
  }

  .save-state,
  .document-bar span {
    color: var(--text-muted);
    font-size: 11px;
  }

  .document-bar {
    height: 34px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }

  .document-bar code {
    color: var(--text);
    font-family: "JetBrains Mono", "SF Mono", monospace;
    font-size: 11px;
    font-weight: 600;
  }

  :global(.design-mdx-editor) {
    flex: 1;
    min-height: 0;
    border: none;
  }

  .design-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 13px;
  }
</style>
