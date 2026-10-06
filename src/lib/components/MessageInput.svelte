<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import { desktopOpenAgent } from "$lib/openagent/tauriClient";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { onMount, tick } from "svelte";
  import type {
    AgentRole,
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
  import { applySlashCommandSelection } from "./slashCommandSelection";
  import { filterSlashCommands } from "./slashCommandMatching";
  import {
    insertSoftLineBreak,
    parseBlocks,
    removeEmptyFormatting,
    removeLineMarker,
    splice,
    wordBoundaryAfter,
    wordBoundaryBefore,
    type ComposerEdit,
  } from "$lib/composerMarkdown";
  import {
    clearBlocks,
    getMarkdownSelection,
    renderBlocks,
    setMarkdownSelection,
  } from "$lib/composerDom";
  import { applyComposerFormat, type ComposerFormat } from "./composerFormatting";
  import { t } from "$lib/i18n";
  import { showToast } from "$lib/toast";
  import { attachmentNameSupported, selectableAttachmentExtensions } from "$lib/attachmentPolicy";
  import {
    attachmentsReferencedByText,
    removeAttachmentReference,
    synchronizeAttachmentReferences,
  } from "$lib/composerAttachmentReferences";

  export interface SlashCommand {
    id: string;
    /** Lowercase command name without the leading slash. */
    name: string;
    label: string;
    description: string;
    insertText?: string;
    run?: () => void;
  }

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

  interface MentionCatalog {
    projectDrafts: DraftCategoryEntry[];
    globalDrafts: DraftCategoryEntry[];
    roles: AgentRole[];
  }

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

  let editorEl = $state<HTMLDivElement | null>(null);
  let composerEl = $state<HTMLElement | null>(null);
  // The markdown string is canonical; `lastProjected` is what the editor DOM shows.
  let lastProjected = "";
  let composing = $state(false);
  let undoStack: Array<{ value: string; caret: number }> = [];
  let redoStack: Array<{ value: string; caret: number }> = [];
  let browserFileInput = $state<HTMLInputElement | null>(null);
  let wasDisabled = $state(false);
  let formatToolbarOpen = $state(false);
  let referencedAttachmentPaths = new Set<string>();
  const hasComposerContent = $derived(
    Boolean(value.trim() || attachments.length || contexts.length),
  );
  const attachmentReferencePaths = $derived.by(() => {
    const references = new Map<string, string>();
    for (const attachment of attachments) {
      if (attachment.referenceLabel) references.set(attachment.referenceLabel, attachment.path);
    }
    return references;
  });
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

  // ─── Palette state ─────────────────────────────────────────────────────────
  type Mode = "slash" | "mention";
  let paletteMode = $state<Mode | null>(null);
  let paletteQuery = $state("");
  // Caret position the trigger started at — used to compute the slice to replace.
  let triggerStart = $state(0);
  let activeIdx = $state(0);
  let mentionItems = $state<PaletteItem[]>([]);
  let mentionLoading = $state(false);
  let paletteAvailableHeight = $state(320);
  // Token sequence guards out-of-order fetch results.
  let mentionFetchSeq = 0;
  // Drafts and roles do not depend on the query. Reuse them while the palette
  // remains open instead of issuing four IPC calls for every keystroke.
  let mentionCatalogPromise: Promise<MentionCatalog> | null = null;

  const tauriAvailable = isTauri();
  const maxAttachments = 8;
  const paletteConfiguredMaxHeight = 320;
  const paletteComposerGap = 6;
  const paletteViewportInset = 8;
  const maxAttachmentBytes = 20 * 1024 * 1024;
  const attachmentExtensions = $derived(selectableAttachmentExtensions(allowImageAttachments));
  const browserAttachmentAccept = $derived(
    attachmentExtensions.map((extension) => `.${extension}`).join(","),
  );
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

  function attachmentKind(path: string): ChatAttachment["kind"] {
    return /\.(png|jpe?g|gif|webp)$/i.test(path) ? "image" : "document";
  }

  function appendAttachments(paths: string[], pasted = false) {
    const known = new Set(attachments.map((item) => item.path));
    const added = paths
      .filter((path) => !known.has(path))
      .map((path) => ({
        path,
        name: pasted
          ? (path
              .split(/[/\\]/)
              .pop()
              ?.replace(/^[0-9a-f-]{36}-/i, "") ?? path)
          : (path.split(/[/\\]/).pop() ?? path),
        kind: attachmentKind(path),
      }));
    setAttachments([...attachments, ...added].slice(0, maxAttachments));
  }

  function appendAttachmentRecords(items: ChatAttachment[]) {
    const known = new Set(attachments.map((item) => item.path));
    setAttachments(
      [...attachments, ...items.filter((item) => !known.has(item.path))].slice(0, maxAttachments),
    );
  }

  function setAttachments(nextAttachments: ChatAttachment[]) {
    const synchronized = synchronizeAttachmentReferences(value, nextAttachments);
    attachments = synchronized.attachments;
    value = synchronized.value;
    const limit = synchronized.value.length;
    void tick().then(() => {
      if (!editorEl) return;
      editorEl.focus();
      setMarkdownSelection(editorEl, limit);
    });
  }

  async function pickAttachments() {
    if (disabled) return;
    if (!tauriAvailable) {
      browserFileInput?.click();
      return;
    }
    await onAttachmentPickerOpenChange?.(true);
    try {
      const selected = await openDialog({
        multiple: true,
        directory: false,
        filters: [
          {
            name: "Multimodal files",
            extensions: attachmentExtensions,
          },
        ],
      });
      const paths = typeof selected === "string" ? [selected] : (selected ?? []);
      const accepted = paths.filter((path) => isSupportedAttachment(path));
      const unsupported = paths.find((path) => !isSupportedAttachment(path));
      if (unsupported) {
        const unsupportedName = unsupported.split(/[/\\]/).pop() ?? unsupported;
        showToast({
          title: $t("attachmentPasteFailed"),
          description: `${unsupportedName}: ${$t("attachmentUnsupported")}`,
          variant: "error",
        });
      }
      appendAttachments(accepted);
    } finally {
      await onAttachmentPickerOpenChange?.(false);
    }
  }

  async function uploadBrowserFiles(files: File[]) {
    if (!onUploadAttachments || files.length === 0) return;
    const availableSlots = Math.max(0, maxAttachments - attachments.length);
    if (availableSlots === 0) {
      showToast({ title: $t("attachmentLimitReached"), variant: "error" });
      return;
    }
    const accepted = files.slice(0, availableSlots).filter((file) => {
      if (file.size > maxAttachmentBytes) {
        showToast({
          title: $t("attachmentPasteFailed"),
          description: `${file.name || "Attachment"}: ${$t("attachmentTooLarge")}`,
          variant: "error",
        });
        return false;
      }
      if (!isSupportedAttachment(file.name)) {
        showToast({
          title: $t("attachmentPasteFailed"),
          description: `${file.name}: ${$t("attachmentUnsupported")}`,
          variant: "error",
        });
        return false;
      }
      return true;
    });
    try {
      appendAttachmentRecords(await onUploadAttachments(accepted));
    } catch (error) {
      showToast({
        title: $t("attachmentPasteFailed"),
        description: String(error),
        variant: "error",
      });
    }
    if (files.length > availableSlots) {
      showToast({ title: $t("attachmentLimitReached"), variant: "error" });
    }
  }

  function handleBrowserFileSelection(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    void uploadBrowserFiles(Array.from(input.files ?? []));
    input.value = "";
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Unable to read pasted attachment"));
          return;
        }
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = () => reject(reader.error ?? new Error("Unable to read pasted attachment"));
      reader.readAsDataURL(file);
    });
  }

  function pastedFileName(file: File, index: number): string {
    if (file.name.trim()) return file.name;
    const extension =
      file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/svg+xml"
          ? "svg"
          : file.type.split("/")[1] || "png";
    return `pasted-${Date.now()}-${index + 1}.${extension}`;
  }

  function isSupportedAttachment(name: string): boolean {
    return attachmentNameSupported(name, allowImageAttachments);
  }

  /** Paste plain text so the markdown model and the editor DOM stay in sync. */
  function insertPastedText(event: ClipboardEvent) {
    if (disabled) return;
    const text = event.clipboardData?.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    const start = selection?.start ?? value.length;
    const end = selection?.end ?? start;
    commitEdit(splice(value, start, end, text.replace(/\r\n?/g, "\n")));
  }

  async function handlePaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) {
      insertPastedText(event);
      return;
    }
    if (!showAttachments) return;
    event.preventDefault();
    if (disabled) return;

    if (!tauriAvailable) {
      await uploadBrowserFiles(files);
      return;
    }

    const availableSlots = Math.max(0, maxAttachments - attachments.length);
    if (availableSlots === 0) {
      showToast({ title: $t("attachmentLimitReached"), variant: "error" });
      return;
    }

    const accepted = files
      .slice(0, availableSlots)
      .map((file, index) => ({ file, name: pastedFileName(file, index) }));
    const oversized = accepted.find(({ file }) => file.size > maxAttachmentBytes);
    if (oversized) {
      showToast({
        title: $t("attachmentPasteFailed"),
        description: `${oversized.file.name || "Attachment"}: ${$t("attachmentTooLarge")}`,
        variant: "error",
      });
    }
    const unsupported = accepted.find(({ name }) => !isSupportedAttachment(name));
    if (unsupported) {
      showToast({
        title: $t("attachmentPasteFailed"),
        description: `${unsupported.name}: ${$t("attachmentUnsupported")}`,
        variant: "error",
      });
    }

    const results = await Promise.allSettled(
      accepted
        .filter(({ file, name }) => file.size <= maxAttachmentBytes && isSupportedAttachment(name))
        .map(async ({ file, name }) => {
          const contentBase64 = await fileToBase64(file);
          return desktopOpenAgent.invokeProduct("save_pasted_attachment", { name, contentBase64 });
        }),
    );
    const paths = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    appendAttachments(paths, true);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") {
      showToast({
        title: $t("attachmentPasteFailed"),
        description: String(failed.reason),
        variant: "error",
      });
    }
    if (files.length > availableSlots) {
      showToast({ title: $t("attachmentLimitReached"), variant: "error" });
    }
  }

  function removeAttachment(path: string) {
    const removed = attachments.find((item) => item.path === path);
    if (removed?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(removed.previewUrl);
    const nextValue = removeAttachmentReference(value, removed?.referenceLabel);
    const synchronized = synchronizeAttachmentReferences(
      nextValue,
      attachments.filter((item) => item.path !== path),
    );
    attachments = synchronized.attachments;
    value = synchronized.value;
  }

  $effect(() => {
    const hasNewAttachment = attachments.some(
      (attachment) => !referencedAttachmentPaths.has(attachment.path),
    );
    if (hasNewAttachment || attachments.some((attachment) => !attachment.referenceLabel)) {
      const synchronized = synchronizeAttachmentReferences(value, attachments);
      referencedAttachmentPaths = new Set(
        synchronized.attachments.map((attachment) => attachment.path),
      );
      if (synchronized.attachments.some((attachment, index) => attachment !== attachments[index])) {
        attachments = synchronized.attachments;
      }
      if (synchronized.value !== value) value = synchronized.value;
      return;
    }

    const retainedAttachments = attachmentsReferencedByText(value, attachments);
    for (const attachment of attachments) {
      if (!retainedAttachments.includes(attachment) && attachment.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    }
    const synchronized = synchronizeAttachmentReferences(value, retainedAttachments);
    if (
      synchronized.value !== value ||
      synchronized.attachments.length !== attachments.length ||
      synchronized.attachments.some((attachment, index) => attachment !== attachments[index])
    ) {
      attachments = synchronized.attachments;
      value = synchronized.value;
    }
    referencedAttachmentPaths = new Set(
      synchronized.attachments.map((attachment) => attachment.path),
    );
  });

  const slashPaletteItems = $derived.by<PaletteItem[]>(() => {
    if (paletteMode !== "slash") return [];
    return filterSlashCommands(slashCommands, paletteQuery).map((c) => ({
      id: c.id,
      label: `/${c.name}`,
      detail: c.description,
    }));
  });

  const paletteItems = $derived(paletteMode === "slash" ? slashPaletteItems : mentionItems);

  const paletteEmptyText = $derived(
    paletteMode === "slash"
      ? $t("paletteNoCommands")
      : mentionLoading
        ? $t("paletteLoadingMentions")
        : $t("paletteNoFiles"),
  );

  const historyLimit = 100;

  /** Rebuild the editor DOM from the canonical markdown and restore the caret. */
  function project(nextValue: string, start: number, end = start) {
    if (!editorEl) return;
    lastProjected = nextValue;
    if (nextValue.length === 0) clearBlocks(editorEl);
    else renderBlocks(editorEl, parseBlocks(nextValue, attachmentReferencePaths));
    setMarkdownSelection(editorEl, start, end);
    syncPaletteFromCaret();
  }

  /** Apply an editor-originated edit: record history, then re-project. */
  function commit(nextValue: string, start: number, end = start) {
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    undoStack.push({ value, caret: selection?.start ?? value.length });
    if (undoStack.length > historyLimit) undoStack.shift();
    redoStack = [];
    value = nextValue;
    project(nextValue, start, end);
  }

  function commitEdit(edit: ComposerEdit | null) {
    if (edit) {
      const normalized = removeEmptyFormatting(edit.value, edit.caret);
      commit(normalized.value, normalized.caret);
    }
  }

  function restore(entry: { value: string; caret: number }) {
    value = entry.value;
    project(entry.value, Math.min(entry.caret, entry.value.length));
  }

  function undo() {
    const entry = undoStack.pop();
    if (!entry) return;
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    redoStack.push({ value, caret: selection?.start ?? value.length });
    restore(entry);
  }

  function redo() {
    const entry = redoStack.pop();
    if (!entry) return;
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    undoStack.push({ value, caret: selection?.start ?? value.length });
    restore(entry);
  }

  $effect(() => {
    const nextValue = value;
    if (!editorEl || composing || nextValue === lastProjected) return;
    const selection = getMarkdownSelection(editorEl);
    const limit = nextValue.length;
    const start = Math.min(selection?.start ?? limit, limit);
    const end = Math.min(selection?.end ?? start, limit);
    project(nextValue, start, end);
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
    if (!paletteMode) {
      paletteAvailableHeight = paletteConfiguredMaxHeight;
      return;
    }
    void tick().then(syncPaletteAvailableHeight);
  });

  onMount(() => {
    focusInput();
    const syncOpenPalette = () => {
      if (paletteMode) syncPaletteAvailableHeight();
    };
    const composerResizeObserver = new ResizeObserver(syncOpenPalette);
    if (composerEl) composerResizeObserver.observe(composerEl);
    window.addEventListener("resize", syncOpenPalette);
    window.addEventListener("scroll", syncOpenPalette, true);
    window.visualViewport?.addEventListener("resize", syncOpenPalette);
    window.visualViewport?.addEventListener("scroll", syncOpenPalette);
    // `select` does not fire on a contenteditable, so track caret moves centrally.
    const handleSelectionChange = () => {
      if (editorEl && getMarkdownSelection(editorEl)) syncPaletteFromCaret();
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

  $effect(() => {
    if (wasDisabled && !disabled) {
      focusInput();
    }
    wasDisabled = disabled;
  });

  $effect(() => {
    if (focusRequest > 0) void focusInputAfterWindowActivation(focusRequest);
  });

  async function focusInputAfterWindowActivation(request: number) {
    await focusInput();
    // Windows can report the Tauri window as focused before WebView2 finishes
    // restoring its internal keyboard focus. Retry after that native handoff so
    // the browser does not restore the previously focused control over us.
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    if (focusRequest !== request || !editorEl || disabled) return;
    editorEl.focus({ preventScroll: true });
  }

  async function focusInput() {
    await tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (!editorEl || disabled) return;
    editorEl.focus({ preventScroll: true });
  }

  $effect(() => {
    if (paletteItems.length === 0) {
      activeIdx = 0;
    } else if (activeIdx >= paletteItems.length) {
      activeIdx = paletteItems.length - 1;
    }
  });

  function closePalette() {
    mentionFetchSeq += 1;
    paletteMode = null;
    paletteQuery = "";
    activeIdx = 0;
    mentionItems = [];
    mentionLoading = false;
    mentionCatalogPromise = null;
  }

  // Find an active trigger (/ or @) given the caret position. Returns null if none.
  function detectTrigger(
    text: string,
    caret: number,
  ): { mode: Mode; start: number; query: string } | null {
    // Slash: only when the text begins with `/` and the caret sits inside the
    // leading command token (no whitespace between `/` and caret).
    if (text.startsWith("/")) {
      const head = text.slice(0, caret);
      if (!/\s/.test(head)) {
        return { mode: "slash", start: 0, query: head.slice(1) };
      }
    }
    if (!enableMentions) return null;

    // Mention: look back from the caret for the nearest `@` that is preceded by
    // start-of-text or whitespace, with no whitespace between `@` and caret.
    for (let i = caret - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === "@") {
        const prev = i === 0 ? "" : text[i - 1];
        if (prev === "" || /\s/.test(prev)) {
          return { mode: "mention", start: i, query: text.slice(i + 1, caret) };
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
    }
    return null;
  }

  function loadMentionCatalog(): Promise<MentionCatalog> {
    if (!mentionCatalogPromise) {
      mentionCatalogPromise = Promise.all([
        desktopOpenAgent
          .invokeProduct("list_project_drafts", { scope: "local" })
          .then((value) => value as DraftCategoryEntry[])
          .catch(() => []),
        showGlobalDraftsInMentions
          ? desktopOpenAgent
              .invokeProduct("list_project_drafts", { scope: "global" })
              .then((value) => value as DraftCategoryEntry[])
              .catch(() => [])
          : Promise.resolve([]),
        desktopOpenAgent.invokeProduct("list_agent_roles", {}).catch(() => []),
      ]).then(([projectDrafts, globalDrafts, roles]) => ({
        projectDrafts,
        globalDrafts,
        roles,
      }));
    }
    return mentionCatalogPromise;
  }

  async function refreshMentionItems(query: string) {
    if (!enableMentions || (!tauriAvailable && !loadMentionItems)) {
      mentionItems = [];
      mentionLoading = false;
      return;
    }
    const seq = ++mentionFetchSeq;
    mentionLoading = true;
    try {
      if (loadMentionItems) {
        const items = await loadMentionItems(query);
        if (seq === mentionFetchSeq) mentionItems = items;
        return;
      }
      const [files, catalog] = await Promise.all([
        desktopOpenAgent.invokeProduct("list_workspace_files", { query }).catch(() => []),
        loadMentionCatalog(),
      ]);
      if (seq !== mentionFetchSeq) return;
      const normalizedQuery = query.trim().toLowerCase();
      const toDraftItems = (
        categories: DraftCategoryEntry[],
        scope: "项目" | "全局",
      ): PaletteItem[] => {
        return categories
          .flatMap((category) => category.drafts)
          .sort((a, b) => b.updated_at - a.updated_at || a.path.localeCompare(b.path))
          .filter((draft) => {
            if (!normalizedQuery) return true;
            const searchable =
              `草稿/${scope}/${draft.path} ${draft.name} ${draft.category}`.toLowerCase();
            return searchable.includes(normalizedQuery);
          })
          .map((draft) => ({
            id: `草稿/${scope}/${draft.path}`,
            label: draft.name,
            detail: draft.path,
            hint: scope === "项目" ? $t("mentionProjectDraft") : $t("mentionGlobalDraft"),
          }));
      };
      const draftItems = [
        ...toDraftItems(catalog.projectDrafts, "项目"),
        ...toDraftItems(catalog.globalDrafts, "全局"),
      ];
      const roleItems = catalog.roles
        .filter((role, index, roles) => {
          const normalizedName = role.name.toLocaleLowerCase();
          return (
            roles.findIndex(
              (candidate) => candidate.name.toLocaleLowerCase() === normalizedName,
            ) === index
          );
        })
        .filter((role) => {
          if (!normalizedQuery) return true;
          return `${role.name}\n${role.description}`.toLocaleLowerCase().includes(normalizedQuery);
        })
        .map((role) => ({
          id: `role:${role.id}`,
          insertText: role.name,
          label: role.name,
          detail: Array.from(role.description).slice(0, 50).join(""),
          hint: $t("mentionRole"),
        }));
      mentionItems = [
        ...roleItems,
        ...draftItems,
        ...files.map((path) => ({
          id: path,
          label: path.split("/").pop() ?? path,
          detail: path,
        })),
      ];
    } catch {
      if (seq === mentionFetchSeq) mentionItems = [];
    } finally {
      if (seq === mentionFetchSeq) mentionLoading = false;
    }
  }

  async function syncPaletteFromCaret() {
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    if (!selection) return;
    const trigger = detectTrigger(value, selection.start);
    if (!trigger) {
      if (paletteMode !== null) closePalette();
      return;
    }
    const modeChanged = trigger.mode !== paletteMode;
    paletteMode = trigger.mode;
    syncPaletteAvailableHeight();
    triggerStart = trigger.start;
    paletteQuery = trigger.query;
    if (modeChanged) activeIdx = 0;
    if (trigger.mode === "mention") {
      await refreshMentionItems(trigger.query);
    }
  }

  function refocusEditor() {
    void tick().then(() => editorEl?.focus({ preventScroll: true }));
  }

  function applySelection(item: PaletteItem) {
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    const caret = selection?.start ?? value.length;
    if (paletteMode === "slash") {
      const cmd = slashCommands.find((c) => c.id === item.id);
      closePalette();
      if (cmd) {
        if (cmd.insertText) {
          const next = applySlashCommandSelection(value, triggerStart, caret, cmd.insertText);
          commit(next.value, next.caret);
          refocusEditor();
        } else {
          commit("", 0);
          cmd.run?.();
        }
      }
      return;
    }

    if (paletteMode === "mention") {
      const before = value.slice(0, triggerStart);
      const after = value.slice(caret);
      // Wrap paths with whitespace in quotes so the token stays intact.
      const mention = item.insertText ?? item.id;
      const escapedMention = mention.replaceAll('"', '\\"');
      const token = /\s|"/.test(mention) ? `@"${escapedMention}"` : `@${mention}`;
      const insertion = `${token} `;
      closePalette();
      commit(`${before}${insertion}${after}`, before.length + insertion.length);
      refocusEditor();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    // IME owns Enter/Escape/arrows while composing; never intercept those.
    if (composing || e.isComposing) return;

    if (paletteMode) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (paletteItems.length > 0) {
          activeIdx = (activeIdx + 1) % paletteItems.length;
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (paletteItems.length > 0) {
          activeIdx = (activeIdx - 1 + paletteItems.length) % paletteItems.length;
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (paletteItems.length > 0) {
          e.preventDefault();
          applySelection(paletteItems[activeIdx]);
          return;
        }
      }
    }

    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const key = e.key.toLowerCase();
      // Native undo cannot survive re-projection, so history is model-level.
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      const format: ComposerFormat | null =
        key === "b"
          ? { prefix: "**" }
          : key === "i"
            ? { prefix: "*" }
            : e.key === "`"
              ? { prefix: "`" }
              : null;
      if (format) {
        e.preventDefault();
        applyFormat(format);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runPrimaryAction();
    }
  }

  /** Cut keeps the clipboard payload but replays the deletion on the model. */
  function handleCut(event: ClipboardEvent) {
    if (disabled) return;
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    if (!selection || selection.start === selection.end) return;
    event.preventDefault();
    event.clipboardData?.setData("text/plain", value.slice(selection.start, selection.end));
    commitEdit(splice(value, selection.start, selection.end, ""));
  }

  /**
   * Every browser edit is cancelled and replayed against the markdown model, so
   * the DOM can never drift from the canonical string. Paste, cut, and history
   * have their own listeners and are deliberately not handled here.
   */
  function handleBeforeInput(event: InputEvent) {
    if (composing) return;
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    const start = selection?.start ?? value.length;
    const end = selection?.end ?? start;

    const replace = (from: number, to: number, insertion: string) => {
      event.preventDefault();
      commitEdit(splice(value, from, to, insertion));
    };

    switch (event.inputType) {
      case "insertText":
      case "insertReplacementText": {
        const text = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
        if (text) replace(start, end, text);
        return;
      }
      case "insertLineBreak":
        event.preventDefault();
        commitEdit(insertSoftLineBreak(value, start, end));
        return;
      case "insertParagraph":
        event.preventDefault();
        runPrimaryAction();
        return;
      case "deleteContentBackward":
        if (start !== end) {
          replace(start, end, "");
        } else {
          event.preventDefault();
          commitEdit(
            removeLineMarker(value, start) ?? splice(value, Math.max(0, start - 1), start, ""),
          );
        }
        return;
      case "deleteContentForward":
        replace(start, end === start ? Math.min(value.length, start + 1) : end, "");
        return;
      case "deleteWordBackward":
        replace(wordBoundaryBefore(value, start), end, "");
        return;
      case "deleteWordForward":
        replace(start, wordBoundaryAfter(value, end), "");
        return;
      default:
        return;
    }
  }

  function applyFormat(format: ComposerFormat) {
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    const start = selection?.start ?? value.length;
    const end = selection?.end ?? start;
    const next = applyComposerFormat(value, start, end, format);
    // Leave the wrapped content selected so the next keystroke replaces it.
    commit(next.value, next.start, next.end);
    refocusEditor();
  }

  let compositionAnchor = 0;

  // While an IME owns the editor the DOM is left alone; `handleBeforeInput` and
  // the projection effect both stand down until the composition commits.
  function handleCompositionStart() {
    composing = true;
    compositionAnchor = editorEl
      ? (getMarkdownSelection(editorEl)?.start ?? value.length)
      : value.length;
  }

  function handleCompositionEnd(event: CompositionEvent) {
    composing = false;
    const text = event.data ?? "";
    if (text) commitEdit(splice(value, compositionAnchor, compositionAnchor, text));
    else if (value !== lastProjected) project(value, compositionAnchor);
  }

  function handleDragOver(event: DragEvent) {
    // Nothing may edit the projection directly — drops are replayed on the model.
    event.preventDefault();
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    if (disabled) return;
    const text = event.dataTransfer?.getData("text/plain");
    if (!text) return;
    const selection = editorEl ? getMarkdownSelection(editorEl) : null;
    const start = selection?.start ?? value.length;
    const end = selection?.end ?? start;
    commitEdit(splice(value, start, end, text.replace(/\r\n?/g, "\n")));
  }
</script>

<div class="input-wrapper" class:input-wrapper-streaming={isStreaming}>
  {#if !tauriAvailable && showAttachments}
    <input
      class="browser-file-input"
      bind:this={browserFileInput}
      type="file"
      multiple
      accept={browserAttachmentAccept}
      onchange={handleBrowserFileSelection}
    />
  {/if}
  {#if paletteMode}
    <div class="palette-anchor" style={`--palette-available-height: ${paletteAvailableHeight}px`}>
      <MentionPalette
        items={paletteItems}
        {activeIdx}
        loading={paletteMode === "mention" && mentionLoading}
        emptyText={paletteEmptyText}
        onSelect={applySelection}
        onHover={(idx) => (activeIdx = idx)}
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
            onRemove={() => removeAttachment(attachment.path)}
          />
        {/each}
      </div>
    {/if}
    <div class="composer-input-stack">
      <!-- Markers are hidden: this editor is a projection of the markdown model. -->
      <div
        class="input input-editor composer-md"
        class:input-editor-empty={value.length === 0 && !composing}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        contenteditable={disabled ? "false" : "true"}
        tabindex="0"
        spellcheck="false"
        bind:this={editorEl}
        onkeydown={handleKeydown}
        onbeforeinput={handleBeforeInput}
        onpaste={handlePaste}
        oncut={handleCut}
        ondrop={handleDrop}
        ondragover={handleDragOver}
        oncompositionstart={handleCompositionStart}
        oncompositionend={handleCompositionEnd}
        onblur={() => {
          // Defer so the mousedown on a palette row still fires.
          setTimeout(() => closePalette(), 100);
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
          <div class="format-actions" role="toolbar" aria-label={$t("composerFormatting")}>
            <Tooltip text={$t("mdEditorBold")}>
              {#snippet trigger(props)}
                <button
                  class="format-btn"
                  type="button"
                  aria-label={$t("mdEditorBold")}
                  {...props}
                  {disabled}
                  onclick={() => applyFormat({ prefix: "**" })}
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
                  onclick={() => applyFormat({ prefix: "*" })}
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
                  onclick={() => applyFormat({ prefix: "~~" })}
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
                  onclick={() => applyFormat({ prefix: "`" })}
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
                onclick={pickAttachments}
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
