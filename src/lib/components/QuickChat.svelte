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
    shortcutLabel,
    workspaceLoading = false,
    composer,
    onModelChange,
    onRoleChange,
    onWorkspaceChange,
    onPickWorkspace,
    onDragStart,
    onOpenFullApp,
    onClose,
  }: {
    selectedModel: string;
    modelOptions: SelectItem[];
    selectedRole: string;
    roleOptions: SelectItem[];
    selectedWorkspace: string;
    workspaceOptions: SelectItem[];
    shortcutLabel: string;
    workspaceLoading?: boolean;
    composer: Snippet;
    onModelChange: (value: string) => void;
    onRoleChange: (value: string) => void;
    onWorkspaceChange: (value: string) => void;
    onPickWorkspace: () => void;
    onDragStart: (event: PointerEvent) => void;
    onOpenFullApp: () => void;
    onClose: () => void;
  } = $props();
</script>

<section class="quick-chat" aria-label={$t("quickChat")} data-tauri-drag-region>
  <header
    class="quick-header"
    role="presentation"
    data-tauri-drag-region
    onpointerdown={onDragStart}
  >
    <div class="quick-brand" data-tauri-drag-region>
      <span class="quick-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="m7.25 7.25 9.5 9.5M15 5.5l3.5 3.5M5.5 15l3.5 3.5" />
          <path d="m9.25 5.25 9.5 9.5M5.25 9.25l9.5 9.5" opacity=".45" />
        </svg>
      </span>
      <span>{$t("quickChat")}</span>
    </div>
    <div class="quick-window-actions">
      <kbd>{shortcutLabel}</kbd>
      <Tooltip text={$t("openFullApp")} side="bottom">
        <button type="button" aria-label={$t("openFullApp")} onclick={onOpenFullApp}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 5.5V3h2.5M10.5 3H13v2.5M13 10.5V13h-2.5M5.5 13H3v-2.5" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip text={$t("closeQuickChat")} side="bottom">
        <button type="button" aria-label={$t("closeQuickChat")} onclick={onClose}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      </Tooltip>
    </div>
  </header>

  <div class="quick-composer">
    <span class="composer-glyph" aria-hidden="true">
      <svg viewBox="0 0 20 20" fill="none">
        <path d="M10 2.75a7.25 7.25 0 1 0 7.25 7.25" />
        <path d="M10 6.25A3.75 3.75 0 1 0 13.75 10" />
        <circle cx="10" cy="10" r="1.15" fill="currentColor" stroke="none" />
      </svg>
    </span>
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
    grid-template-rows: 38px auto 1px 48px;
    width: 100%;
    height: 174px;
    overflow: hidden;
    background: var(--surface);
    color: var(--text);
    border-radius: 14px;
    box-shadow: none;
  }

  .quick-chat::before {
    content: "";
    position: absolute;
    inset: -180px 12% auto;
    height: 240px;
    z-index: 0;
    background:
      radial-gradient(circle at 25% 50%, rgba(66, 133, 244, 0.18), transparent 46%),
      radial-gradient(circle at 55% 38%, rgba(161, 66, 244, 0.13), transparent 42%),
      radial-gradient(circle at 78% 55%, rgba(52, 168, 83, 0.1), transparent 44%);
    filter: blur(44px);
    opacity: 0.68;
    pointer-events: none;
  }

  .quick-header,
  .quick-composer,
  .quick-selector-space,
  .quick-footer {
    position: relative;
    z-index: 1;
  }

  .quick-header,
  .quick-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .quick-header {
    padding: 0 8px 0 14px;
    user-select: none;
  }

  .quick-brand {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .quick-mark {
    display: grid;
    width: 18px;
    height: 18px;
    place-items: center;
    color: var(--text-muted);
  }

  .quick-mark svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
  }

  .quick-window-actions {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  kbd {
    margin-right: 5px;
    padding: 1px 6px;
    border: 0;
    border-radius: 5px;
    background: color-mix(in srgb, var(--text) 6%, transparent);
    color: var(--text-muted);
    font: inherit;
    font-size: 10px;
  }

  .quick-window-actions button,
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

  .quick-window-actions button {
    width: 27px;
    height: 27px;
    border-radius: 6px;
  }

  .quick-window-actions button:hover,
  .quick-window-actions button:focus-visible,
  .pick-workspace:hover:not(:disabled),
  .pick-workspace:focus-visible {
    background: color-mix(in srgb, var(--text) 7%, transparent);
    color: var(--text);
  }

  .quick-window-actions button:focus-visible,
  .pick-workspace:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .quick-window-actions svg {
    width: 15px;
    height: 15px;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
  }

  .quick-composer {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    min-height: 78px;
    align-items: start;
    padding: 6px 18px 8px 14px;
  }

  .composer-glyph {
    display: grid;
    width: 34px;
    height: 46px;
    place-items: center;
    color: var(--text-muted);
  }

  .composer-glyph svg {
    width: 19px;
    height: 19px;
    stroke: currentColor;
    stroke-width: 1.35;
    stroke-linecap: round;
  }

  .composer-slot {
    min-width: 0;
  }

  .composer-slot :global(.composer) {
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
    right: 0;
    bottom: 0;
    left: 0;
    height: 34px;
    padding: 0 48px 4px 9px;
  }

  .composer-slot :global(.input) {
    min-height: 54px;
    max-height: 108px;
    padding: 9px 48px 7px 2px;
    font-size: 18px;
    line-height: 1.45;
    letter-spacing: -0.01em;
  }

  .composer-slot :global(.input::placeholder) {
    color: color-mix(in srgb, var(--text-muted) 75%, transparent);
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
    background: color-mix(in srgb, var(--surface) 72%, transparent);
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
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: center;
    color: var(--text-muted);
  }

  .quick-select > svg {
    width: 14px;
    height: 14px;
    justify-self: end;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
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
    width: auto;
    min-width: 0;
    max-width: 100%;
    height: 30px;
    gap: 3px;
    padding: 4px 5px;
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
    height: min(286px, var(--bits-select-content-available-height, 286px));
    min-width: 230px;
    max-width: 360px;
    background: var(--surface);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    box-shadow: none;
  }

  :global(.quick-role-select-content .ui-select-item-description) {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
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
    kbd,
    .quick-select > svg {
      display: none;
    }

    .quick-select {
      grid-template-columns: minmax(0, 1fr);
    }

    .model-select {
      max-width: 180px;
    }

    .workspace-select {
      max-width: 150px;
    }
  }
</style>
