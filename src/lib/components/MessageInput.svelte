<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import { invoke } from "$lib/openagent/tauriClient";
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
  import { t } from "$lib/i18n";
  import { showToast } from "$lib/toast";

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
    projectRoles: AgentRole[];
    globalRoles: AgentRole[];
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
    attachmentDisplay?: "cards" | "strip";
    showModelSelector?: boolean;
    showReasoningEffort?: boolean;
    reasoningEffort?: ReasoningEffort;
    showApprovalMode?: boolean;
    approvalMode?: ApprovalMode;
    showWorkspaceSwitcher?: boolean;
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
    attachmentDisplay = "cards",
    showModelSelector = true,
    showReasoningEffort = false,
    reasoningEffort = "medium",
    showApprovalMode = false,
    approvalMode = "off",
    showWorkspaceSwitcher = false,
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

  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let composerEl = $state<HTMLElement | null>(null);
  let browserFileInput = $state<HTMLInputElement | null>(null);
  let wasDisabled = $state(false);
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
  const supportedAttachmentExtensions = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
    "pdf",
    "txt",
    "md",
    "markdown",
    "rtf",
    "html",
    "htm",
    "css",
    "csv",
    "xml",
    "js",
    "jsx",
    "ts",
    "tsx",
    "py",
    "json",
    "yaml",
    "yml",
    "toml",
  ]);

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
    attachments = [...attachments, ...added].slice(0, maxAttachments);
  }

  function appendAttachmentRecords(items: ChatAttachment[]) {
    const known = new Set(attachments.map((item) => item.path));
    attachments = [...attachments, ...items.filter((item) => !known.has(item.path))].slice(
      0,
      maxAttachments,
    );
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
            extensions: [
              "png",
              "jpg",
              "jpeg",
              "gif",
              "webp",
              "svg",
              "pdf",
              "txt",
              "md",
              "markdown",
              "rtf",
              "html",
              "css",
              "csv",
              "xml",
              "js",
              "jsx",
              "ts",
              "tsx",
              "py",
              "json",
              "yaml",
              "yml",
              "toml",
            ],
          },
        ],
      });
      const paths = typeof selected === "string" ? [selected] : (selected ?? []);
      appendAttachments(paths);
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
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    return supportedAttachmentExtensions.has(extension);
  }

  async function handlePaste(event: ClipboardEvent) {
    if (!showAttachments) return;
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) return;
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
          return invoke<string>("save_pasted_attachment", { name, contentBase64 });
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
    attachments = attachments.filter((item) => item.path !== path);
  }

  const slashPaletteItems = $derived.by<PaletteItem[]>(() => {
    if (paletteMode !== "slash") return [];
    const q = paletteQuery.toLowerCase();
    return slashCommands
      .filter((c) => !q || c.name.startsWith(q))
      .map((c) => ({
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

  $effect(() => {
    if (textareaEl && !value) {
      textareaEl.style.height = "auto";
    }
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

    return () => {
      composerResizeObserver.disconnect();
      window.removeEventListener("resize", syncOpenPalette);
      window.removeEventListener("scroll", syncOpenPalette, true);
      window.visualViewport?.removeEventListener("resize", syncOpenPalette);
      window.visualViewport?.removeEventListener("scroll", syncOpenPalette);
    };
  });

  $effect(() => {
    if (wasDisabled && !disabled) {
      focusInput();
    }
    wasDisabled = disabled;
  });

  $effect(() => {
    if (focusRequest > 0) void focusInput();
  });

  async function focusInput() {
    await tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (!textareaEl || disabled) return;
    textareaEl.focus({ preventScroll: true });
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
        invoke<DraftCategoryEntry[]>("list_project_drafts", { scope: "local" }).catch(() => []),
        showGlobalDraftsInMentions
          ? invoke<DraftCategoryEntry[]>("list_project_drafts", { scope: "global" }).catch(() => [])
          : Promise.resolve([]),
        invoke<AgentRole[]>("list_agent_roles", { scope: "local" }).catch(() => []),
        invoke<AgentRole[]>("list_agent_roles", { scope: "global" }).catch(() => []),
      ]).then(([projectDrafts, globalDrafts, projectRoles, globalRoles]) => ({
        projectDrafts,
        globalDrafts,
        projectRoles,
        globalRoles,
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
        invoke<string[]>("list_workspace_files", { query }).catch(() => []),
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
      const roleItems = [...catalog.projectRoles, ...catalog.globalRoles]
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
    if (!textareaEl) return;
    const caret = textareaEl.selectionStart ?? value.length;
    const trigger = detectTrigger(value, caret);
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

  function applySelection(item: PaletteItem) {
    if (paletteMode === "slash") {
      const cmd = slashCommands.find((c) => c.id === item.id);
      const caret = textareaEl?.selectionStart ?? value.length;
      closePalette();
      if (cmd) {
        if (cmd.insertText) {
          const selection = applySlashCommandSelection(value, triggerStart, caret, cmd.insertText);
          value = selection.value;
          void tick().then(() => {
            if (!textareaEl) return;
            textareaEl.focus();
            textareaEl.setSelectionRange(selection.caret, selection.caret);
            textareaEl.style.height = "auto";
            textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + "px";
          });
        } else {
          value = "";
          if (textareaEl) textareaEl.style.height = "auto";
          cmd.run?.();
        }
      }
      return;
    }

    if (paletteMode === "mention" && textareaEl) {
      const caret = textareaEl.selectionStart ?? value.length;
      const before = value.slice(0, triggerStart);
      const after = value.slice(caret);
      // Wrap paths with whitespace in quotes so the token stays intact.
      const mention = item.insertText ?? item.id;
      const escapedMention = mention.replaceAll('"', '\\"');
      const token = /\s|"/.test(mention) ? `@"${escapedMention}"` : `@${mention}`;
      const insertion = `${token} `;
      value = `${before}${insertion}${after}`;
      const newCaret = before.length + insertion.length;
      closePalette();
      tick().then(() => {
        if (!textareaEl) return;
        textareaEl.focus();
        textareaEl.setSelectionRange(newCaret, newCaret);
        textareaEl.style.height = "auto";
        textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + "px";
      });
    }
  }

  function handleKeydown(e: KeyboardEvent) {
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

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runPrimaryAction();
    }
  }

  function handleInput(e: Event) {
    const el = e.target as HTMLTextAreaElement;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
    syncPaletteFromCaret();
  }

  function handleSelect() {
    if (paletteMode) syncPaletteFromCaret();
  }
</script>

<div class="input-wrapper" class:input-wrapper-streaming={isStreaming}>
  {#if !tauriAvailable && showAttachments}
    <input
      class="browser-file-input"
      bind:this={browserFileInput}
      type="file"
      multiple
      accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.txt,.md,.markdown,.rtf,.html,.htm,.css,.csv,.xml,.js,.jsx,.ts,.tsx,.py,.json,.yaml,.yml,.toml"
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
    <textarea
      class="input"
      {placeholder}
      bind:value
      bind:this={textareaEl}
      onkeydown={handleKeydown}
      oninput={handleInput}
      onpaste={handlePaste}
      onselect={handleSelect}
      onclick={handleSelect}
      onblur={() => {
        // Defer so the mousedown on a palette row still fires.
        setTimeout(() => closePalette(), 100);
      }}
      {disabled}></textarea>
    {#if showAttachments || showModelSelector || showReasoningEffort || showApprovalMode || showWorkspaceSwitcher}
      <div class="composer-toolbar">
        {#if showAttachments}<Tooltip text={$t("attachFiles")}>
            {#snippet trigger(props)}
              <button
                class="attach-btn app-icon-button"
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
          <button
            class="stop-btn app-icon-button"
            aria-label={stopTitle}
            {...props}
            onclick={onStop}
          >
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
  }

  .composer {
    position: relative;
    z-index: 3;
    width: 100%;
    box-sizing: border-box;
    transition: box-shadow 1.35s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
  }

  .composer-disabled {
    opacity: 0.6;
  }

  .composer-compact .input {
    min-height: 54px;
    padding-bottom: 12px;
    padding-right: 54px;
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
    width: 100%;
    box-sizing: border-box;
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 12px 18px 4px;
    color: var(--text);
    font-family: inherit;
    font-size: 14px;
    resize: none;
    outline: none;
    line-height: 1.47;
    transition: border-color 0.15s;
    min-height: 42px;
    max-height: 200px;
    overflow-y: auto;
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
    height: 38px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 48px 6px 9px;
  }

  .attach-btn {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    padding: 0;
  }

  .attach-btn:hover:not(:disabled) {
    background: var(--interactive-state-bg);
    color: var(--text);
  }

  :global(.composer-model-trigger) {
    width: auto;
    max-width: 260px;
    border: 0;
    background: transparent;
    box-shadow: none;
    padding: 5px 8px;
    font-size: 12px;
    color: var(--text-muted);
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
    right: 9px;
    bottom: 9px;
    width: 30px;
    height: 30px;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 50%;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.15s,
      transform 0.1s,
      opacity 0.15s;
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
    right: 9px;
    bottom: 9px;
    width: 30px;
    height: 30px;
    background: var(--surface2);
    color: var(--text-muted);
    border: 0;
    border-radius: 50%;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--control-shadow);
    transition:
      background 0.15s,
      color 0.15s,
      transform 0.1s;
    user-select: none;
  }

  .queue-btn {
    right: 45px;
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
