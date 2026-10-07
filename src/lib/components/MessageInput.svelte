<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import { desktopOpenAgent } from "$lib/openagent/tauriClient";
  import { createAttachmentController } from "$lib/composer/attachments.svelte";
  import { onMount, tick } from "svelte";
  import { createEditorController } from "$lib/composer/editor.svelte";
  import { getMarkdownSelection } from "$lib/composerDom";
  import type {
    ApprovalMode,
    ChatAttachment,
    RecentWorkspace,
    ReasoningEffort,
    UserMessageContext,
    WorkspaceContext,
  } from "$lib/types";
  import AttachmentPreview from "./AttachmentPreview.svelte";
  import UserQuote from "./UserQuote.svelte";
  import MentionPalette, { type PaletteItem } from "./MentionPalette.svelte";
  import Select from "./ui/Select.svelte";
  import Tooltip from "./Tooltip.svelte";
  import ReasoningEffortSelect from "./ReasoningEffortSelect.svelte";
  import WorkspaceSwitcher from "./WorkspaceSwitcher.svelte";
  import { createPaletteController } from "$lib/composer/palette.svelte";
  import { t } from "$lib/i18n";

  import type { SlashCommand } from "$lib/composer/types";
  interface Props {
    value: string;
    attachments: ChatAttachment[];
    contexts?: UserMessageContext[];
    selectedModel: string;
    modelOptions: { value: string; label: string; selectedLabel?: string }[];
    placeholder: string;
    disabled: boolean;
    isStreaming: boolean;
    sendDisabled: boolean;
    sendTitle: string;
    stopTitle?: string;
    isPaused?: boolean;
    pauseTitle?: string;
    resumeTitle?: string;
    slashCommands?: SlashCommand[];
    enableMentions?: boolean;
    loadMentionItems?: (query: string) => Promise<PaletteItem[]>;
    showGlobalDraftsInMentions?: boolean;
    showAttachments?: boolean;
    showFormatting?: boolean;
    allowImageAttachments?: boolean;
    attachmentDisplay?: "cards" | "strip";
    showModelSelector?: boolean;
    showReasoningEffort?: boolean;
    reasoningEffort?: ReasoningEffort;
    showApprovalMode?: boolean;
    approvalMode?: ApprovalMode;
    showWorkspaceSwitcher?: boolean;
    contextUsage?: number | null;
    contextCompactionThreshold?: number;
    workspace?: WorkspaceContext | null;
    workspacePath?: string;
    recentWorkspaces?: RecentWorkspace[];
    workspaceTauriAvailable?: boolean;
    workspaceBrowserModeNotice?: string;
    showStopButton?: boolean;
    onConfigureModels?: () => void;
    onModelChange?: (value: string) => void;
    onReasoningEffortChange?: (value: ReasoningEffort) => void;
    onApprovalModeChange?: (value: ApprovalMode) => void;
    onPickWorkspace?: () => void;
    onPickWslWorkspace?: () => void;
    onSelectWorkspace?: (path: string) => void;
    /** Protect native-window focus while the Tauri attachment dialog is open. */
    onAttachmentPickerOpenChange?: (open: boolean) => void | Promise<void>;
    /** Upload browser-selected files through the active non-Tauri transport. */
    onUploadAttachments?: (files: File[]) => Promise<ChatAttachment[]>;
    /** Increment to return keyboard focus to the composer textarea. */
    focusRequest?: number;
    attachmentPreviewLoader?: (
      locator: string,
      name: string,
    ) => Promise<{ kind: "image" | "text" | "file"; data_url?: string; text?: string }>;
    onSend: () => void;
    onStop: () => void;
    onPause?: () => void;
    onResume?: () => void;
  }
  let {
    value = $bindable(),
    attachments = $bindable(),
    contexts = $bindable([]),
    selectedModel = $bindable(),
    modelOptions = [],
    placeholder,
    disabled,
    isStreaming,
    sendDisabled,
    sendTitle,
    stopTitle = "停止生成",
    isPaused = false,
    pauseTitle = "暂停输出",
    resumeTitle = "继续输出",
    slashCommands = [],
    enableMentions = true,
    loadMentionItems,
    showGlobalDraftsInMentions = true,
    showAttachments = true,
    showFormatting = true,
    allowImageAttachments = false,
    attachmentDisplay = "cards",
    showModelSelector = true,
    showReasoningEffort = false,
    reasoningEffort = "medium",
    showApprovalMode = false,
    approvalMode = "off",
    showWorkspaceSwitcher = false,
    contextUsage = null,
    contextCompactionThreshold = 0,
    workspace = null,
    workspacePath = "",
    recentWorkspaces = [],
    workspaceTauriAvailable = false,
    workspaceBrowserModeNotice = "",
    showStopButton = true,
    onConfigureModels = () => {},
    onModelChange = () => {},
    onReasoningEffortChange = () => {},
    onApprovalModeChange = () => {},
    onPickWorkspace = () => {},
    onPickWslWorkspace = () => {},
    onSelectWorkspace = () => {},
    onAttachmentPickerOpenChange,
    onUploadAttachments,
    focusRequest = 0,
    attachmentPreviewLoader,
    onSend,
    onStop,
    onPause = () => {},
    onResume = () => {},
  }: Props = $props();

  let composerEl = $state<HTMLElement | null>(null);
  let formatToolbarOpen = $state(false);
  const hasComposerContent = $derived(
    Boolean(value.trim() || attachments.length || contexts.length),
  );
  const streamingPrimaryTitle = $derived(
    hasComposerContent ? sendTitle : isPaused ? resumeTitle : pauseTitle,
  );
  const approvalModeOptions = $derived([
    {
      value: "manual",
      label: $t("approvalModeManual"),
      selectedLabel: $t("approvalModeManualShort"),
      description: $t("approvalModeManualDescription"),
    },
    {
      value: "auto",
      label: $t("approvalModeAuto"),
      selectedLabel: $t("approvalModeAutoShort"),
      description: $t("approvalModeAutoDescription"),
    },
    {
      value: "off",
      label: $t("approvalModeOff"),
      selectedLabel: $t("approvalModeOffShort"),
      description: $t("approvalModeOffDescription"),
    },
  ]);

  function runPrimaryAction() {
    if (!isStreaming || hasComposerContent) {
      onSend();
    } else if (isPaused) {
      onResume();
    } else {
      onPause();
    }
  }

  function removeContext(index: number) {
    contexts = contexts.filter((_, itemIndex) => itemIndex !== index);
  }

  let paletteAvailableHeight = $state(320);

  const tauriAvailable = isTauri();
  const paletteConfiguredMaxHeight = 320;
  const paletteComposerGap = 6;
  const paletteViewportInset = 8;
  const contextUsagePercent = $derived(
    contextUsage && contextCompactionThreshold > 0
      ? Math.min(100, (contextUsage / contextCompactionThreshold) * 100)
      : 0,
  );
  const contextUsageTooltip = $derived.by(() => {
    if ((!contextUsage && !isStreaming) || contextCompactionThreshold <= 0) return "";
    const usedPercent = Math.round(contextUsagePercent);
    const remainingPercent = Math.max(0, 100 - usedPercent);
    return `${$t("contextWindow")}: ${usedPercent}% ${$t("contextUsed")} (${remainingPercent}% ${$t("contextRemaining")}) · ${formatTokenCount(contextUsage ?? 0)} / ${formatTokenCount(contextCompactionThreshold)} ${$t("tokensUsed")}`;
  });

  function formatTokenCount(tokens: number): string {
    return new Intl.NumberFormat([], { notation: "compact", maximumFractionDigits: 1 }).format(
      tokens,
    );
  }

  const editorController = createEditorController({
    get value() {
      return value;
    },
    set value(next) {
      value = next;
    },
    get attachments() {
      return attachments;
    },
    get disabled() {
      return disabled;
    },
    get focusRequest() {
      return focusRequest;
    },
    get palette() {
      return paletteController;
    },
    runPrimaryAction,
  });

  const attachmentController = createAttachmentController({
    get value() {
      return value;
    },
    set value(next) {
      value = next;
    },
    get attachments() {
      return attachments;
    },
    set attachments(next) {
      attachments = next;
    },
    get editorEl() {
      return editorController.editorEl;
    },
    get disabled() {
      return disabled;
    },
    get showAttachments() {
      return showAttachments;
    },
    get allowImageAttachments() {
      return allowImageAttachments;
    },
    get onUploadAttachments() {
      return onUploadAttachments;
    },
    get onAttachmentPickerOpenChange() {
      return onAttachmentPickerOpenChange;
    },
    client: desktopOpenAgent,
    get tauriAvailable() {
      return tauriAvailable && !onUploadAttachments;
    },
    insertPastedText: editorController.insertPastedText,
  });

  const paletteController = createPaletteController({
    get value() {
      return value;
    },
    get editorEl() {
      return editorController.editorEl;
    },
    get slashCommands() {
      return slashCommands;
    },
    get enableMentions() {
      return enableMentions;
    },
    get showGlobalDraftsInMentions() {
      return showGlobalDraftsInMentions;
    },
    get loadMentionItems() {
      return loadMentionItems;
    },
    tauriAvailable,
    client: desktopOpenAgent,
    commit: editorController.commit,
    syncPaletteAvailableHeight,
    refocusEditor: editorController.refocusEditor,
  });

  function syncPaletteAvailableHeight() {
    if (!composerEl) return;
    const viewportTop = window.visualViewport?.offsetTop ?? 0;
    const availableHeight =
      composerEl.getBoundingClientRect().top -
      viewportTop -
      paletteComposerGap -
      paletteViewportInset;
    paletteAvailableHeight = Math.max(
      0,
      Math.min(paletteConfiguredMaxHeight, Math.floor(availableHeight)),
    );
  }

  $effect(() => {
    if (!paletteController.paletteMode) {
      paletteAvailableHeight = paletteConfiguredMaxHeight;
      return;
    }
    void tick().then(syncPaletteAvailableHeight);
  });

  onMount(() => {
    const syncOpenPalette = () => {
      if (paletteController.paletteMode) syncPaletteAvailableHeight();
    };
    const composerResizeObserver = new ResizeObserver(syncOpenPalette);
    if (composerEl) composerResizeObserver.observe(composerEl);
    window.addEventListener("resize", syncOpenPalette);
    window.addEventListener("scroll", syncOpenPalette, true);
    window.visualViewport?.addEventListener("resize", syncOpenPalette);
    window.visualViewport?.addEventListener("scroll", syncOpenPalette);
    // `select` does not fire on a contenteditable, so track caret moves centrally.
    const handleSelectionChange = () => {
      if (editorController.editorEl && getMarkdownSelection(editorController.editorEl))
        paletteController.syncPaletteFromCaret();
    };
    document.addEventListener("selectionchange", handleSelectionChange);

    return () => {
      composerResizeObserver.disconnect();
      window.removeEventListener("resize", syncOpenPalette);
      window.removeEventListener("scroll", syncOpenPalette, true);
      window.visualViewport?.removeEventListener("resize", syncOpenPalette);
      window.visualViewport?.removeEventListener("scroll", syncOpenPalette);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  });
</script>

<div class="input-wrapper" class:input-wrapper-streaming={isStreaming}>
  {#if (!tauriAvailable || onUploadAttachments) && showAttachments}
    <input
      class="browser-file-input"
      bind:this={attachmentController.browserFileInput}
      type="file"
      multiple
      accept={attachmentController.browserAttachmentAccept}
      onchange={attachmentController.handleBrowserFileSelection}
    />
  {/if}
  {#if paletteController.paletteMode}
    <div class="palette-anchor" style={`--palette-available-height: ${paletteAvailableHeight}px`}>
      <MentionPalette
        items={paletteController.paletteItems}
        activeIdx={paletteController.activeIdx}
        loading={paletteController.paletteMode === "mention" && paletteController.mentionLoading}
        emptyText={paletteController.paletteEmptyText}
        onSelect={paletteController.applySelection}
        onHover={(idx) => (paletteController.activeIdx = idx)}
      />
    </div>
  {/if}
  <div
    class="composer conversation-input-surface"
    bind:this={composerEl}
    class:composer-disabled={disabled}
    class:composer-streaming={isStreaming}
    class:composer-compact={!showAttachments &&
      !showModelSelector &&
      !showReasoningEffort &&
      !showApprovalMode &&
      !showWorkspaceSwitcher}
  >
    {#if contexts.length > 0}
      <div class="context-list">
        {#each contexts as context, index (`${context.sourceMessageId ?? "quote"}-${index}`)}
          <UserQuote {context} variant="composer" onRemove={() => removeContext(index)} />
        {/each}
      </div>
    {/if}
    {#if attachments.length > 0}
      <div class="attachment-list">
        {#each attachments as attachment (attachment.path)}
          <AttachmentPreview
            {attachment}
            size={attachmentDisplay === "strip" ? "strip" : "composer"}
            loadPreview={attachmentPreviewLoader}
            onRemove={() => attachmentController.removeAttachment(attachment.path)}
          />
        {/each}
      </div>
    {/if}
    <div class="composer-input-stack">
      <!-- Markers are hidden: this editor is a projection of the markdown model. -->
      <div
        class="input input-editor composer-md"
        class:input-editor-empty={value.length === 0 && !editorController.composing}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        contenteditable={disabled ? "false" : "true"}
        tabindex="0"
        spellcheck="false"
        bind:this={editorController.editorEl}
        onkeydown={editorController.handleKeydown}
        onbeforeinput={editorController.handleBeforeInput}
        oninput={editorController.handleInput}
        onpaste={attachmentController.handlePaste}
        oncut={editorController.handleCut}
        oncopy={editorController.handleCopy}
        ondrop={editorController.handleDrop}
        ondragover={editorController.handleDragOver}
        oncompositionstart={editorController.handleCompositionStart}
        oncompositionend={editorController.handleCompositionEnd}
        onblur={() => {
          editorController.rememberSelection();
          // Defer so the mousedown on a palette row still fires.
          setTimeout(() => paletteController.closePalette(), 100);
        }}
        data-placeholder={placeholder}
      ></div>
    </div>
    {#if showFormatting || showAttachments || showModelSelector || showReasoningEffort || showApprovalMode || showWorkspaceSwitcher}
      <div class="composer-toolbar">
        <Tooltip text={formatToolbarOpen ? $t("composerFormattingHide") : $t("composerFormatting")}>
          {#snippet trigger(props)}
            <button
              class="format-toggle"
              class:format-toggle-active={formatToolbarOpen}
              type="button"
              aria-label={formatToolbarOpen
                ? $t("composerFormattingHide")
                : $t("composerFormatting")}
              aria-expanded={formatToolbarOpen}
              {...props}
              {disabled}
              onclick={() => (formatToolbarOpen = !formatToolbarOpen)}
            >
              <span aria-hidden="true">Aa</span>
            </button>
          {/snippet}
        </Tooltip>
        {#if formatToolbarOpen}
          <div
            class="format-actions"
            role="toolbar"
            tabindex="-1"
            aria-label={$t("composerFormatting")}
            onmousedown={(event) => {
              editorController.rememberSelection();
              event.preventDefault();
            }}
          >
            <Tooltip text={$t("mdEditorBold")}>
              {#snippet trigger(props)}
                <button
                  class="format-btn"
                  type="button"
                  aria-label={$t("mdEditorBold")}
                  {...props}
                  {disabled}
                  onclick={() => editorController.applyFormat({ prefix: "**" })}
                >
                  <strong aria-hidden="true">B</strong>
                </button>
              {/snippet}
            </Tooltip>
            <Tooltip text={$t("mdEditorItalic")}>
              {#snippet trigger(props)}
                <button
                  class="format-btn"
                  type="button"
                  aria-label={$t("mdEditorItalic")}
                  {...props}
                  {disabled}
                  onclick={() => editorController.applyFormat({ prefix: "*" })}
                >
                  <em aria-hidden="true">I</em>
                </button>
              {/snippet}
            </Tooltip>
            <Tooltip text={$t("mdEditorStrikethrough")}>
              {#snippet trigger(props)}
                <button
                  class="format-btn"
                  type="button"
                  aria-label={$t("mdEditorStrikethrough")}
                  {...props}
                  {disabled}
                  onclick={() => editorController.applyFormat({ prefix: "~~" })}
                >
                  <s aria-hidden="true">S</s>
                </button>
              {/snippet}
            </Tooltip>
            <Tooltip text={$t("mdEditorInlineCode")}>
              {#snippet trigger(props)}
                <button
                  class="format-btn format-code-btn"
                  type="button"
                  aria-label={$t("mdEditorInlineCode")}
                  {...props}
                  {disabled}
                  onclick={() => editorController.applyFormat({ prefix: "`" })}
                >
                  <code aria-hidden="true">&lt;/&gt;</code>
                </button>
              {/snippet}
            </Tooltip>
          </div>
        {/if}
        {#if showAttachments}<Tooltip text={$t("attachFiles")}>
            {#snippet trigger(props)}
              <button
                class="attach-btn"
                type="button"
                aria-label={$t("attachFiles")}
                {...props}
                {disabled}
                onclick={attachmentController.pickAttachments}
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                  ><path
                    d="M5.5 8.8 10 4.3a2.1 2.1 0 0 1 3 3l-6 6a3.4 3.4 0 0 1-4.8-4.8l6-6"
                  /><path d="m5 10 5.4-5.4" /></svg
                >
              </button>
            {/snippet}
          </Tooltip>{/if}
        {#if showModelSelector && modelOptions.length === 0}
          <Tooltip text={$t("modelSetupHint")}>
            {#snippet trigger(props)}
              <button
                class="composer-model-trigger model-setup-btn"
                type="button"
                {...props}
                {disabled}
                onclick={onConfigureModels}>{$t("configureModels")}</button
              >
            {/snippet}
          </Tooltip>
        {:else if showModelSelector}
          <Select
            bind:value={selectedModel}
            items={modelOptions}
            placeholder={$t("selectModel")}
            {disabled}
            triggerClass="composer-model-trigger"
            contentClass="composer-model-content"
            contentSide="top"
            searchable
            searchPlaceholder={$t("searchModels")}
            emptyText={$t("noMatchingModels")}
            ariaLabel={$t("selectModel")}
            onValueChange={onModelChange}
          />
        {/if}
        {#if showReasoningEffort}
          <ReasoningEffortSelect
            value={reasoningEffort}
            {disabled}
            onValueChange={onReasoningEffortChange}
          />
        {/if}
        {#if showApprovalMode}
          <Select
            value={approvalMode}
            items={approvalModeOptions}
            {disabled}
            triggerClass="composer-model-trigger composer-approval-trigger"
            contentClass="composer-approval-content"
            contentSide="top"
            contentAlign="start"
            ariaLabel={$t("approvalMode")}
            onValueChange={(value) => onApprovalModeChange(value as ApprovalMode)}
          />
        {/if}
        {#if showWorkspaceSwitcher}
          <WorkspaceSwitcher
            variant="composer"
            {workspace}
            {workspacePath}
            {recentWorkspaces}
            tauriAvailable={workspaceTauriAvailable}
            browserModeNotice={workspaceBrowserModeNotice}
            onPick={onPickWorkspace}
            onPickWsl={onPickWslWorkspace}
            onSelect={onSelectWorkspace}
          />
        {/if}
      </div>
    {/if}
  </div>
  {#if contextUsageTooltip}
    <Tooltip text={contextUsageTooltip} side="top" align="end">
      {#snippet trigger(props)}
        <button
          class="context-usage-trigger"
          type="button"
          aria-label={$t("contextWindow")}
          style={`--context-usage-percent: ${contextUsagePercent}%`}
          {...props}
        >
          <span class="context-usage-ring" aria-hidden="true"></span>
        </button>
      {/snippet}
    </Tooltip>
  {/if}
  {#if isStreaming}
    <Tooltip text={streamingPrimaryTitle}>
      {#snippet trigger(props)}
        <button
          class="send-btn"
          class:queue-btn={showStopButton}
          aria-label={streamingPrimaryTitle}
          {...props}
          disabled={hasComposerContent ? sendDisabled : disabled}
          onclick={runPrimaryAction}
        >
          {#if hasComposerContent}
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              width="16"
              height="16"><path d="M8 13V3m-5 5 5-5 5 5" /></svg
            >
          {:else if isPaused}
            <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"
              ><path d="M5 3.4v9.2L12 8 5 3.4Z" /></svg
            >
          {:else}
            <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"
              ><rect x="4" y="3" width="3" height="10" rx="1" /><rect
                x="9"
                y="3"
                width="3"
                height="10"
                rx="1"
              /></svg
            >
          {/if}
        </button>
      {/snippet}
    </Tooltip>
    {#if showStopButton}<Tooltip text={stopTitle}>
        {#snippet trigger(props)}
          <button class="stop-btn" aria-label={stopTitle} {...props} onclick={onStop}>
            <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"
              ><rect x="3" y="3" width="10" height="10" rx="1" /></svg
            >
          </button>
        {/snippet}
      </Tooltip>{/if}
  {:else}
    <Tooltip text={sendTitle}>
      {#snippet trigger(props)}
        <button
          class="send-btn"
          aria-label={sendTitle}
          {...props}
          disabled={sendDisabled}
          onclick={onSend}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            width="16"
            height="16"><path d="M8 13V3m-5 5l5-5 5 5" /></svg
          >
        </button>
      {/snippet}
    </Tooltip>
  {/if}
</div>

<style>
  .browser-file-input {
    display: none;
  }
  .input-wrapper {
    position: relative;
    min-width: 0;
  }

  .composer {
    position: relative;
    z-index: 3;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    container-type: inline-size;
    transition: box-shadow 1.35s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
  }

  /* Keep wrapped placeholder text clear of the send control in narrow panes. */
  @container (max-width: 280px) {
    .composer .input {
      min-height: var(--composer-input-narrow-min-height) !important;
    }

    .composer-toolbar {
      gap: 4px;
    }

    :global(.composer-model-trigger) {
      max-width: min(180px, 100%);
    }
  }

  .composer-disabled {
    opacity: 0.6;
  }

  .context-usage-trigger {
    position: absolute;
    right: 45px;
    bottom: 12px;
    z-index: 4;
    display: inline-grid;
    width: 24px;
    height: 24px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: var(--text-muted);
    background: transparent;
    cursor: help;
  }

  .context-usage-trigger:hover,
  .context-usage-trigger:focus-visible {
    color: var(--text);
    background: var(--interactive-state-bg);
    outline: none;
  }

  .context-usage-ring {
    width: 12px;
    height: 12px;
    background: conic-gradient(
      currentColor var(--context-usage-percent),
      color-mix(in srgb, currentColor 18%, transparent) 0
    );
    border-radius: 50%;
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 0);
    mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 0);
  }

  .composer-compact .input {
    min-height: 54px;
    padding-bottom: 12px;
    padding-right: 54px;
  }

  .composer-input-stack {
    position: relative;
  }

  .composer-streaming.composer-disabled {
    opacity: 1;
  }

  .composer > :global(*) {
    position: relative;
    z-index: 1;
  }

  .palette-anchor {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 6px);
    z-index: 50;
  }

  .input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    background: transparent;
    border: none;
    border-radius: 0;
    padding: var(--composer-input-padding);
    color: var(--text);
    font-family: inherit;
    font-size: 14px;
    resize: none;
    outline: none;
    line-height: 1.47;
    transition: border-color var(--motion-fast) var(--ease-standard);
    min-height: var(--composer-input-min-height);
    max-height: 200px;
    overflow-y: auto;
  }

  .input-editor {
    position: relative;
    z-index: 1;
    caret-color: var(--text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .input-editor.input-editor-empty::before {
    color: var(--text-muted);
    content: attr(data-placeholder);
    pointer-events: none;
  }

  .input:focus {
    border-color: transparent;
  }

  .input:disabled {
    opacity: 1;
  }

  .attachment-list {
    display: flex;
    flex-wrap: nowrap;
    gap: 8px;
    padding: 10px 12px 2px;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .context-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 10px 12px 2px;
  }

  .composer-toolbar {
    min-width: 0;
    min-height: var(--composer-toolbar-min-height);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 0 48px 6px 9px;
  }

  .attach-btn {
    flex: 0 0 var(--composer-control-size);
    width: var(--composer-control-size);
    height: var(--composer-control-size);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    padding: 0;
  }

  .format-toggle,
  .format-btn {
    flex: 0 0 var(--composer-control-size);
    width: var(--composer-control-size);
    height: var(--composer-control-size);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: var(--composer-control-radius);
    background: transparent;
    color: var(--text-muted);
    padding: 0;
    cursor: pointer;
  }

  .format-toggle:hover:not(:disabled),
  .format-toggle-active,
  .format-btn:hover:not(:disabled) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  .format-toggle:focus-visible,
  .format-btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .format-actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding-right: 2px;
    border-right: 1px solid var(--mica-divider);
  }

  .format-code-btn code {
    font-size: 11px;
  }

  .attach-btn:hover:not(:disabled) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  :global(.composer-model-trigger) {
    flex: 0 1 auto;
    width: auto;
    max-width: 260px;
    min-width: 0;
    overflow: hidden;
    border: 0;
    background: transparent;
    box-shadow: none;
    padding: 5px 8px;
    font-size: 12px;
    color: var(--text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.composer-model-trigger:hover:not(:disabled)) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  :global(.composer-model-trigger:focus-visible) {
    box-shadow: var(--focus-ring);
    outline: none;
  }

  :global(.composer-model-trigger[data-state="open"]) {
    box-shadow: none;
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  :global(.composer-approval-trigger) {
    max-width: 150px;
  }

  :global(.composer-approval-content) {
    width: min(320px, calc(100vw - 24px));
  }

  .model-setup-btn {
    cursor: pointer;
  }

  :global(.composer-model-content) {
    min-width: 240px;
    max-width: 360px;
  }

  .send-btn {
    position: absolute;
    z-index: 4;
    right: var(--composer-send-inset);
    bottom: var(--composer-send-inset);
    width: var(--composer-control-size);
    height: var(--composer-control-size);
    background: var(--primary);
    color: white;
    border: none;
    border-radius: var(--composer-control-radius);
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background var(--motion-fast) var(--ease-standard),
      transform var(--motion-fast) var(--ease-standard),
      opacity var(--motion-fast) var(--ease-standard);
    user-select: none;
  }

  .send-btn:hover:not(:disabled) {
    background: var(--primary-hover);
  }

  .send-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .send-btn:disabled {
    opacity: 0.25;
    cursor: default;
  }

  .stop-btn {
    position: absolute;
    z-index: 4;
    right: var(--composer-send-inset);
    bottom: var(--composer-send-inset);
    width: var(--composer-control-size);
    height: var(--composer-control-size);
    background: var(--surface2);
    color: var(--text-muted);
    border: 0;
    border-radius: var(--composer-control-radius);
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--control-shadow);
    transition:
      background var(--motion-fast) var(--ease-standard),
      color var(--motion-fast) var(--ease-standard),
      transform var(--motion-fast) var(--ease-standard);
    user-select: none;
  }

  .queue-btn {
    right: calc(var(--composer-send-inset) + var(--composer-control-size) + 6px);
    background: var(--primary);
  }

  .stop-btn:hover {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  .stop-btn:active {
    transform: scale(0.95);
  }
</style>
