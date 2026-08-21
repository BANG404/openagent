<script lang="ts">
  import type { Snippet } from "svelte";

  import { t } from "$lib/i18n";
  import Select from "./ui/Select.svelte";
  import Tooltip from "./Tooltip.svelte";

  type SelectItem = {
    value: string;
    label: string;
    description?: string;
    selectedLabel?: string;
  };

  let {
    selectedModel,
    modelOptions,
    selectedRole,
    roleOptions,
    selectedWorkspace,
    workspaceOptions,
    workspaceLoading = false,
    composer,
    onModelChange,
    onRoleChange,
    onWorkspaceChange,
    onPickWorkspace,
    onDragStart,
  }: {
    selectedModel: string;
    modelOptions: SelectItem[];
    selectedRole: string;
    roleOptions: SelectItem[];
    selectedWorkspace: string;
    workspaceOptions: SelectItem[];
    workspaceLoading?: boolean;
    composer: Snippet;
    onModelChange: (value: string) => void;
    onRoleChange: (value: string) => void;
    onWorkspaceChange: (value: string) => void;
    onPickWorkspace: () => void;
    onDragStart: (event: PointerEvent) => void;
  } = $props();
</script>

<section
  class="quick-chat conversation-input-surface"
  aria-label={$t("quickChat")}
  data-tauri-drag-region
  onpointerdown={onDragStart}
>
  <div class="quick-composer">
    <div class="composer-slot">
      {@render composer()}
    </div>
  </div>

  <footer class="quick-footer">
    <div class="quick-selectors">
      <div class="quick-select model-select">
        <Select
          value={selectedModel}
          items={modelOptions}
          placeholder={$t("selectModel")}
          disabled={modelOptions.length === 0}
          triggerClass="quick-select-trigger"
          contentClass="quick-select-content"
          contentSide="bottom"
          contentSideOffset={10}
          contentAlign="start"
          contentAvoidCollisions={false}
          searchable
          searchPlaceholder={$t("searchModels")}
          emptyText={$t("noMatchingModels")}
          ariaLabel={$t("selectModel")}
          onValueChange={onModelChange}
        />
      </div>
      <div class="quick-select role-select">
        <Select
          value={selectedRole}
          items={roleOptions}
          triggerClass="quick-select-trigger"
          contentClass="quick-select-content quick-role-select-content"
          contentSide="bottom"
          contentSideOffset={10}
          contentAlign="start"
          contentAvoidCollisions={false}
          searchable
          searchPlaceholder={$t("roleSelectorSearch")}
          emptyText={$t("noMatchingRoles")}
          ariaLabel={$t("selectRole")}
          onValueChange={onRoleChange}
        />
      </div>
      <div class="quick-select workspace-select">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2.5 4.5h4L7.75 6h5.75v7.5h-11z" />
        </svg>
        <Select
          value={selectedWorkspace}
          items={workspaceOptions}
          placeholder={$t("switchWorkspace")}
          disabled={workspaceLoading || workspaceOptions.length === 0}
          triggerClass="quick-select-trigger"
          contentClass="quick-select-content"
          contentSide="bottom"
          contentSideOffset={10}
          contentAlign="start"
          contentAvoidCollisions={false}
          searchable
          searchPlaceholder={$t("switchWorkspace")}
          emptyText={$t("noRecentWorkspaces")}
          ariaLabel={$t("switchWorkspace")}
          onValueChange={onWorkspaceChange}
        />
      </div>
      <Tooltip text={$t("openFolder")} side="top">
        <button
          class="pick-workspace"
          type="button"
          aria-label={$t("openFolder")}
          disabled={workspaceLoading}
          onclick={onPickWorkspace}
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2.5 4.5h4L7.75 6h5.75v7.5h-11z" />
            <path d="M8 8.25v3.5M6.25 10h3.5" />
          </svg>
        </button>
      </Tooltip>
    </div>
  </footer>
</section>

<style>
  .quick-chat {
    position: relative;
    width: 100%;
    min-height: 100px;
    max-height: 191px;
    overflow: hidden;
    background: var(--surface);
    color: var(--text);
  }

  .quick-composer,
  .quick-footer {
    position: relative;
    z-index: 1;
  }

  .quick-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pick-workspace {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    outline: none;
  }

  .pick-workspace:hover:not(:disabled),
  .pick-workspace:focus-visible {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  .pick-workspace:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .quick-composer {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
    align-items: start;
    overflow: hidden;
  }

  .composer-slot {
    min-width: 0;
    min-height: 100px;
    max-height: 191px;
    overflow: hidden;
  }

  .composer-slot :global(.input-wrapper),
  .composer-slot :global(.composer) {
    min-height: 100px;
    max-height: 191px;
  }

  .composer-slot :global(.composer) {
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }

  .composer-slot :global(.composer:focus-within),
  .composer-slot :global(.composer-streaming),
  .composer-slot :global(.composer-streaming:focus-within) {
    box-shadow: none;
  }

  .composer-slot :global(.input) {
    min-height: 56px;
    max-height: 147px;
    padding: 12px 54px 4px 18px;
    overflow-y: auto;
    font-size: 14px;
    line-height: 1.47;
  }

  .composer-slot :global(.input::placeholder) {
    color: color-mix(in srgb, var(--text-muted) 75%, transparent);
  }

  .composer-slot :global(.attachment-list) {
    position: relative;
    height: 28px;
    flex-wrap: nowrap;
    gap: 5px;
    padding: 2px 54px 0 12px;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .composer-slot :global(.composer:has(.attachment-list) .input) {
    min-height: 42px;
    padding-top: 8px;
  }

  .quick-footer {
    position: absolute;
    right: 48px;
    bottom: 6px;
    left: 45px;
    z-index: 4;
    gap: 10px;
    height: 30px;
    background: transparent;
    pointer-events: none;
  }

  .quick-selectors {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 3px;
    pointer-events: auto;
  }

  .quick-select {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    color: var(--text-muted);
  }

  .quick-select > svg {
    z-index: 1;
    grid-area: 1 / 1;
    width: 14px;
    height: 14px;
    margin-left: 5px;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: none;
  }

  .model-select {
    max-width: 230px;
  }

  .role-select {
    max-width: 145px;
  }

  .workspace-select {
    max-width: 190px;
  }

  .quick-select :global(.quick-select-trigger) {
    grid-area: 1 / 1;
    width: auto;
    min-width: 0;
    max-width: 100%;
    height: 30px;
    gap: 3px;
    padding: 4px 8px;
    background: transparent;
    box-shadow: none;
    color: var(--text-muted);
    font-size: 12px;
  }

  .workspace-select :global(.quick-select-trigger) {
    padding-left: 23px;
  }

  .quick-select :global(.quick-select-trigger:hover:not(:disabled)),
  .quick-select :global(.quick-select-trigger:focus-visible),
  .quick-select :global(.quick-select-trigger[data-state="open"]) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  :global(.quick-select-content) {
    background: var(--surface);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    max-height: min(286px, var(--bits-select-content-available-height, 286px));
    min-width: 230px;
    max-width: 360px;
  }

  :global(.quick-role-select-content .ui-select-item-description) {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pick-workspace {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    border-radius: 6px;
  }

  .pick-workspace:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .pick-workspace svg {
    width: 15px;
    height: 15px;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (max-width: 680px) {
    .quick-select > svg {
      display: none;
    }

    .quick-select {
      grid-template-columns: minmax(0, 1fr);
    }

    .quick-select :global(.quick-select-trigger) {
      padding-left: 5px;
    }

    .model-select {
      max-width: 180px;
    }

    .workspace-select {
      max-width: 150px;
    }
  }
</style>
