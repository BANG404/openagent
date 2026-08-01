<script lang="ts">
  import { invoke } from "$lib/openagent/tauriClient";
  import { listen } from "$lib/openagent/tauriClient";
  import { onMount } from "svelte";
  import { ContextMenu, Dialog } from "bits-ui";
  import MdxMarkdownEditor from "./MdxMarkdownEditor.svelte";
  import LoadingSkeleton from "./LoadingSkeleton.svelte";
  import ScopeToggle from "./ScopeToggle.svelte";
  import WindowControls from "./WindowControls.svelte";
  import Tooltip from "./Tooltip.svelte";
  import { t } from "$lib/i18n";
  import type { SkillMetadata, WorkspaceContext } from "$lib/types";

  let {
    workspace,
    winMinimize,
    winMaximize,
    winClose,
  }: {
    workspace: WorkspaceContext | null;
    winMinimize: () => void;
    winMaximize: () => void;
    winClose: () => void;
  } = $props();

  type SkillScope = "global" | "local";
  type SkillGroup = {
    key: string;
    category: string | null;
    skills: SkillMetadata[];
  };

  const uncategorizedGroupKey = "\u0000uncategorized";

  let activeScope = $state<SkillScope>("global");
  let allSkills = $state<SkillMetadata[]>([]);
  let selectedSkill = $state<SkillMetadata | null>(null);
  let editorContent = $state("");
  let isSaving = $state(false);
  let saveMsg = $state("");
  let skillsLoading = $state(true);
  let skillContentLoading = $state(false);
  let selectedContentLoaded = $state(false);
  let skillLoadVersion = 0;
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let collapsedCategoryKeys = $state(new Set<string>());

  // New skill dialog state
  let showNewDialog = $state(false);
  let newName = $state("");
  let newDesc = $state("");
  let isCreating = $state(false);
  let createError = $state("");

  let visibleSkills = $derived(allSkills.filter((s) => s.scope === activeScope));
  let skillGroups = $derived.by(() => {
    const groups = new Map<string, SkillGroup>();
    for (const skill of visibleSkills) {
      const category = skill.category?.trim() || null;
      const key = category ?? uncategorizedGroupKey;
      const group = groups.get(key);
      if (group) {
        group.skills.push(skill);
      } else {
        groups.set(key, { key, category, skills: [skill] });
      }
    }

    return [...groups.values()].sort((a, b) => {
      if (a.category === null && b.category === null) return 0;
      if (a.category === null) return 1;
      if (b.category === null) return -1;
      return a.category.localeCompare(b.category);
    });
  });

  onMount(() => {
    void loadSkills(true);
    const unlisten = listen("skills-updated", () => {
      void loadSkills();
    });
    return () => {
      void unlisten.then((dispose) => dispose());
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      flushSave();
    };
  });

  async function loadSkills(showSkeleton = false) {
    if (showSkeleton) skillsLoading = true;
    try {
      allSkills = await invoke<SkillMetadata[]>("list_skills");
    } catch {
      allSkills = [];
    } finally {
      if (showSkeleton) skillsLoading = false;
    }
  }

  async function selectSkill(skill: SkillMetadata) {
    if (selectedSkill?.path === skill.path) return;
    flushSave();
    const loadVersion = ++skillLoadVersion;
    selectedSkill = skill;
    selectedContentLoaded = false;
    skillContentLoading = true;
    try {
      const content = await invoke<string>("get_skill_content", { path: skill.path });
      if (loadVersion !== skillLoadVersion) return;
      editorContent = content;
      selectedContentLoaded = true;
    } catch {
      if (loadVersion === skillLoadVersion) editorContent = "";
    } finally {
      if (loadVersion === skillLoadVersion) skillContentLoading = false;
    }
    saveMsg = "";
  }

  function handleEditorInput(value: string) {
    editorContent = value;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => saveCurrentSkill(), 700);
    saveMsg = "";
  }

  async function saveCurrentSkill() {
    if (!selectedSkill) return;
    isSaving = true;
    try {
      await invoke("save_skill_content", {
        path: selectedSkill.path,
        content: editorContent,
      });
      saveMsg = $t("skillSaved");
      await loadSkills(); // refresh metadata (name/description may have changed)
    } catch (err) {
      saveMsg = `Error: ${err}`;
    } finally {
      isSaving = false;
    }
  }

  function flushSave() {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    if (selectedSkill && selectedContentLoaded) {
      invoke("save_skill_content", {
        path: selectedSkill.path,
        content: editorContent,
      }).catch(() => {});
    }
  }

  async function handleCreateSkill() {
    if (!newName.trim()) return;
    isCreating = true;
    createError = "";
    try {
      const created = await invoke<SkillMetadata>("create_skill", {
        scope: activeScope,
        name: newName.trim(),
        description: newDesc.trim(),
      });
      allSkills = [...allSkills, created].sort((a, b) => a.name.localeCompare(b.name));
      showNewDialog = false;
      newName = "";
      newDesc = "";
      await selectSkill(created);
    } catch (err) {
      createError = String(err);
    } finally {
      isCreating = false;
    }
  }

  async function handleDeleteSkill(skill: SkillMetadata) {
    if (!confirm($t("deleteSkillConfirm"))) return;
    try {
      await invoke("delete_skill", { path: skill.path });
      allSkills = allSkills.filter((s) => s.path !== skill.path);
      if (selectedSkill?.path === skill.path) {
        selectedSkill = null;
        editorContent = "";
        selectedContentLoaded = false;
      }
    } catch (err) {
      alert(`Delete failed: ${err}`);
    }
  }

  function switchScope(scope: SkillScope) {
    if (activeScope === scope) return;
    if (scope === "local" && !workspace?.path) return;
    flushSave();
    activeScope = scope;
    selectedSkill = null;
    editorContent = "";
    selectedContentLoaded = false;
    saveMsg = "";
  }

  function cancelNewDialog() {
    showNewDialog = false;
    newName = "";
    newDesc = "";
    createError = "";
  }

  function toggleCategory(key: string) {
    const next = new Set(collapsedCategoryKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    collapsedCategoryKeys = next;
  }

  async function handleOpenSkillDir(skill: SkillMetadata) {
    try {
      await invoke("open_path", { path: skill.path });
    } catch (err) {
      alert(`Failed to open folder: ${err}`);
    }
  }

  async function handleOpenSkillsDir() {
    try {
      const dir = await invoke<string>("get_skills_dir", { scope: activeScope });
      await invoke("open_path", { path: dir });
    } catch (err) {
      alert(`Failed to open folder: ${err}`);
    }
  }
</script>

<div class="skills-panel">
  <div class="skills-header" data-tauri-drag-region>
    <div class="header-leading">
      <span class="skills-header-title">{$t("skillsTitle")}</span>
      <ScopeToggle
        value={activeScope}
        projectEnabled={Boolean(workspace?.path)}
        onChange={switchScope}
      />
    </div>
    <div class="title-actions">
      <WindowControls onMinimize={winMinimize} onMaximize={winMaximize} onClose={winClose} />
    </div>
  </div>

  <div class="skills-body">
    <!-- Skill list + editor -->
    <div class="skills-content-col">
      <!-- Skill list sidebar -->
      <div class="skill-list-col">
        <div class="skill-list-items">
          {#if skillsLoading}
            <LoadingSkeleton variant="detail-list" rows={5} label={$t("loadingContent")} />
          {:else if visibleSkills.length === 0}
            <div class="skill-empty">
              <svg
                class="skill-empty-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              <p class="skill-empty-text">{$t("noSkills")}</p>
              <p class="skill-empty-hint">{$t("noSkillsHint")}</p>
            </div>
          {:else}
            {#each skillGroups as group (group.key)}
              {@const collapsed = collapsedCategoryKeys.has(group.key)}
              {@const categoryLabel = group.category ?? $t("uncategorizedSkills")}
              <section class="skill-group">
                <button
                  class="skill-group-toggle"
                  type="button"
                  aria-expanded={!collapsed}
                  aria-label={`${collapsed ? $t("expandSection") : $t("collapseSection")}: ${categoryLabel}`}
                  onclick={() => toggleCategory(group.key)}
                >
                  <svg
                    class="skill-group-chevron"
                    class:expanded={!collapsed}
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 4 4 4-4 4" />
                  </svg>
                  <span class="skill-group-name">{categoryLabel}</span>
                  <span class="skill-group-count">{group.skills.length}</span>
                </button>

                {#if !collapsed}
                  <div class="skill-group-items">
                    {#each group.skills as skill (skill.path)}
                      <ContextMenu.Root>
                        <ContextMenu.Trigger class="skill-ctx-trigger">
                          <div
                            class="skill-item {selectedSkill?.path === skill.path ? 'active' : ''}"
                            role="button"
                            tabindex="0"
                            onclick={() => selectSkill(skill)}
                            onkeydown={(e) => e.key === "Enter" && selectSkill(skill)}
                          >
                            <div class="skill-item-main">
                              <span class="skill-item-name">{skill.name}</span>
                            </div>
                            {#if skill.description}
                              <p class="skill-item-desc">{skill.description}</p>
                            {/if}
                          </div>
                        </ContextMenu.Trigger>
                        <ContextMenu.Portal>
                          <ContextMenu.Content class="ctx-menu-content">
                            <ContextMenu.Item
                              class="ctx-menu-item"
                              onclick={() => handleOpenSkillDir(skill)}
                            >
                              {$t("openSkillDir")}
                            </ContextMenu.Item>
                            <div class="ctx-menu-separator"></div>
                            <ContextMenu.Item
                              class="ctx-menu-item ctx-menu-item-danger"
                              onclick={() => handleDeleteSkill(skill)}
                            >
                              {$t("deleteSkill")}
                            </ContextMenu.Item>
                          </ContextMenu.Content>
                        </ContextMenu.Portal>
                      </ContextMenu.Root>
                    {/each}
                  </div>
                {/if}
              </section>
            {/each}
          {/if}
        </div>

        <div class="skill-list-footer">
          <button
            class="skill-footer-btn skill-footer-btn-primary"
            onclick={() => (showNewDialog = true)}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M8 3v10M3 8h10" />
            </svg>
            {$t("newSkill")}
          </button>
          <Tooltip text={$t("openSkillsDir")}>
            <button
              class="skill-footer-btn"
              aria-label={$t("openSkillsDir")}
              onclick={handleOpenSkillsDir}
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
                  d="M2 4.5A1.5 1.5 0 0 1 3.5 3H6l1.5 2H12.5A1.5 1.5 0 0 1 14 6.5v6A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5V4.5z"
                />
                <path d="M9 9.5 11 7.5 9 5.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>

      <!-- Editor -->
      <div class="skill-editor-col">
        {#if skillsLoading || skillContentLoading}
          <LoadingSkeleton variant="editor" rows={9} label={$t("loadingContent")} />
        {:else if selectedSkill}
          <div class="editor-topbar">
            <span class="editor-filename">SKILL.md</span>
            <Tooltip text={selectedSkill.path}>
              <span class="editor-path">{selectedSkill.name}</span>
            </Tooltip>
            {#if isSaving}
              <span class="save-indicator saving">保存中…</span>
            {:else if saveMsg}
              <span class="save-indicator saved">{saveMsg}</span>
            {/if}
          </div>
          <MdxMarkdownEditor
            class="skill-mdx-editor"
            value={editorContent}
            onChange={handleEditorInput}
            placeholder="在此编写技能指令..."
          />
        {:else}
          <div class="editor-placeholder">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <p>从左侧选择技能来编辑 SKILL.md</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<!-- New Skill Dialog -->
<Dialog.Root
  bind:open={showNewDialog}
  onOpenChange={(open) => {
    if (!open) cancelNewDialog();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog">
      <Dialog.Title class="dialog-title">{$t("newSkill")}</Dialog.Title>

      <div class="form-field">
        <label class="form-label" for="skill-name-input">{$t("skillName")}</label>
        <input
          id="skill-name-input"
          class="form-input"
          type="text"
          placeholder={$t("skillNamePlaceholder")}
          bind:value={newName}
          onkeydown={(e) => e.key === "Enter" && handleCreateSkill()}
        />
      </div>

      <div class="form-field">
        <label class="form-label" for="skill-desc-input">{$t("skillDesc")}</label>
        <input
          id="skill-desc-input"
          class="form-input"
          type="text"
          placeholder={$t("skillDescPlaceholder")}
          bind:value={newDesc}
          onkeydown={(e) => e.key === "Enter" && handleCreateSkill()}
        />
        <p class="form-hint">Agent 根据描述判断何时使用该技能</p>
      </div>

      {#if createError}
        <p class="form-error">{createError}</p>
      {/if}

      <div class="dialog-actions">
        <Dialog.Close class="btn-secondary">{$t("cancel")}</Dialog.Close>
        <button
          class="btn-primary"
          onclick={handleCreateSkill}
          disabled={!newName.trim() || isCreating}
        >
          {isCreating ? "创建中…" : $t("createSkill")}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  .skills-panel {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
  }

  .skills-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    height: 48px;
    flex-shrink: 0;
  }

  .skills-header-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .title-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .skills-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ─── Content col ─────────────────────────────────────────────────────────── */

  .skills-content-col {
    flex: 1;
    min-width: 0;
    display: flex;
    overflow: hidden;
  }

  /* ─── Skill list ──────────────────────────────────────────────────────────── */

  .skill-list-col {
    width: 220px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .skill-list-items {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 8px;
    gap: var(--list-item-stack-gap);
  }

  :global(.skill-ctx-trigger) {
    display: block;
    width: 100%;
  }

  .skill-group {
    display: flex;
    flex-direction: column;
    gap: var(--list-item-stack-gap);
  }

  .skill-group + .skill-group {
    margin-top: 6px;
  }

  .skill-group-toggle {
    width: 100%;
    min-height: 28px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 7px;
    background: transparent;
    color: var(--text-muted);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
  }

  .skill-group-toggle:hover {
    background: var(--surface2);
    color: var(--text);
  }

  .skill-group-toggle:focus-visible {
    box-shadow: var(--focus-ring);
    outline: none;
  }

  .skill-group-chevron {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    transition: transform 0.15s ease;
  }

  .skill-group-chevron.expanded {
    transform: rotate(90deg);
  }

  .skill-group-name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .skill-group-count {
    min-width: 18px;
    padding: 1px 5px;
    border-radius: 999px;
    background: var(--surface2);
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.4;
    text-align: center;
  }

  .skill-group-items {
    display: flex;
    flex-direction: column;
    gap: var(--list-item-stack-gap);
  }

  .skill-list-footer {
    flex-shrink: 0;
    display: flex;
    gap: 6px;
    padding: 8px;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }

  .skill-footer-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: var(--surface2);
    color: var(--text-muted);
    border: 0;
    border-radius: 7px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s;
    white-space: nowrap;
    box-shadow: var(--control-shadow);
  }

  .skill-footer-btn:hover {
    background: var(--surface);
    color: var(--text);
  }

  .skill-footer-btn svg {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
  }

  .skill-footer-btn-primary {
    flex: 1;
    background: var(--primary);
    color: white;
    border-color: transparent;
  }

  .skill-footer-btn-primary:hover {
    background: var(--primary-hover);
    color: white;
  }

  .skill-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 12px;
    gap: 8px;
    text-align: center;
    flex: 1;
  }

  .skill-empty-icon {
    width: 28px;
    height: 28px;
    color: var(--text-muted);
    opacity: 0.4;
  }

  .skill-empty-text {
    font-size: 13px;
    color: var(--text-muted);
    margin: 0;
  }

  .skill-empty-hint {
    font-size: 11px;
    color: var(--text-muted);
    opacity: 0.7;
    margin: 0;
    line-height: 1.5;
  }

  .skill-item {
    width: 100%;
    background: none;
    border: none;
    border-radius: 8px;
    padding: 9px 10px;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s;
    flex-shrink: 0;
    user-select: none;
  }

  .skill-item:hover {
    background: var(--surface2);
  }

  .skill-item.active {
    background: var(--surface);
  }

  .skill-item-main {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .skill-item-name {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .skill-item-desc {
    font-size: 11px;
    color: var(--text-muted);
    margin: 3px 0 0;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ─── Editor ──────────────────────────────────────────────────────────────── */

  .skill-editor-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .editor-topbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    height: 36px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .editor-filename {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .editor-path {
    font-size: 11px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .save-indicator {
    font-size: 11px;
    flex-shrink: 0;
  }

  .save-indicator.saving {
    color: var(--text-muted);
  }

  .save-indicator.saved {
    color: #22c55e;
  }

  :global(.skill-mdx-editor) {
    flex: 1;
    min-height: 0;
    border: none;
  }

  .header-leading {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .editor-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text-muted);
  }

  .editor-placeholder svg {
    width: 32px;
    height: 32px;
    opacity: 0.35;
  }

  .editor-placeholder p {
    font-size: 13px;
    margin: 0;
  }

  /* ─── New Skill Dialog ────────────────────────────────────────────────────── */

  .form-field {
    margin-bottom: 16px;
  }

  .form-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 6px;
  }

  .form-input {
    width: 100%;
    background: var(--surface2);
    border: 0;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 13px;
    color: var(--text);
    outline: none;
    box-sizing: border-box;
    box-shadow: var(--control-shadow);
    transition: box-shadow 0.15s;
  }

  .form-input:focus {
    box-shadow: var(--control-shadow), var(--focus-ring);
  }

  .form-hint {
    font-size: 11px;
    color: var(--text-muted);
    margin: 5px 0 0;
  }

  .form-error {
    font-size: 12px;
    color: #ef4444;
    margin: 0 0 12px;
  }
</style>
