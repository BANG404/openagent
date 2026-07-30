<script lang="ts">
  import { invoke } from "$lib/openagent/tauriClient";
  import { onMount } from "svelte";
  import MdxMarkdownEditor from "./MdxMarkdownEditor.svelte";
  import LoadingSkeleton from "./LoadingSkeleton.svelte";
  import ScopeToggle from "./ScopeToggle.svelte";
  import WindowControls from "./WindowControls.svelte";
  import Tooltip from "./Tooltip.svelte";
  import { t } from "$lib/i18n";
  import type { WorkspaceContext } from "$lib/types";

  interface DraftFileEntry {
    category: string;
    name: string;
    path: string;
    updated_at: number;
  }

  interface DraftCategoryEntry {
    name: string;
    drafts: DraftFileEntry[];
  }

  type DraftScope = "global" | "local";

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

  let draftCategories = $state<DraftCategoryEntry[]>([]);
  let activeScope = $state<DraftScope>("global");
  let selectedDraftPath = $state<string | null>(null);
  let draftContent = $state("");
  let draftCategoryInput = $state($t("defaultDraftCategory"));
  let draftTitleInput = $state("");
  let draftSaveState = $state("");
  let draftsLoading = $state(true);
  let draftContentLoading = $state(false);
  let selectedContentLoaded = $state(false);
  let draftLoadVersion = 0;
  let flatDrafts = $derived(draftCategories.flatMap((c) => c.drafts));
  let selectedDraft = $derived(
    selectedDraftPath ? flatDrafts.find((draft) => draft.path === selectedDraftPath) : undefined,
  );

  onMount(() => {
    loadDrafts();
    return () => {
      if (draftAutoSaveTimer) clearTimeout(draftAutoSaveTimer);
      saveDraftNow().catch(() => {});
    };
  });

  async function loadDrafts() {
    if (activeScope === "local" && !workspace?.path) {
      draftCategories = [];
      selectedDraftPath = null;
      draftContent = "";
      draftsLoading = false;
      return;
    }
    draftsLoading = true;
    try {
      draftCategories = await invoke<DraftCategoryEntry[]>("list_project_drafts", {
        scope: activeScope,
      });
      const drafts = draftCategories.flatMap((c) => c.drafts);
      if (!selectedDraftPath && drafts.length > 0) {
        await selectDraft(drafts[0]);
      } else if (selectedDraftPath && !drafts.some((draft) => draft.path === selectedDraftPath)) {
        selectedDraftPath = null;
        draftContent = "";
      }
    } catch {
      draftCategories = [];
    } finally {
      draftsLoading = false;
    }
  }

  async function selectDraft(draft: DraftFileEntry) {
    await saveDraftNow();
    const loadVersion = ++draftLoadVersion;
    selectedDraftPath = draft.path;
    draftSaveState = "";
    selectedContentLoaded = false;
    draftContentLoading = true;
    try {
      const content = await invoke<string>("get_project_draft", {
        scope: activeScope,
        path: draft.path,
      });
      if (loadVersion !== draftLoadVersion) return;
      draftContent = content;
      selectedContentLoaded = true;
    } catch {
      if (loadVersion === draftLoadVersion) draftContent = "";
    } finally {
      if (loadVersion === draftLoadVersion) draftContentLoading = false;
    }
  }

  function mergeDraftEntry(entry: DraftFileEntry) {
    const next = draftCategories.map((category) => ({
      ...category,
      drafts: category.drafts.filter((draft) => draft.path !== entry.path),
    }));
    let category = next.find((item) => item.name === entry.category);
    if (!category) {
      category = { name: entry.category, drafts: [] };
      next.push(category);
    }
    category.drafts = [entry, ...category.drafts].sort(
      (a, b) => b.updated_at - a.updated_at || a.name.localeCompare(b.name),
    );
    draftCategories = next
      .filter((item) => item.drafts.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function createDraft() {
    if (activeScope === "local" && !workspace?.path) return;
    const title = draftTitleInput.trim();
    if (!title) return;
    try {
      const entry = await invoke<DraftFileEntry>("save_project_draft", {
        scope: activeScope,
        category: draftCategoryInput.trim() || $t("defaultDraftCategory"),
        name: title,
        content: "",
      });
      mergeDraftEntry(entry);
      selectedDraftPath = entry.path;
      draftContent = "";
      selectedContentLoaded = true;
      draftTitleInput = "";
      draftSaveState = $t("draftSaved");
    } catch (err) {
      alert(`${$t("draftCreateFailed")}: ${err}`);
    }
  }

  let draftAutoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  function handleDraftInput(value: string) {
    draftContent = value;
    if (!selectedDraft) return;
    draftSaveState = "";
    if (draftAutoSaveTimer) clearTimeout(draftAutoSaveTimer);
    draftAutoSaveTimer = setTimeout(() => saveDraftNow(), 600);
  }

  async function saveDraftNow() {
    if (!selectedDraft || !selectedContentLoaded) return;
    if (draftAutoSaveTimer) {
      clearTimeout(draftAutoSaveTimer);
      draftAutoSaveTimer = null;
    }
    try {
      const entry = await invoke<DraftFileEntry>("save_project_draft", {
        scope: activeScope,
        category: selectedDraft.category,
        name: selectedDraft.name,
        content: draftContent,
      });
      mergeDraftEntry(entry);
      selectedDraftPath = entry.path;
      draftSaveState = $t("draftSaved");
    } catch (err) {
      console.error(`${$t("draftSaveFailed")}: ${err}`);
    }
  }

  async function deleteDraft(draft: DraftFileEntry) {
    if (!confirm($t("deleteDraftConfirm"))) return;
    try {
      await invoke("delete_project_draft", { scope: activeScope, path: draft.path });
      const wasSelected = selectedDraftPath === draft.path;
      draftCategories = draftCategories
        .map((category) => ({
          ...category,
          drafts: category.drafts.filter((item) => item.path !== draft.path),
        }))
        .filter((category) => category.drafts.length > 0);
      if (wasSelected) {
        const nextDraft = draftCategories.flatMap((category) => category.drafts)[0];
        if (nextDraft) await selectDraft(nextDraft);
        else {
          selectedDraftPath = null;
          draftContent = "";
        }
      }
    } catch (err) {
      alert(`${$t("draftDeleteFailed")}: ${err}`);
    }
  }

  async function openDraftsDir() {
    try {
      const path = await invoke<string>("ensure_project_drafts_dir", { scope: activeScope });
      await invoke("open_path", { path });
    } catch (err) {
      alert(`${$t("draftOpenFailed")}: ${err}`);
    }
  }

  async function switchScope(scope: DraftScope) {
    if (scope === activeScope || (scope === "local" && !workspace?.path)) return;
    await saveDraftNow();
    activeScope = scope;
    selectedDraftPath = null;
    draftContent = "";
    selectedContentLoaded = false;
    draftSaveState = "";
    await loadDrafts();
  }
</script>

<div class="drafts-panel">
  <div class="drafts-header" data-tauri-drag-region>
    <div class="header-leading">
      <span class="drafts-header-title">{$t("projectDrafts")}</span>
      <ScopeToggle
        value={activeScope}
        projectEnabled={Boolean(workspace?.path)}
        onChange={switchScope}
      />
    </div>
    <div class="title-actions">
      {#if draftSaveState}
        <span class="save-state">{draftSaveState}</span>
      {/if}
      <Tooltip text={$t("openDraftsDir")}>
        <button
          class="icon-btn"
          disabled={activeScope === "local" && !workspace?.path}
          aria-label={$t("openDraftsDir")}
          onclick={openDraftsDir}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M2 4.5A1.5 1.5 0 0 1 3.5 3H6l1.5 2H12.5A1.5 1.5 0 0 1 14 6.5v5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7z"
            />
          </svg>
        </button>
      </Tooltip>
      <WindowControls onMinimize={winMinimize} onMaximize={winMaximize} onClose={winClose} />
    </div>
  </div>

  {#if activeScope === "local" && !workspace?.path}
    <div class="draft-empty">{$t("draftNoWorkspace")}</div>
  {:else}
    <div class="draft-body">
      <aside class="draft-list-pane">
        <form
          class="draft-create-form"
          onsubmit={(event) => {
            event.preventDefault();
            createDraft();
          }}
        >
          <input
            bind:value={draftCategoryInput}
            class="draft-input"
            placeholder={$t("draftCategoryPlaceholder")}
            aria-label={$t("draftCategory")}
          />
          <div class="draft-title-row">
            <input
              bind:value={draftTitleInput}
              class="draft-input"
              placeholder={$t("draftTitlePlaceholder")}
              aria-label={$t("draftTitle")}
            />
            <Tooltip text={$t("newDraft")}>
              <button
                class="icon-btn create-draft-btn"
                type="submit"
                disabled={!draftTitleInput.trim()}
                aria-label={$t("newDraft")}
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                >
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </button>
            </Tooltip>
          </div>
        </form>

        {#if draftsLoading}
          <LoadingSkeleton variant="draft-list" rows={5} label={$t("loadingContent")} />
        {:else if draftCategories.length === 0}
          <div class="draft-empty compact">{$t("draftEmpty")}</div>
        {:else}
          <div class="draft-category-list">
            {#each draftCategories as category (category.name)}
              <section class="draft-category">
                <div class="draft-category-title">{category.name}</div>
                {#each category.drafts as draft (draft.path)}
                  <button
                    class="draft-item {selectedDraftPath === draft.path ? 'active' : ''}"
                    onclick={() => selectDraft(draft)}
                  >
                    <span class="draft-item-name">{draft.name}</span>
                    <Tooltip text={$t("deleteDraft")}>
                      <span
                        class="draft-delete-btn"
                        role="button"
                        tabindex="0"
                        aria-label={$t("deleteDraft")}
                        onclick={(event) => {
                          event.stopPropagation();
                          deleteDraft(draft);
                        }}
                        onkeydown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            deleteDraft(draft);
                          }
                        }}
                      >
                        <svg
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                        >
                          <path d="M3 4h10M6 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4" />
                          <path d="M5 4l.5 9h5l.5-9" />
                        </svg>
                      </span>
                    </Tooltip>
                  </button>
                {/each}
              </section>
            {/each}
          </div>
        {/if}
      </aside>

      <div class="draft-editor-pane">
        {#if draftsLoading || draftContentLoading}
          <LoadingSkeleton variant="editor" rows={9} label={$t("loadingContent")} />
        {:else if selectedDraft}
          <MdxMarkdownEditor
            class="draft-mdx-editor"
            value={draftContent}
            onChange={handleDraftInput}
            placeholder="记录当前项目的想法、方案、待验证问题..."
          />
        {:else}
          <div class="draft-empty">{$t("draftEmpty")}</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .drafts-panel {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
  }

  .drafts-header {
    height: 48px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }

  .drafts-header-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .header-leading {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .title-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .save-state {
    color: var(--text-muted);
    font-size: 11px;
  }

  .icon-btn {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 5px;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    transition:
      background 0.12s,
      color 0.12s,
      transform 0.1s;
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--surface2);
    color: var(--text);
  }

  .icon-btn:disabled {
    cursor: default;
    opacity: 0.45;
  }

  .icon-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .icon-btn svg {
    width: 100%;
    height: 100%;
  }

  .draft-body {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }

  .draft-list-pane {
    width: 260px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    background: var(--bg);
    min-height: 0;
  }

  .draft-create-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border-bottom: 1px solid var(--border);
  }

  .draft-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .draft-input {
    width: 100%;
    min-width: 0;
    height: 30px;
    border: 0;
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font-size: 12px;
    padding: 0 8px;
    outline: none;
    box-shadow: var(--control-shadow);
  }

  .draft-input:focus {
    box-shadow: var(--control-shadow), var(--focus-ring);
  }

  .create-draft-btn {
    flex-shrink: 0;
  }

  .draft-category-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px;
  }

  .draft-category + .draft-category {
    margin-top: 10px;
  }

  .draft-category-title {
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0 8px 4px;
  }

  .draft-item {
    width: 100%;
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: 6px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    padding: 5px 6px 5px 8px;
    text-align: left;
    transition:
      background 0.12s,
      color 0.12s;
  }

  .draft-item:hover {
    background: var(--surface2);
    color: var(--text);
  }

  .draft-item.active {
    background: var(--surface);
    color: var(--text);
  }

  .draft-item-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .draft-delete-btn {
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    color: var(--text-muted);
    opacity: 0;
    padding: 3px;
  }

  .draft-item:hover .draft-delete-btn,
  .draft-item.active .draft-delete-btn {
    opacity: 1;
  }

  .draft-delete-btn:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #dc2626;
  }

  .draft-delete-btn svg {
    width: 100%;
    height: 100%;
  }

  .draft-editor-pane {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  :global(.draft-mdx-editor) {
    flex: 1;
    min-height: 0;
    border: none;
  }

  .draft-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 13px;
    padding: 18px;
    text-align: center;
  }

  .draft-empty.compact {
    flex: 0;
    padding: 18px 8px;
    font-size: 12px;
  }
</style>
