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
  class="quick-chat"
  aria-label={$t("quickChat")}
  data-tauri-drag-region
  onpointerdown={onDragStart}
>
  <div class="quick-composer">
    <div class="composer-slot">
      {@render composer()}
    </div>
  </div>

  <div class="quick-selector-space"></div>

  <footer class="quick-footer">
    <div class="quick-selectors">
      <div class="quick-select model-select">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4.5h8v7H4zM6.25 2.5v2M9.75 2.5v2M6.25 11.5v2M9.75 11.5v2" />
          <path d="M2 6.25h2M2 9.75h2M12 6.25h2M12 9.75h2" />
        </svg>
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
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="5.25" r="2.25" />
          <path d="M3.75 13c.35-2.65 1.75-4.05 4.25-4.05s3.9 1.4 4.25 4.05" />
        </svg>
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
    display: grid;
    grid-template-rows: minmax(87px, auto) 1px 48px;
    width: 100%;
    min-height: 136px;
    max-height: 227px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
    background: linear-gradient(var(--mica-surface), var(--mica-surface)), var(--surface2);
    color: var(--text);
    border-radius: 14px;
    box-shadow: 0 8px 24px color-mix(in srgb, var(--shadow) 84%, transparent);
  }

  .quick-chat::before {
    content: "";
    position: absolute;
    inset: -180px 12% auto;
    height: 240px;
    z-index: 0;
    background:
      radial-gradient(circle at 25% 50%, rgba(66, 133, 244, 0.26), transparent 46%),
      radial-gradient(circle at 55% 38%, rgba(161, 66, 244, 0.18), transparent 42%),
      radial-gradient(circle at 78% 55%, rgba(52, 168, 83, 0.14), transparent 44%);
    filter: blur(44px);
    opacity: 0.84;
    pointer-events: none;
  }

  .quick-composer,
  .quick-selector-space,
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
    background: color-mix(in srgb, var(--text) 7%, transparent);
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
    padding: 6px 18px 8px 14px;
    overflow: hidden;
  }

  .composer-slot {
    min-width: 0;
    min-height: 73px;
    max-height: 164px;
    overflow: hidden;
  }

  .composer-slot :global(.input-wrapper),
  .composer-slot :global(.composer) {
    min-height: 73px;
    max-height: 164px;
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

  .composer-slot :global(.composer-toolbar) {
    position: absolute;
    right: 40px;
    bottom: 4px;
    left: auto;
    width: 34px;
    height: 34px;
    padding: 0 0 4px;
  }

  .composer-slot :global(.input) {
    min-height: 54px;
    max-height: 122px;
    padding: 9px 88px 7px 2px;
    overflow-y: auto;
    font-size: 18px;
    line-height: 1.45;
    letter-spacing: -0.01em;
  }

  .composer-slot :global(.input::placeholder) {
    color: color-mix(in srgb, var(--text-muted) 75%, transparent);
  }

  .composer-slot :global(.attachment-list) {
    position: relative;
    height: 28px;
    flex-wrap: nowrap;
    gap: 5px;
    padding: 2px 88px 0 2px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .composer-slot :global(.attachment-list::-webkit-scrollbar) {
    display: none;
  }

  .composer-slot :global(.composer:has(.attachment-list) .input) {
    min-height: 54px;
    padding-top: 9px;
  }

  .composer-slot :global(.attachment-preview.compact) {
    width: min(180px, 100%);
    height: 28px;
    flex: 0 0 auto;
    grid-template-columns: 28px minmax(0, 1fr);
    box-shadow: none;
  }

  .composer-slot :global(.attachment-preview.compact .thumbnail) {
    height: 28px;
  }

  .composer-slot :global(.attachment-preview.compact .file-fold) {
    width: 15px;
    height: 18px;
  }

  .composer-slot :global(.attachment-preview.compact .file-fold::after) {
    width: 5px;
    height: 5px;
  }

  .composer-slot :global(.attachment-preview.compact .attachment-meta) {
    padding: 2px 26px 2px 7px;
  }

  .composer-slot :global(.attachment-preview.compact .attachment-meta small) {
    display: none;
  }

  .composer-slot :global(.attachment-preview.compact .remove-button) {
    right: 3px;
    width: 22px;
    height: 22px;
  }

  .composer-slot :global(.send-btn),
  .composer-slot :global(.stop-btn) {
    right: 2px;
    bottom: 8px;
  }

  .quick-selector-space {
    margin: 0 14px;
    border-top: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
  }

  .quick-footer {
    gap: 10px;
    padding: 7px 10px 7px 12px;
    border-top: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
    background: color-mix(in srgb, var(--mica-surface) 72%, transparent);
  }

  .quick-selectors {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 3px;
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
    padding: 4px 5px 4px 23px;
    background: transparent;
    box-shadow: none;
    color: var(--text-muted);
    font-size: 11px;
  }

  .quick-select :global(.quick-select-trigger:hover:not(:disabled)),
  .quick-select :global(.quick-select-trigger:focus-visible),
  .quick-select :global(.quick-select-trigger[data-state="open"]) {
    background: color-mix(in srgb, var(--text) 7%, transparent);
    color: var(--text);
  }

  :global(.quick-select-content) {
    max-height: min(286px, var(--bits-select-content-available-height, 286px));
    min-width: 230px;
    max-width: 360px;
    background: var(--surface);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    box-shadow: none;
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
