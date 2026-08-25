<script lang="ts">
  import { isTauri } from "@tauri-apps/api/core";
  import { homeDir } from "@tauri-apps/api/path";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { onMount } from "svelte";

  import { normalizeConfigShape } from "$lib/config";
  import { applyDocumentTheme } from "$lib/appTheme";
  import { initI18n, t, type Locale } from "$lib/i18n";
  import { decodeModelBinding, encodeModelBinding } from "$lib/modelBinding";
  import { invoke, listen } from "$lib/openagent/tauriClient";
  import {
    loadQuickChatPreferences,
    resolveQuickChatModel,
    saveQuickChatPreferences,
  } from "$lib/quickChatPreferences";
  import { QUICK_CHAT_FOCUS_INPUT_EVENT } from "$lib/quickChatShortcut";
  import { saveQuickChatWindowPosition } from "$lib/quickChatWindowPosition";
  import { closeQuickChatWindow } from "$lib/quickChatWindow";
  import { showToast } from "$lib/toast";
  import type { AgentRole, AppConfig, ChatAttachment, RecentWorkspace } from "$lib/types";

  import MessageInput from "$lib/components/MessageInput.svelte";
  import QuickChat from "$lib/components/QuickChat.svelte";

  let { preview = false }: { preview?: boolean } = $props();

  const defaultRoleKey = "openagent";
  const tauriAvailable = isTauri();
  const query = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const isQuickChatWindow = tauriAvailable && query?.has("quick-chat-window") === true;
  const appWindow = isQuickChatWindow ? getCurrentWindow() : null;
  const previewTheme = query?.get("quick-chat-preview-theme");
  const previewLocale: Locale = query?.get("quick-chat-preview-locale") === "en" ? "en" : "zh";
  const browserModeNotice =
    "Desktop features require the Tauri runtime. Start this app with `bun tauri dev`, not `bun run dev`.";

  let config = $state<AppConfig | null>(null);
  let recentWorkspaces = $state<RecentWorkspace[]>([]);
  let selectedModel = $state("");
  let selectedRole = $state(defaultRoleKey);
  let selectedWorkspace = $state("");
  let roles = $state<AgentRole[]>([]);
  let submitting = $state(false);
  let workspaceLoading = $state(false);
  let inputFocusRequest = $state(0);
  let inputText = $state("");
  let inputAttachments = $state<ChatAttachment[]>([]);
  let focusArmed = false;
  let focusSuppressed = false;

  let modelOptions = $derived.by(() =>
    (config?.providers ?? [])
      .filter((provider) => provider.enabled)
      .flatMap((provider) =>
        provider.models.map((model) => ({
          value: encodeModelBinding(provider.id, model),
          label: `${model} · ${provider.name}`,
          selectedLabel: model,
        })),
      ),
  );
  let roleOptions = $derived([
    {
      value: defaultRoleKey,
      label: $t("defaultRoleName"),
      description: $t("defaultRoleDescription"),
    },
    ...roles.map((role) => ({ value: role.id, label: role.name, description: role.description })),
  ]);
  let workspaceOptions = $derived.by(() => {
    const options = [
      ...(selectedWorkspace
        ? [
            {
              value: selectedWorkspace,
              label:
                recentWorkspaces.find((recent) => recent.path === selectedWorkspace)?.name ??
                selectedWorkspace.split(/[/\\]/).filter(Boolean).pop() ??
                selectedWorkspace,
              description: selectedWorkspace,
            },
          ]
        : []),
      ...recentWorkspaces.map((recent) => ({
        value: recent.path,
        label: recent.name,
        description: recent.path,
      })),
    ];
    return options.filter(
      (option, index) =>
        options.findIndex((candidate) => candidate.value === option.value) === index,
    );
  });

  function persistPreferences(): void {
    saveQuickChatPreferences(window.localStorage, {
      model: selectedModel,
      role: selectedRole,
      workspace: selectedWorkspace,
    });
  }

  async function loadRoles(workspace: string): Promise<void> {
    if (!tauriAvailable) {
      roles = [];
      selectedRole = defaultRoleKey;
      return;
    }
    roles = await invoke<AgentRole[]>("list_agent_roles_for_workspace", { workspace }).catch(
      () => [],
    );
    if (selectedRole !== defaultRoleKey && !roles.some((role) => role.id === selectedRole)) {
      selectedRole = defaultRoleKey;
    }
  }

  async function loadSettings(preferredModel = selectedModel): Promise<void> {
    if (!tauriAvailable) {
      applyDocumentTheme(
        previewTheme === "dark" ? "dark" : previewTheme === "light" ? "light" : "system",
      );
      await initI18n(previewLocale);
      return;
    }
    config = normalizeConfigShape(await invoke<AppConfig>("get_settings"));
    recentWorkspaces = config.recent_workspaces ?? [];
    applyDocumentTheme(config.theme ?? "system");
    await initI18n(config.language);
    const fallback = encodeModelBinding(
      config.defaults.chat_model.provider_id,
      config.defaults.chat_model.model,
    );
    selectedModel = resolveQuickChatModel(
      preferredModel,
      fallback,
      modelOptions.map((option) => option.value),
    );
  }

  async function initialize(): Promise<void> {
    await loadSettings();
    const preferences = loadQuickChatPreferences(window.localStorage);
    const fallback = config
      ? encodeModelBinding(config.defaults.chat_model.provider_id, config.defaults.chat_model.model)
      : "";
    selectedModel = resolveQuickChatModel(
      preferences.model,
      fallback,
      modelOptions.map((option) => option.value),
    );
    selectedWorkspace =
      preferences.workspace || config?.workspace || recentWorkspaces[0]?.path || "";
    if (!selectedWorkspace && tauriAvailable) selectedWorkspace = await homeDir();
    selectedRole = preferences.role || defaultRoleKey;
    await loadRoles(selectedWorkspace);
    persistPreferences();
  }

  async function close(): Promise<void> {
    focusArmed = false;
    focusSuppressed = false;
    await closeQuickChatWindow();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    void close();
  }

  async function startDrag(event: PointerEvent): Promise<void> {
    if (!appWindow || event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, input, textarea, select, a")) return;
    event.preventDefault();
    focusArmed = false;
    focusSuppressed = true;
    try {
      await appWindow.startDragging();
      await appWindow.setFocus().catch(() => {});
    } finally {
      focusSuppressed = false;
      focusArmed = true;
    }
  }

  function dismissTransparentArea(event: PointerEvent): void {
    if (!isQuickChatWindow || event.target !== event.currentTarget) return;
    void close();
  }

  async function send(): Promise<void> {
    if (submitting) return;
    const text = inputText;
    const attachments = [...inputAttachments];
    if (!text.trim() && attachments.length === 0) return;
    if (!tauriAvailable) return;
    if (!selectedModel || !modelOptions.some((option) => option.value === selectedModel)) {
      showToast({ title: $t("modelSetupRequired"), variant: "error" });
      return;
    }
    if (!selectedWorkspace) {
      showToast({ title: $t("switchWorkspace"), variant: "error" });
      return;
    }
    submitting = true;
    focusArmed = false;
    focusSuppressed = true;
    try {
      await invoke<string>("submit_quick_chat", {
        workspace: selectedWorkspace,
        text: text.trim() || $t("attachmentOnlyPrompt"),
        attachments: attachments.map((attachment) => attachment.path),
        modelBinding: decodeModelBinding(selectedModel),
        roleId: selectedRole === defaultRoleKey ? null : selectedRole,
      });
      inputText = "";
      inputAttachments = [];
      await close();
    } catch (error) {
      showToast({ title: String(error), variant: "error" });
      await appWindow?.setFocus().catch(() => {});
      focusSuppressed = false;
      focusArmed = true;
    } finally {
      submitting = false;
    }
  }

  function handleModelChange(value: string): void {
    selectedModel = value;
    persistPreferences();
  }

  function handleRoleChange(value: string): void {
    selectedRole = value;
    persistPreferences();
  }

  async function handleWorkspaceChange(value: string): Promise<void> {
    if (!value || value === selectedWorkspace) return;
    selectedWorkspace = value;
    selectedRole = defaultRoleKey;
    await loadRoles(value);
    persistPreferences();
  }

  async function pickWorkspace(): Promise<void> {
    if (!tauriAvailable) return;
    focusArmed = false;
    focusSuppressed = true;
    workspaceLoading = true;
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: selectedWorkspace || (await homeDir()),
      });
      if (typeof selected === "string" && selected) {
        selectedWorkspace = selected;
        selectedRole = defaultRoleKey;
        await loadRoles(selected);
        persistPreferences();
      }
      await appWindow?.setFocus().catch(() => {});
    } finally {
      workspaceLoading = false;
      focusSuppressed = false;
      focusArmed = true;
    }
  }

  async function handleAttachmentPickerOpenChange(open: boolean): Promise<void> {
    if (!appWindow) return;
    if (open) {
      focusArmed = false;
      focusSuppressed = true;
      return;
    }
    await appWindow.setFocus().catch(() => {});
    focusSuppressed = false;
    focusArmed = true;
  }

  async function uploadPreviewAttachments(files: File[]): Promise<ChatAttachment[]> {
    return files.map((file) => ({
      path: `preview://${file.name}-${file.lastModified}`,
      name: file.name,
      kind: /\.(png|jpe?g|gif|webp)$/i.test(file.name) ? "image" : "document",
      previewUrl: /\.(png|jpe?g|gif|webp)$/i.test(file.name)
        ? URL.createObjectURL(file)
        : undefined,
    }));
  }

  onMount(() => {
    if (isQuickChatWindow) document.documentElement.classList.add("quick-chat-window");
    void initialize();
    const unlistenInputFocus = isQuickChatWindow
      ? listen(QUICK_CHAT_FOCUS_INPUT_EVENT, () => {
          inputFocusRequest += 1;
        })
      : null;
    const unlistenSettings = isQuickChatWindow
      ? listen("settings-changed", () => void loadSettings(selectedModel).then(persistPreferences))
      : null;
    const unlistenFocus = appWindow?.onFocusChanged(({ payload: focused }) => {
      if (focusSuppressed) return;
      if (focused) {
        focusArmed = true;
        inputFocusRequest += 1;
      } else if (focusArmed) void close();
    });
    const unlistenMoved = appWindow?.onMoved(({ payload: position }) => {
      saveQuickChatWindowPosition(window.localStorage, position);
    });
    return () => {
      void unlistenInputFocus?.then((dispose) => dispose());
      void unlistenSettings?.then((dispose) => dispose());
      void unlistenFocus?.then((dispose) => dispose());
      void unlistenMoved?.then((dispose) => dispose());
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="quick-chat-stage" role="presentation" onpointerdown={dismissTransparentArea}>
  <QuickChat
    {selectedModel}
    {modelOptions}
    {selectedRole}
    {roleOptions}
    {selectedWorkspace}
    {workspaceOptions}
    {workspaceLoading}
    onModelChange={handleModelChange}
    onRoleChange={handleRoleChange}
    onWorkspaceChange={handleWorkspaceChange}
    onPickWorkspace={() => void pickWorkspace()}
    onDragStart={startDrag}
  >
    {#snippet composer()}
      <MessageInput
        bind:value={inputText}
        bind:attachments={inputAttachments}
        {selectedModel}
        {modelOptions}
        placeholder={tauriAvailable
          ? modelOptions.length
            ? $t("quickChatPlaceholder")
            : $t("modelSetupHint")
          : browserModeNotice}
        disabled={(!tauriAvailable && !preview) || submitting}
        isStreaming={false}
        sendDisabled={(!inputText.trim() && inputAttachments.length === 0) ||
          !tauriAvailable ||
          submitting ||
          modelOptions.length === 0}
        sendTitle={$t("send")}
        slashCommands={[]}
        enableMentions={false}
        showAttachments
        attachmentDisplay="strip"
        showModelSelector={false}
        onUploadAttachments={preview ? uploadPreviewAttachments : undefined}
        focusRequest={inputFocusRequest}
        onAttachmentPickerOpenChange={handleAttachmentPickerOpenChange}
        onSend={send}
        onStop={() => {}}
      />
    {/snippet}
  </QuickChat>
</div>

<style>
  .quick-chat-stage {
    width: 100vw;
    height: 100vh;
    padding: 28px 48px 48px;
    overflow: visible;
    background: transparent;
  }

  :global(html.quick-chat-window),
  :global(html.quick-chat-window body) {
    background: transparent;
  }
</style>
