<script lang="ts">
  import { Dialog } from "bits-ui";
  import type { AgentRole, McpServerConfig, SkillMetadata } from "$lib/types";
  import { t } from "$lib/i18n";

  type RoleDraft = {
    id: string | null;
    scope: "global" | "local";
    name: string;
    description: string;
    skillIds: string[];
    mcpServerIds: string[];
  };

  let {
    open = $bindable(),
    role,
    skills,
    mcpServers,
    loadingResources,
    saving,
    presentation = "dialog",
    onClose = () => {},
    onSave,
    onDelete,
  }: {
    open: boolean;
    role: AgentRole | null;
    skills: SkillMetadata[];
    mcpServers: McpServerConfig[];
    loadingResources: boolean;
    saving: boolean;
    presentation?: "dialog" | "window";
    onClose?: () => void | Promise<void>;
    onSave: (draft: RoleDraft) => void | Promise<void>;
    onDelete: (role: AgentRole) => void | Promise<void>;
  } = $props();

  let name = $state("");
  let description = $state("");
  let scope = $state<"global" | "local">("local");
  let skillIds = $state<string[]>([]);
  let mcpServerIds = $state<string[]>([]);
  let skillQuery = $state("");
  let mcpServerQuery = $state("");
  let initializedKey = "";

  let filteredSkills = $derived.by(() => {
    const query = skillQuery.trim().toLocaleLowerCase();
    if (!query) return skills;
    return skills.filter((skill) =>
      `${skill.name} ${skill.description} ${skill.dir_name}`.toLocaleLowerCase().includes(query),
    );
  });
  let enabledMcpServers = $derived(mcpServers.filter((server) => server.enabled));
  let filteredMcpServers = $derived.by(() => {
    const query = mcpServerQuery.trim().toLocaleLowerCase();
    if (!query) return enabledMcpServers;
    return enabledMcpServers.filter((server) =>
      `${server.name} ${server.transport} ${server.url} ${server.command}`
        .toLocaleLowerCase()
        .includes(query),
    );
  });

  $effect(() => {
    if (!open) {
      initializedKey = "";
      return;
    }
    const key = role?.id ?? "new";
    if (initializedKey === key) return;
    initializedKey = key;
    name = role?.name ?? "";
    description = role?.description ?? "";
    scope = role?.scope === "global" ? "global" : "local";
    skillIds = [...(role?.skill_ids ?? [])];
    mcpServerIds = [...(role?.mcp_server_ids ?? [])];
    skillQuery = "";
    mcpServerQuery = "";
  });

  function skillId(skill: SkillMetadata): string {
    return `${skill.scope}:${skill.dir_name}`;
  }

  function toggle(list: string[], value: string, checked: boolean): string[] {
    return checked ? [...new Set([...list, value])] : list.filter((item) => item !== value);
  }

  function submit(): void {
    if (!name.trim() || !description.trim() || saving) return;
    void onSave({
      id: role?.id ?? null,
      scope,
      name: name.trim(),
      description: description.trim(),
      skillIds,
      mcpServerIds,
    });
  }
</script>

{#snippet editorContent()}
  <header class="role-editor-header">
    <div>
      {#if presentation === "dialog"}
        <Dialog.Title>{role ? $t("editRole") : $t("newRole")}</Dialog.Title>
        <Dialog.Description>{$t("roleEditorDescription")}</Dialog.Description>
      {:else}
        <h1>{role ? $t("editRole") : $t("newRole")}</h1>
        <p>{$t("roleEditorDescription")}</p>
      {/if}
    </div>
    {#if presentation === "dialog"}
      <Dialog.Close class="icon-button" aria-label={$t("close")}>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg
        >
      </Dialog.Close>
    {/if}
  </header>

  <div class="role-editor-body">
    <section class="role-details">
      <div class="role-fields">
        <label>
          <span>{$t("roleName")}</span>
          <input bind:value={name} placeholder={$t("roleNamePlaceholder")} autocomplete="off" />
        </label>
        <fieldset class="scope-field" disabled={Boolean(role)}>
          <legend>{$t("scope")}</legend>
          <div class="scope-options">
            <label><input type="radio" bind:group={scope} value="local" />{$t("projectTab")}</label>
            <label><input type="radio" bind:group={scope} value="global" />{$t("globalTab")}</label>
          </div>
        </fieldset>
      </div>

      <label class="prompt-field">
        <span>{$t("roleSystemPrompt")}</span>
        <textarea bind:value={description} placeholder={$t("roleDescriptionPlaceholder")}
        ></textarea>
        <small>{$t("roleDescriptionHint")}</small>
      </label>
    </section>

    <section class="resource-section">
      <div class="resource-heading">
        <div>
          <h3>{$t("roleResources")}</h3>
          <p>{$t("roleResourcesHint")}</p>
        </div>
      </div>
      {#if loadingResources}
        <div class="resource-loading" role="status">{$t("loadingContent")}</div>
      {:else}
        <div class="resource-columns">
          <div class="resource-column">
            <h4>{$t("skills")}</h4>
            <div class="resource-browser">
              <div class="desktop-menu-search-wrap resource-search">
                <svg
                  class="desktop-menu-search-icon"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="7" cy="7" r="4.25" />
                  <path d="m10.25 10.25 3 3" />
                </svg>
                <input
                  class="desktop-menu-search-input"
                  type="search"
                  bind:value={skillQuery}
                  placeholder={$t("searchSkills")}
                  aria-label={$t("searchSkills")}
                />
              </div>
              <div class="resource-list">
                {#each filteredSkills as skill (skillId(skill))}
                  <label class="resource-row">
                    <input
                      type="checkbox"
                      checked={skillIds.includes(skillId(skill))}
                      onchange={(event) =>
                        (skillIds = toggle(skillIds, skillId(skill), event.currentTarget.checked))}
                    />
                    <span><strong>{skill.name}</strong><small>{skill.description}</small></span>
                  </label>
                {:else}
                  <p class="resource-empty">
                    {skillQuery ? $t("noMatchingSkills") : $t("noSkills")}
                  </p>
                {/each}
              </div>
            </div>
          </div>
          <div class="resource-column">
            <h4>{$t("mcpServers")}</h4>
            <div class="resource-browser">
              <div class="desktop-menu-search-wrap resource-search">
                <svg
                  class="desktop-menu-search-icon"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="7" cy="7" r="4.25" />
                  <path d="m10.25 10.25 3 3" />
                </svg>
                <input
                  class="desktop-menu-search-input"
                  type="search"
                  bind:value={mcpServerQuery}
                  placeholder={$t("searchMcpServers")}
                  aria-label={$t("searchMcpServers")}
                />
              </div>
              <div class="resource-list">
                {#each filteredMcpServers as server (server.id)}
                  <label class="resource-row">
                    <input
                      type="checkbox"
                      checked={mcpServerIds.includes(server.id)}
                      onchange={(event) =>
                        (mcpServerIds = toggle(
                          mcpServerIds,
                          server.id,
                          event.currentTarget.checked,
                        ))}
                    />
                    <span><strong>{server.name}</strong><small>{server.transport}</small></span>
                  </label>
                {:else}
                  <p class="resource-empty">
                    {mcpServerQuery ? $t("noMatchingMcpServers") : $t("noMcpServers")}
                  </p>
                {/each}
              </div>
            </div>
          </div>
        </div>
      {/if}
    </section>
  </div>

  <footer class="role-editor-actions">
    <div>
      {#if role}
        <button
          class="danger-button"
          type="button"
          disabled={saving}
          onclick={() => void onDelete(role)}
        >
          {$t("deleteRole")}
        </button>
      {/if}
    </div>
    <div class="primary-actions">
      {#if presentation === "dialog"}
        <Dialog.Close class="quiet-button" disabled={saving}>{$t("cancel")}</Dialog.Close>
      {:else}
        <button class="quiet-button" type="button" disabled={saving} onclick={onClose}
          >{$t("cancel")}</button
        >
      {/if}
      <button
        class="primary-button"
        type="button"
        disabled={saving || !name.trim() || !description.trim()}
        onclick={submit}
      >
        {saving ? $t("savingRole") : $t("save")}
      </button>
    </div>
  </footer>
{/snippet}

{#if presentation === "window"}
  <main class="role-editor-dialog role-editor-window" aria-busy={saving}>
    {@render editorContent()}
  </main>
{:else}
  <Dialog.Root bind:open>
    <Dialog.Portal>
      <Dialog.Overlay class="role-editor-overlay" />
      <Dialog.Content class="role-editor-dialog" aria-busy={saving}>
        {@render editorContent()}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
{/if}

<style>
  :global(.role-editor-overlay) {
    position: fixed;
    inset: 0;
    z-index: 1100;
    background: rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(5px);
  }

  :global(.role-editor-dialog) {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 1101;
    width: min(1040px, calc(100vw - 32px));
    height: min(680px, calc(100vh - 32px));
    display: flex;
    flex-direction: column;
    transform: translate(-50%, -50%);
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--mica-border);
    border-radius: 8px;
    background: var(--floating-surface);
    box-shadow: var(--raised-shadow);
    color: var(--text);
    backdrop-filter: saturate(150%) blur(24px);
    outline: none;
  }

  :global(.role-editor-window) {
    inset: 0;
    width: 100vw;
    height: 100vh;
    transform: none;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
  }

  .role-editor-header,
  .role-editor-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
  }

  .role-editor-header {
    border-bottom: 1px solid var(--mica-divider);
  }

  .role-editor-header :global(h2),
  .role-editor-header h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  .role-editor-header :global(p) {
    margin: 3px 0 0;
    color: var(--text-muted);
    font-size: 12px;
  }

  :global(.role-editor-dialog .icon-button) {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  :global(.role-editor-dialog .icon-button:hover),
  :global(.role-editor-dialog .icon-button:focus-visible) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  :global(.role-editor-dialog .icon-button svg) {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  .role-editor-body {
    min-height: 0;
    flex: 1;
    display: grid;
    grid-template-columns: minmax(280px, 0.82fr) minmax(440px, 1.18fr);
    gap: 24px;
    padding: 18px;
    overflow: hidden;
  }

  .role-details,
  .resource-section,
  .resource-columns,
  .resource-column,
  .resource-browser,
  .prompt-field {
    min-height: 0;
  }

  .role-details,
  .resource-section,
  .resource-column,
  .resource-browser,
  .prompt-field {
    display: flex;
    flex-direction: column;
  }

  .role-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 148px;
    gap: 14px;
  }

  .prompt-field {
    flex: 1;
    margin-top: 18px;
  }

  label > span,
  legend {
    display: block;
    margin-bottom: 7px;
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
  }

  input:not([type]),
  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--control-surface);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    outline: none;
  }

  input:not([type]) {
    height: 34px;
    padding: 0 10px;
  }

  textarea {
    min-height: 100px;
    flex: 1;
    padding: 10px;
    line-height: 1.5;
    resize: none;
  }

  input:not([type]):focus,
  textarea:focus {
    border-color: var(--primary);
    box-shadow: var(--focus-ring);
  }

  .prompt-field small,
  .resource-heading p {
    display: block;
    margin: 6px 0 0;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.45;
  }

  .scope-field {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .scope-options {
    height: 34px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    padding: 2px;
    box-sizing: border-box;
    border-radius: 6px;
    background: var(--control-surface);
    border: 1px solid var(--mica-divider);
  }

  .scope-options label {
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    color: var(--text-muted);
    font-size: 12px;
  }

  .scope-options input {
    accent-color: var(--primary);
  }

  .resource-section h3,
  .resource-column h4 {
    margin: 0;
    font-weight: 600;
  }

  .resource-section h3 {
    font-size: 13px;
  }

  .resource-column h4 {
    padding: 0 2px 8px;
    font-size: 12px;
  }

  .resource-columns {
    min-height: 0;
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 10px;
  }

  .resource-browser {
    flex: 1;
    border-radius: 6px;
    background: var(--control-surface);
    border: 1px solid var(--mica-divider);
    overflow: hidden;
  }

  .resource-search {
    flex: 0 0 auto;
    padding: 6px;
    border-bottom: 1px solid var(--mica-divider);
  }

  .resource-search :global(.desktop-menu-search-icon) {
    left: 16px;
    top: 50%;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  .resource-search :global(.desktop-menu-search-input) {
    min-height: 30px;
    border: 0;
    background: transparent;
  }

  .resource-list {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
  }

  .resource-row {
    min-height: 48px;
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 8px 10px;
    box-sizing: border-box;
    cursor: pointer;
  }

  .resource-row + .resource-row {
    border-top: 1px solid var(--mica-divider);
  }

  .resource-row input {
    margin: 3px 0 0;
    accent-color: var(--primary);
  }

  .resource-row > span {
    min-width: 0;
    margin: 0;
  }

  .resource-row strong,
  .resource-row small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-row strong {
    font-size: 12px;
    font-weight: 600;
  }

  .resource-row small,
  .resource-empty,
  .resource-loading {
    color: var(--text-muted);
    font-size: 11px;
  }

  .resource-row small {
    margin-top: 3px;
  }

  .resource-empty,
  .resource-loading {
    margin: 0;
    padding: 16px;
  }

  .role-editor-actions {
    border-top: 1px solid var(--mica-divider);
  }

  .primary-actions {
    display: flex;
    gap: 8px;
  }

  :global(.role-editor-dialog .quiet-button),
  .danger-button,
  .primary-button {
    min-height: 32px;
    padding: 0 14px;
    border: 0;
    border-radius: 6px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  :global(.role-editor-dialog .quiet-button),
  .danger-button {
    background: transparent;
  }

  :global(.role-editor-dialog .quiet-button) {
    color: var(--text);
  }

  .danger-button {
    color: var(--danger);
  }

  :global(.role-editor-dialog .quiet-button:hover),
  .danger-button:hover {
    background: var(--interactive-state-bg);
  }

  .primary-button {
    background: var(--primary);
    color: white;
  }

  button:disabled {
    cursor: default;
    opacity: 0.5;
  }

  @media (max-width: 820px) {
    :global(.role-editor-dialog:not(.role-editor-window)) {
      width: calc(100vw - 24px);
      height: calc(100vh - 24px);
    }

    .role-editor-body {
      grid-template-columns: minmax(230px, 0.8fr) minmax(0, 1.2fr);
      gap: 16px;
      padding: 14px;
    }

    .role-fields {
      grid-template-columns: 1fr;
    }

    .resource-columns {
      gap: 8px;
    }
  }
</style>
