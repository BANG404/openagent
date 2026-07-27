<script lang="ts">
  import { Tooltip as TooltipPrimitive } from "bits-ui";
  import { onMount } from "svelte";
  import ChatQueue from "$lib/components/ChatQueue.svelte";
  import ConversationList from "$lib/components/ConversationList.svelte";
  import FileChangeBanner from "$lib/components/FileChangeBanner.svelte";
  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";
  import MessageInput, { type SlashCommand } from "$lib/components/MessageInput.svelte";
  import MessageList from "$lib/components/MessageList.svelte";
  import RoleSelector from "$lib/components/RoleSelector.svelte";
  import SidebarCollapseButton from "$lib/components/SidebarCollapseButton.svelte";
  import SidebarPrimaryActions from "$lib/components/SidebarPrimaryActions.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import ToolApprovalActions from "$lib/components/ToolApprovalActions.svelte";
  import UserInputForm from "$lib/components/UserInputForm.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import {
    buildTreeFromCheckpoints,
    checkpointRecordsToMessages,
    ckIdsAlongActivePath,
    computeActivePath,
    findForkParentCheckpointId,
    ROOT_KEY,
    selectActivePathToCheckpoint,
    type ConvTree,
  } from "$lib/checkpointTree";
  import { mermaidConfigFor } from "$lib/mermaidTheme";
  import { setLocale, t, tr, type Locale, type TranslationKeys } from "$lib/i18n";
  import { renderMermaidToolResult } from "$lib/streamdown/mermaidRenderer";
  import {
    clearQueuedChatMessages,
    dequeueChatMessage,
    enqueueChatMessage,
    removeQueuedChatMessage,
    type QueuedChatMessages,
  } from "$lib/chatQueue";
  import { resolveUserInput } from "$lib/chatStream";
  import type {
    AgentRole,
    ChatAttachment,
    ChatMessage,
    Conversation,
    FileChange,
    StreamItem,
    UserInputRequest,
  } from "$lib/types";
  import {
    OpenAgentClient,
    type AgentCommandSpec,
    interruptRequest,
    provideOpenAgentUiCapabilities,
    type OpenAgentUiCapabilities,
    type RemoteConversationMeta,
    type RemoteConversationState,
    type RemoteInterrupt,
    type RemoteModel,
    type RemoteWorkspace,
  } from "$lib/openagent";
  import { HttpTransport } from "$lib/openagent/httpTransport";
  import { randomUuid } from "$lib/uuid";

  type Screen = "loading" | "pair" | "chat";
  const client = new OpenAgentClient(new HttpTransport());
  const defaultRoleKey = "openagent";

  let screen = $state<Screen>("loading");
  let pairingCode = $state("");
  let workspaces = $state<RemoteWorkspace[]>([]);
  let workspaceId = $state("");
  let roles = $state<AgentRole[]>([]);
  let selectedRoleKey = $state(defaultRoleKey);
  let remoteModels = $state<RemoteModel[]>([]);
  let agentCommandSpecs = $state<AgentCommandSpec[]>([]);
  let selectedModel = $state("");
  let remoteConversationMetas = $state<RemoteConversationMeta[]>([]);
  let conversationSearchQuery = $state("");
  let conversation = $state<RemoteConversationState | null>(null);
  let activeTree = $state<ConvTree | undefined>();
  let activeBranchId = $state<string | null>(null);
  let fileChanges = $state<FileChange[]>([]);
  let instruction = $state("");
  let attachments = $state<ChatAttachment[]>([]);
  let busy = $state(false);
  let loadingWorkspace = $state(false);
  let error = $state("");
  let commandNotice = $state("");
  let disconnect: (() => void) | null = null;
  let messagesEl = $state<HTMLElement | null>(null);
  let isDarkTheme = $state(false);
  let preferredTheme = $state<"system" | "light" | "dark">("system");
  let sidebarCollapsed = $state(false);
  let optimisticUser = $state<ChatMessage | null>(null);
  let pendingAssistantMessageId = $state<string | null>(null);
  let forkDisplayMessages = $state<ChatMessage[] | null>(null);
  let queuedChatMessages = $state<QueuedChatMessages>({});
  let resolvingInterrupt = $state<{
    id: string;
    state: "answered" | "cancelled";
    response: unknown;
  } | null>(null);
  const previewUrls = new Set<string>();
  const handledMermaidInterrupts = new Set<string>();

  const remoteUiCapabilities: OpenAgentUiCapabilities = {
    async openUrl(url) {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(tr("remoteUnsupportedUrl"));
      }
      const opened = window.open(parsed.href, "_blank", "noopener,noreferrer");
      if (opened) opened.opener = null;
    },
    openPath: (path) => client.openWorkspacePath(path, activeConversationId()),
    readTextSnippet: (path, startLine, endLine) =>
      client.readWorkspaceTextSnippet(path, startLine, endLine, activeConversationId()),
    resolveMedia: (path, kind) =>
      client.resolveWorkspaceMedia(path, kind, activeConversationId()),
    readHtmlPreview: (path) => client.readHtmlPreview(path, activeConversationId()),
    async repairAttachment(blobId, name) {
      const file = await selectBrowserFile();
      if (!file) return false;
      await client.repairAttachmentBlob(blobId, name, await fileToBase64(file));
      return true;
    },
    async saveDownloadFile(filename, content, encoding) {
      const bytes = encoding === "base64"
        ? Uint8Array.from(atob(content), (character) => character.charCodeAt(0))
        : new TextEncoder().encode(content);
      const url = URL.createObjectURL(new Blob([bytes]));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      return { location: filename };
    },
  };
  provideOpenAgentUiCapabilities(remoteUiCapabilities);

  function activeConversationId(): string {
    if (!conversation) throw new Error(tr("remoteSelectConversationFirst"));
    return conversation.conv_id;
  }

  const activeInterrupt = $derived(conversation?.interrupts[0] ?? null);
  const running = $derived(
    conversation?.phase === "before_completion"
      || pendingAssistantMessageId !== null
      || resolvingInterrupt !== null,
  );
  const projectedMessages = $derived.by(() => {
    let projected: ChatMessage[];
    if (forkDisplayMessages) projected = forkDisplayMessages;
    else if (!running && activeTree) {
      const path = computeActivePath(activeTree);
      projected = path.length > 0
        ? path
        : conversation
          ? checkpointRecordsToMessages(
            conversation.messages,
            conversation.checkpoint_id ?? "remote-live",
            conversation.conv_id,
          )
          : [];
    } else {
      projected = conversation
        ? checkpointRecordsToMessages(
          conversation.messages,
          conversation.checkpoint_id ?? "remote-live",
          conversation.conv_id,
        )
        : [];
    }
    const pendingResolution = resolvingInterrupt;
    if (!pendingResolution) return projected;
    return projected.map((message) => message.items?.some((item) => (
      (item.type === "user_input" && item.request.request_id === pendingResolution.id)
      || (item.type === "tool_call" && item.approval?.request.request_id === pendingResolution.id)
    ))
      ? {
        ...message,
        items: resolveUserInput(
          message.items,
          pendingResolution.id,
          pendingResolution.state,
          pendingResolution.response,
        ),
      }
      : message);
  });
  const liveAssistant = $derived.by(() => {
    if (!running) return null;
    if (pendingAssistantMessageId) {
      return projectedMessages.find((message) => message.id === pendingAssistantMessageId) ?? null;
    }
    return [...projectedMessages].reverse().find((message) => message.role === "assistant") ?? null;
  });
  const messages = $derived.by(() => {
    const durable = liveAssistant
      ? projectedMessages.filter((message) => message.id !== liveAssistant.id)
      : projectedMessages;
    return optimisticUser && !durable.some((message) => message.id === optimisticUser?.id)
      ? [...durable, optimisticUser]
      : durable;
  });
  const currentStreamMessageId = $derived(
    running ? (liveAssistant?.id ?? pendingAssistantMessageId) : null,
  );
  const currentStreamItems = $derived.by<StreamItem[]>(() => {
    if (!liveAssistant) return [];
    return liveAssistant.items?.length
      ? liveAssistant.items
      : liveAssistant.content
        ? [{ type: "text", content: liveAssistant.content }]
        : [];
  });
  const hasInlineInterrupt = $derived.by(() => projectedMessages.some((message) =>
    message.items?.some((item) => (
      item.type === "user_input"
      && item.state === "pending"
      && item.request.request_id === activeInterrupt?.id
    ) || (
      item.type === "tool_call"
      && item.approval?.state === "pending"
      && item.approval.request.request_id === activeInterrupt?.id
    )),
  ));
  const conversations = $derived(remoteConversationMetas.map(metaToConversation));
  const currentFileChanges = $derived.by(() => {
    const activeCheckpoints = activeTree ? ckIdsAlongActivePath(activeTree) : new Set<string>();
    const branchChanges = activeCheckpoints.size
      ? fileChanges.filter((change) => activeCheckpoints.has(change.checkpoint_id))
      : fileChanges;
    const byPath = new Map<string, FileChange>();
    for (const change of branchChanges) {
      const existing = byPath.get(change.path);
      if (!existing
        || (existing.old_patch !== null && change.old_patch === null)
        || (existing.old_patch !== null && change.old_patch !== null
          && (change.created_at > existing.created_at
            || (change.created_at === existing.created_at && change.seq > existing.seq)))) {
        byPath.set(change.path, change);
      }
    }
    return [...byPath.values()];
  });
  const streamingConvIds = $derived(
    conversation && running ? { [conversation.conv_id]: true } : {},
  );
  const modelOptions = $derived(remoteModels.map((item) => ({
    value: modelKey(item),
    label: `${item.provider_name} · ${item.model}`,
    selectedLabel: item.model,
  })));
  const slashCommands = $derived.by<SlashCommand[]>(() =>
    agentCommandSpecs.flatMap((spec) => {
      const run = remoteSlashCommandRun(spec.name);
      if (!run) return [];
      return [{
        id: spec.name,
        name: spec.name,
        label: tr(spec.label_key as TranslationKeys),
        description: tr(spec.description_key as TranslationKeys),
        run,
      }];
    }),
  );
  const shikiTheme = $derived(isDarkTheme ? "github-dark" : "github-light");
  const mermaidConfig = $derived(mermaidConfigFor(isDarkTheme));

  $effect(() => {
    const interrupt = activeInterrupt;
    if (!interrupt || interrupt.kind !== "render_mermaid"
      || handledMermaidInterrupts.has(interrupt.id) || !conversation) return;
    const source = typeof interrupt.arguments.source === "string"
      ? interrupt.arguments.source
      : "";
    handledMermaidInterrupts.add(interrupt.id);
    void renderMermaidToolResult(source, mermaidConfig)
      .then((result) => client.submitInterruptResponse({
        convId: conversation!.conv_id,
        interruptId: interrupt.id,
        response: JSON.stringify(result),
      }))
      .catch((cause) => {
        handledMermaidInterrupts.delete(interrupt.id);
        error = cause instanceof Error ? cause.message : String(cause);
      });
  });

  onMount(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => applyRemoteTheme(preferredTheme);
    syncTheme();
    sidebarCollapsed = window.matchMedia("(max-width: 760px)").matches;
    media.addEventListener("change", syncTheme);
    void bootstrap();
    return () => {
      media.removeEventListener("change", syncTheme);
      disconnect?.();
      for (const url of previewUrls) URL.revokeObjectURL(url);
    };
  });

  function metaToConversation(meta: RemoteConversationMeta): Conversation {
    return {
      id: meta.id,
      title: meta.title,
      messages: [],
      createdAt: meta.created_at * 1000,
      updatedAt: meta.updated_at * 1000,
      pinned: meta.pinned,
      parentConvId: meta.parent_conv_id,
      compactedFromConvId: meta.compacted_from_conv_id,
      flowKind: meta.flow_kind,
      flowStatus: meta.flow_status,
      roleId: meta.role_id,
    };
  }

  function modelKey(model: RemoteModel): string {
    return JSON.stringify([model.provider_id, model.model]);
  }

  function selectedModelBinding() {
    if (!selectedModel) return null;
    const [providerId, model] = JSON.parse(selectedModel) as [string, string];
    return { providerId, model };
  }

  function applyRemoteTheme(theme: "system" | "light" | "dark") {
    preferredTheme = theme;
    const resolved = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(resolved);
    isDarkTheme = resolved === "dark";
  }

  function remoteSlashCommandRun(name: string): (() => void) | null {
    switch (name) {
      case "new":
        return () => { void newConversation(); };
      case "compact":
        return () => {
          instruction = "/compact";
          void sendInstruction();
        };
      case "goal":
        return () => { instruction = "/goal "; };
      case "graph":
        return () => { instruction = "/graph "; };
      default:
        return null;
    }
  }

  async function bootstrap() {
    if (!(await client.restoreRemoteSession())) {
      screen = "pair";
      return;
    }
    await loadGateway();
  }

  async function pair() {
    const code = pairingCode.replace(/\s/g, "").toUpperCase();
    if (code.length !== 8) return;
    await perform(async () => {
      await client.pairRemoteGateway(code);
      pairingCode = "";
      await loadGateway();
    });
  }

  async function loadGateway() {
    const [nextWorkspaces, nextModels, nextCommands, preferences] = await Promise.all([
      client.listRemoteWorkspaces(),
      client.listRemoteModels(),
      client.listAgentCommands(),
      client.getRemotePreferences(),
    ]);
    workspaces = nextWorkspaces;
    remoteModels = nextModels;
    agentCommandSpecs = nextCommands;
    applyRemoteTheme(preferences.theme);
    setLocale(preferences.language as Locale);
    selectedModel = modelKey(remoteModels.find((model) => model.is_default) ?? remoteModels[0]);
    workspaceId = workspaces[0]?.id ?? "";
    if (workspaceId) await loadWorkspace(workspaceId);
    screen = "chat";
  }

  async function loadWorkspace(nextWorkspaceId: string) {
    workspaceId = nextWorkspaceId;
    loadingWorkspace = true;
    error = "";
    disconnect?.();
    disconnect = null;
    conversation = null;
    activeTree = undefined;
    activeBranchId = null;
    fileChanges = [];
    optimisticUser = null;
    pendingAssistantMessageId = null;
    forkDisplayMessages = null;
    try {
      [roles, remoteConversationMetas] = await Promise.all([
        client.listRemoteRoles(workspaceId),
        client.listRemoteConversations(workspaceId),
      ]);
      selectedRoleKey = defaultRoleKey;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loadingWorkspace = false;
    }
  }

  async function refreshConversations() {
    if (!workspaceId) return;
    remoteConversationMetas = await client.listRemoteConversations(workspaceId);
  }

  async function createConversation(): Promise<string> {
    if (!workspaceId) throw new Error(tr("remoteSelectWorkspaceFirst"));
    const created = await client.createRemoteConversation(
      workspaceId,
      selectedRoleKey === defaultRoleKey ? null : selectedRoleKey,
    );
    await refreshConversations();
    await connectConversation(created.conv_id);
    return created.conv_id;
  }

  async function newConversation() {
    if (running) return;
    disconnect?.();
    disconnect = null;
    conversation = null;
    activeTree = undefined;
    activeBranchId = null;
    fileChanges = [];
    optimisticUser = null;
    pendingAssistantMessageId = null;
    forkDisplayMessages = null;
    resolvingInterrupt = null;
    error = "";
    if (window.matchMedia("(max-width: 760px)").matches) sidebarCollapsed = true;
  }

  async function connectConversation(convId: string) {
    disconnect?.();
    disconnect = null;
    optimisticUser = null;
    pendingAssistantMessageId = null;
    forkDisplayMessages = null;
    activeTree = undefined;
    activeBranchId = null;
    fileChanges = [];
    [conversation] = await Promise.all([
      client.getRemoteConversationState(convId),
      loadConversationHistory(convId),
    ]);
    disconnect = await client.subscribeToConversationState(convId, (state) => {
      if (conversation?.conv_id !== convId) return;
      const previousPhase = conversation.phase;
      conversation = state;
      if (state.title?.trim()) {
        const index = remoteConversationMetas.findIndex((item) => item.id === convId);
        if (index !== -1 && remoteConversationMetas[index].title !== state.title) {
          remoteConversationMetas[index] = {
            ...remoteConversationMetas[index],
            title: state.title,
          };
        }
      }
      if (resolvingInterrupt
        && !state.interrupts.some((interrupt) => interrupt.id === resolvingInterrupt?.id)) {
        resolvingInterrupt = null;
      }
      if (optimisticUser && state.messages.some((message) => message.id === optimisticUser?.id)) {
        optimisticUser = null;
        forkDisplayMessages = null;
      }
      if (pendingAssistantMessageId
        && state.phase !== "before_completion") {
        pendingAssistantMessageId = null;
      }
      if (previousPhase === "before_completion" && state.phase !== "before_completion") {
        void refreshConversations();
        void loadConversationHistory(convId);
        if (state.phase === "final_completed"
          || state.phase === "final_cancelled"
          || state.phase === "final_failed") {
          queueMicrotask(() => void sendNextQueuedMessage(convId));
        }
      }
      error = "";
    }, () => { error = tr("remoteReconnect"); });
    if (window.matchMedia("(max-width: 760px)").matches) sidebarCollapsed = true;
  }

  async function loadConversationHistory(convId: string) {
    const history = await client.getRemoteConversationHistory(convId);
    let tree = buildTreeFromCheckpoints(history.checkpoints, activeTree);
    if (history.active_branch_tip) {
      tree = selectActivePathToCheckpoint(tree, history.active_branch_tip);
    }
    activeTree = tree;
    activeBranchId = history.branches.find(
      (branch) => branch.head_checkpoint_id === history.active_branch_tip,
    )?.id ?? null;
    fileChanges = history.file_changes;
  }

  async function switchBranch(convId: string, parentKey: string, targetIdx: number) {
    if (running || !activeTree || conversation?.conv_id !== convId) return;
    const siblings = parentKey === ROOT_KEY
      ? activeTree.rootIds
      : activeTree.nodes[parentKey]?.childIds ?? [];
    const checkpointId = siblings[targetIdx];
    if (!checkpointId) return;
    await perform(async () => {
      await client.switchRemoteConversationBranch(convId, checkpointId);
      conversation = await client.getRemoteConversationState(convId);
      await loadConversationHistory(convId);
      requestAnimationFrame(() => {
        if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      });
    });
  }

  async function revertFileChange(changeId: string) {
    if (!conversation) return;
    await client.revertRemoteFileChange(conversation.conv_id, changeId);
    await loadConversationHistory(conversation.conv_id);
  }

  async function selectConversation(id: string) {
    if (id === conversation?.conv_id) return;
    await perform(() => connectConversation(id));
  }

  async function togglePin(id: string) {
    const item = remoteConversationMetas.find((candidate) => candidate.id === id);
    if (!item) return;
    await perform(async () => {
      await client.updateRemoteConversation(id, { pinned: !item.pinned });
      await refreshConversations();
    });
  }

  async function deleteConversation(id: string) {
    if (!window.confirm(tr("remoteDeleteConversationConfirm"))) return;
    await perform(async () => {
      await client.deleteRemoteConversation(id);
      if (conversation?.conv_id === id) {
        disconnect?.();
        disconnect = null;
        conversation = null;
      }
      await refreshConversations();
    });
  }

  async function changeRole(role: string) {
    selectedRoleKey = role;
    if (conversation && !running) await newConversation();
  }

  async function sendInstruction() {
    const text = instruction.trim();
    if ((!text && attachments.length === 0) || activeInterrupt || busy) return;
    if (running) {
      if (!conversation) return;
      queuedChatMessages = enqueueChatMessage(queuedChatMessages, conversation.conv_id, {
        text,
        attachments,
        model: selectedModel,
      });
      instruction = "";
      attachments = [];
      return;
    }
    busy = true;
    error = "";
    commandNotice = "";
    const submittedAttachments = attachments;
    const submittedText = text;
    try {
      const convId = conversation?.conv_id ?? await createConversation();
      const userMessageId = randomUuid();
      const assistantMessageId = randomUuid();
      optimisticUser = {
        id: userMessageId,
        role: "user",
        content: text,
        timestamp: Date.now(),
        items: [
          ...(text ? [{ type: "text" as const, content: text }] : []),
          ...submittedAttachments.map((attachment) => ({ type: "attachment" as const, attachment })),
        ],
      };
      pendingAssistantMessageId = assistantMessageId;
      instruction = "";
      attachments = [];
      const outcome = await client.submitInput({
        convId,
        text,
        attachments: submittedAttachments.map((attachment) => attachment.path),
        modelBinding: selectedModelBinding(),
        userMessageId,
        assistantMessageId,
      });
      if (outcome.type === "immediate_command") {
        optimisticUser = null;
        pendingAssistantMessageId = null;
        commandNotice = outcome.changed ? tr("compactionCompleted") : tr("compactConversationSkipped");
        conversation = await client.getRemoteConversationState(convId);
        await loadConversationHistory(convId);
      }
    } catch (cause) {
      optimisticUser = null;
      pendingAssistantMessageId = null;
      instruction = submittedText;
      attachments = submittedAttachments;
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
    }
  }

  async function sendNextQueuedMessage(convId: string) {
    if (conversation?.conv_id !== convId || activeInterrupt) return;
    const dequeued = dequeueChatMessage(queuedChatMessages, convId);
    queuedChatMessages = dequeued.queue;
    if (!dequeued.next) return;
    instruction = dequeued.next.text;
    attachments = dequeued.next.attachments;
    selectedModel = dequeued.next.model;
    await sendInstruction();
  }

  function removeQueuedMessage(convId: string, index: number) {
    queuedChatMessages = removeQueuedChatMessage(queuedChatMessages, convId, index);
  }

  function clearQueuedMessages(convId: string) {
    queuedChatMessages = clearQueuedChatMessages(queuedChatMessages, convId);
  }

  async function forkConversationRun(
    userMessageIndex: number,
    text: string,
    sourceAttachments: ChatAttachment[],
  ) {
    if (!conversation || !activeTree || running) return;
    const userMessage = projectedMessages[userMessageIndex];
    if (!userMessage || userMessage.role !== "user") return;
    const parentCheckpointId = findForkParentCheckpointId(activeTree, userMessage.id);
    if (parentCheckpointId === undefined) return;
    const normalizedText = text.trim();
    if (!normalizedText && sourceAttachments.length === 0) return;

    busy = true;
    error = "";
    const userMessageId = randomUuid();
    const assistantMessageId = randomUuid();
    forkDisplayMessages = projectedMessages.slice(0, userMessageIndex);
    optimisticUser = {
      id: userMessageId,
      role: "user",
      content: normalizedText,
      timestamp: Date.now(),
      items: [
        ...(normalizedText ? [{ type: "text" as const, content: normalizedText }] : []),
        ...sourceAttachments.map((attachment) => ({ type: "attachment" as const, attachment })),
      ],
    };
    pendingAssistantMessageId = assistantMessageId;
    try {
      await client.forkRemoteConversationRun({
        convId: conversation.conv_id,
        text: normalizedText,
        parentCheckpointId,
        forkedFromMessageId: userMessage.id,
        attachments: sourceAttachments.map((attachment) => ({
          locator: attachment.path,
          name: attachment.name,
        })),
        modelBinding: selectedModelBinding(),
        userMessageId,
        assistantMessageId,
      });
    } catch (cause) {
      forkDisplayMessages = null;
      optimisticUser = null;
      pendingAssistantMessageId = null;
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
    }
  }

  async function commitEdit(
    convId: string,
    userMessageIndex: number,
    text: string,
    editedAttachments: ChatAttachment[],
  ) {
    if (conversation?.conv_id !== convId) return;
    await forkConversationRun(userMessageIndex, text, editedAttachments);
  }

  async function reExecute(convId: string, assistantMessageIndex: number) {
    if (conversation?.conv_id !== convId) return;
    const assistant = projectedMessages[assistantMessageIndex];
    if (!assistant || assistant.role !== "assistant") return;
    let userMessageIndex = assistantMessageIndex - 1;
    while (userMessageIndex >= 0 && projectedMessages[userMessageIndex]?.role !== "user") {
      userMessageIndex -= 1;
    }
    const userMessage = projectedMessages[userMessageIndex];
    if (!userMessage || userMessage.role !== "user") return;
    const sourceAttachments = (userMessage.items ?? [])
      .filter((item): item is Extract<StreamItem, { type: "attachment" }> => item.type === "attachment")
      .map((item) => item.attachment);
    await forkConversationRun(userMessageIndex, userMessage.content, sourceAttachments);
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string"
        ? resolve(reader.result.slice(reader.result.indexOf(",") + 1))
        : reject(new Error(tr("remoteAttachmentReadFailed")));
      reader.onerror = () => reject(reader.error ?? new Error(tr("remoteAttachmentReadFailed")));
      reader.readAsDataURL(file);
    });
  }

  function selectBrowserFile(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.hidden = true;
      let settled = false;
      const finish = (file: File | null) => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(file);
      };
      input.addEventListener("change", () => finish(input.files?.[0] ?? null), { once: true });
      input.addEventListener("cancel", () => finish(null), { once: true });
      window.addEventListener("focus", () => window.setTimeout(() => finish(input.files?.[0] ?? null), 0), { once: true });
      document.body.appendChild(input);
      input.click();
    });
  }

  async function uploadAttachments(files: File[]): Promise<ChatAttachment[]> {
    return Promise.all(files.map(async (file) => {
      const attachment = await client.uploadRemoteAttachment(file.name, await fileToBase64(file));
      if (attachment.kind !== "image") return attachment;
      const previewUrl = URL.createObjectURL(file);
      previewUrls.add(previewUrl);
      return { ...attachment, previewUrl };
    }));
  }

  async function stopMessage() {
    if (!conversation || !running) return;
    await perform(() => client.cancelRemoteConversation(conversation!.conv_id));
  }

  async function answer(requestId: string, values: Record<string, unknown>) {
    await resolveRemoteInterrupt(requestId, { values }, "answered");
  }

  async function cancelAnswer(requestId: string) {
    await resolveRemoteInterrupt(requestId, { cancelled: true }, "cancelled");
  }

  async function cancelInlineInterrupt(requestId: string) {
    if (activeInterrupt?.kind === "tool_approval") await approve(requestId, false);
    else await cancelAnswer(requestId);
  }

  async function approve(requestId: string, approved: boolean) {
    await resolveRemoteInterrupt(requestId, { values: { approved } }, "answered");
  }

  async function resolveRemoteInterrupt(
    requestId: string,
    response: unknown,
    state: "answered" | "cancelled",
  ) {
    if (!conversation || resolvingInterrupt) return;
    const convId = conversation.conv_id;
    resolvingInterrupt = { id: requestId, state, response };
    busy = true;
    error = "";
    try {
      await client.resumeInterrupt({
        convId,
        interruptId: requestId,
        response: JSON.stringify(response),
      });
    } catch (cause) {
      resolvingInterrupt = null;
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
    }
  }

  async function perform(action: () => Promise<void>) {
    busy = true;
    error = "";
    try {
      await action();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
    }
  }

  function approvalRequest(interrupt: RemoteInterrupt): UserInputRequest {
    return {
      request_id: interrupt.id,
      conv_id: conversation?.conv_id ?? null,
      kind: "tool_approval",
      title: tr("toolApprovalRequired"),
      description: interrupt.tool_name,
      fields: [],
      submit_label: tr("toolApprovalApprove"),
      cancel_label: tr("toolApprovalDeny"),
    };
  }
</script>

<svelte:head>
  <title>OpenAgent Remote</title>
  <meta name="description" content="Securely control OpenAgent from a paired device" />
</svelte:head>

<Toast />

<TooltipPrimitive.Provider delayDuration={500} skipDelayDuration={300}>
  {#if screen === "loading"}
    <main class="center-state">{$t("remoteConnecting")}</main>
  {:else if screen === "pair"}
    <main class="gate-layout">
      <section class="gate-card">
        <div class="brand-lockup">
          <div class="brand-mark">OA</div>
          <div><h1>{$t("remoteConnectTitle")}</h1><p>{$t("remoteSecureControl")}</p></div>
        </div>
        <label for="pairing-code">{$t("remoteGatewayPairingCode")}</label>
        <input
          id="pairing-code"
          class="pairing-input"
          maxlength="8"
          autocomplete="one-time-code"
          bind:value={pairingCode}
          onkeydown={(event) => event.key === "Enter" && pair()}
          placeholder="XXXXXXXX"
        />
        <p class="field-hint">{$t("remotePairingHint")}</p>
        <button class="primary-action" disabled={busy || pairingCode.replace(/\s/g, "").length !== 8} onclick={pair}>{$t("remotePairDevice")}</button>
        {#if error}<p class="error-note">{error}</p>{/if}
      </section>
    </main>
  {:else}
    <div class="app" class:sidebar-collapsed={sidebarCollapsed}>
      <aside class="sidebar" class:collapsed={sidebarCollapsed}>
        <div class="sidebar-top">
          {#if !sidebarCollapsed}
            <RoleSelector value={selectedRoleKey} {roles} header onChange={(role) => void changeRole(role)} />
          {/if}
          <SidebarCollapseButton collapsed={sidebarCollapsed} onToggle={() => (sidebarCollapsed = !sidebarCollapsed)} />
        </div>
        {#if !sidebarCollapsed}
          <SidebarPrimaryActions
            searchQuery={conversationSearchQuery}
            onNew={() => void newConversation()}
            onSearch={(query) => (conversationSearchQuery = query)}
          />
          {#if loadingWorkspace}
            <LoadingSkeleton variant="sidebar" rows={8} label={$t("remoteLoadingConversations")} />
          {:else}
            <ConversationList
              {conversations}
              searchQuery={conversationSearchQuery}
              activeConvId={conversation?.conv_id ?? null}
              {streamingConvIds}
              hasMore={false}
              loadingMore={false}
              onLoadMore={() => {}}
              onSelect={(id) => void selectConversation(id)}
              onTogglePin={(id) => void togglePin(id)}
              onDelete={(id) => void deleteConversation(id)}
            />
          {/if}
          <div class="remote-security">{$t("remotePairedScope")}</div>
        {/if}
      </aside>

      <section class="main" class:sidebar-collapsed={sidebarCollapsed}>
        <header class="title-bar">
          <div class="title-bar-left">
            <Select
              bind:value={workspaceId}
              items={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
              ariaLabel={$t("remoteWorkspaceLabel")}
              triggerClass="remote-workspace-trigger"
              onValueChange={(id) => id && void loadWorkspace(id)}
            />
            {#if sidebarCollapsed}
              <button class="title-new-conversation" type="button" aria-label={$t("remoteNewConversation")} onclick={() => void newConversation()}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.75 4.25H5.5A1.75 1.75 0 0 0 3.75 6v8.5a1.75 1.75 0 0 0 1.75 1.75H14a1.75 1.75 0 0 0 1.75-1.75V8.25" /><path d="m9 11 6.35-6.35M12.75 4.25h3v3" /></svg>
              </button>
              <RoleSelector value={selectedRoleKey} {roles} compact onChange={(role) => void changeRole(role)} />
            {/if}
          </div>
          <span class="connection-status"><span></span>{running ? $t("remoteAgentWorking") : $t("remoteHttpConnected")}</span>
        </header>

        <main class="messages" bind:this={messagesEl}>
          {#if loadingWorkspace}
            <LoadingSkeleton variant="conversation" label={$t("remoteLoadingWorkspace")} />
          {:else if !workspaceId}
            <div class="empty-chat"><strong>{$t("remoteNoWorkspaceTitle")}</strong><span>{$t("remoteNoWorkspaceHint")}</span></div>
          {:else if !conversation && conversations.length === 0}
            <div class="empty-chat"><strong>{$t("remoteEmptyTitle")}</strong><span>{$t("remoteEmptyHint")}</span></div>
          {:else}
            <MessageList
              {messages}
              scrollElement={messagesEl}
              isStreaming={running}
              isAwaitingStreamOutput={running && currentStreamItems.length === 0}
              {currentStreamItems}
              {currentStreamMessageId}
              activeConvId={conversation?.conv_id ?? null}
              {activeBranchId}
              debugMode={false}
              {activeTree}
              paddingBottom={170}
              showApiKeyWarn={remoteModels.length === 0}
              {shikiTheme}
              {mermaidConfig}
              newConversationMemoryPrompt={null}
              newConversationMemoryLoading={false}
              editable={!running}
              attachmentPreviewLoader={(locator, name) => client.getRemoteAttachmentPreview(locator, name)}
              onCommitEdit={(convId, userMessageIndex, text, editedAttachments) => void commitEdit(convId, userMessageIndex, text, editedAttachments)}
              onReExecute={(convId, assistantMessageIndex) => void reExecute(convId, assistantMessageIndex)}
              onSwitchBranch={(convId, parentKey, targetIdx) => void switchBranch(convId, parentKey, targetIdx)}
              onSubmitUserInput={answer}
              onCancelUserInput={cancelInlineInterrupt}
            />
          {/if}
        </main>

        <div class="input-area">
          <div class="conversation-aurora" aria-hidden="true"></div>
          <div class="input-inner">
            {#if currentFileChanges.length > 0 && !activeInterrupt}
              <FileChangeBanner changes={currentFileChanges} onRevert={revertFileChange} />
            {/if}
            {#if conversation}
              <ChatQueue
                items={queuedChatMessages[conversation.conv_id] ?? []}
                onRemove={(index) => removeQueuedMessage(conversation!.conv_id, index)}
                onClear={() => clearQueuedMessages(conversation!.conv_id)}
              />
            {/if}
            {#if activeInterrupt && hasInlineInterrupt}
              <p class="inline-interrupt-hint">{$t("remoteCompleteInlineInterrupt")}</p>
            {:else if activeInterrupt?.kind === "render_mermaid"}
              <p class="inline-interrupt-hint">{$t("remoteRenderingMermaid")}</p>
            {:else if activeInterrupt?.kind === "ask_user" && conversation}
              {@const request = interruptRequest(activeInterrupt, conversation.conv_id)}
              {#key request.request_id}<UserInputForm {request} onSubmit={answer} onCancel={cancelAnswer} />{/key}
            {:else if activeInterrupt}
              <div class="approval-card">
                <div class="approval-copy"><p>{activeInterrupt.tool_name}</p><pre>{JSON.stringify(activeInterrupt.arguments, null, 2)}</pre></div>
                <ToolApprovalActions request={approvalRequest(activeInterrupt)} disabled={busy} onApprove={(id) => approve(id, true)} onDeny={(id) => approve(id, false)} />
              </div>
            {:else}
              <MessageInput
                bind:value={instruction}
                bind:attachments
                bind:selectedModel
                {modelOptions}
                {slashCommands}
                enableMentions={false}
                placeholder={remoteModels.length ? $t("remoteComposerPlaceholder") : $t("remoteNoModelsPlaceholder")}
                disabled={!workspaceId || loadingWorkspace}
                isStreaming={running}
                sendDisabled={(!instruction.trim() && attachments.length === 0) || !workspaceId || remoteModels.length === 0 || busy}
                sendTitle={running ? $t("remoteQueueInstruction") : $t("send")}
                showAttachments
                showModelSelector
                showStopButton
                onUploadAttachments={uploadAttachments}
                attachmentPreviewLoader={(locator, name) => client.getRemoteAttachmentPreview(locator, name)}
                onSend={sendInstruction}
                onStop={stopMessage}
              />
            {/if}
            {#if error}<p class="composer-error">{error}</p>{/if}
            {#if commandNotice}<p class="composer-notice">{commandNotice}</p>{/if}
          </div>
        </div>
      </section>
    </div>
  {/if}
</TooltipPrimitive.Provider>

<style>
  .center-state, .gate-layout { display: grid; min-height: 100dvh; place-items: center; padding: 40px 20px; background: var(--bg); color: var(--text-muted); }
  .gate-card { width: min(100%, 440px); padding: 32px; border-radius: 18px; background: var(--control-surface); box-shadow: var(--raised-shadow); backdrop-filter: blur(16px) saturate(1.08); }
  .gate-card h1 { margin: 0; color: var(--text); font-size: 17px; font-weight: 600; }
  .brand-lockup { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
  .brand-lockup p { margin: 1px 0 0; color: var(--text-muted); font-size: 12px; }
  .brand-mark { display: grid; width: 44px; height: 44px; place-items: center; border-radius: 8px; background: var(--primary); color: white; font-weight: 600; }
  .gate-card > label { display: grid; gap: 8px; color: var(--text); font-size: 14px; }
  .pairing-input { box-sizing: border-box; width: 100%; padding: 12px 18px; border: 0; border-radius: 9999px; outline: 0; background: var(--control-surface); box-shadow: var(--control-shadow); color: var(--text); font: 600 20px/1.4 "SFMono-Regular", Consolas, monospace; letter-spacing: .3em; text-align: center; text-transform: uppercase; }
  .pairing-input:focus { box-shadow: var(--control-shadow), var(--focus-ring); }
  .field-hint { margin: 8px 4px 0; color: var(--text-muted); font-size: 12px; line-height: 1.5; }
  .primary-action { width: 100%; min-height: 44px; margin-top: 24px; padding: 11px 22px; border: 0; border-radius: 9999px; background: var(--primary); color: white; font: inherit; cursor: pointer; }
  .primary-action:disabled { cursor: default; opacity: .4; }
  .error-note, .composer-error { color: var(--danger, #dc2626); font-size: 12px; }

  .app { --sidebar-width: 220px; display: flex; height: 100dvh; overflow: hidden; background: var(--bg); color: var(--text); }
  .sidebar { width: var(--sidebar-width); flex-shrink: 0; display: flex; flex-direction: column; overflow: visible; border-right: 1px solid var(--border); background: var(--sidebar-bg); transition: width 180ms cubic-bezier(.16, 1, .3, 1); user-select: none; }
  .sidebar.collapsed { width: 0; overflow: visible; border-right: 0; background: transparent; }
  .sidebar-top { display: flex; box-sizing: border-box; min-height: 50px; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 4px 5px 8px; }
  .sidebar.collapsed .sidebar-top { position: relative; z-index: 11; width: 48px; justify-content: center; padding-left: 4px; }
  .remote-security { margin-top: auto; padding: 10px 12px 14px; color: var(--text-muted); font-size: 10px; line-height: 1.45; }
  .main { position: relative; display: flex; min-width: 0; flex: 1; flex-direction: column; overflow: hidden; }
  .title-bar { position: absolute; inset: 0 0 auto; z-index: 10; display: flex; height: 48px; align-items: center; justify-content: space-between; padding: 0 16px; background: linear-gradient(to bottom, var(--bg) 0%, var(--bg) 55%, transparent 100%); user-select: none; }
  .main.sidebar-collapsed .title-bar { padding-left: 56px; }
  .title-bar-left { display: flex; min-width: 0; flex: 0 1 auto; align-items: center; gap: 6px; }
  :global(.remote-workspace-trigger) { max-width: min(280px, 42vw); border: 0; background: transparent; box-shadow: none; font-weight: 600; }
  .connection-status { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 9999px; background: var(--item-selected-bg); color: var(--primary); font-size: 11px; font-weight: 600; }
  .connection-status > span { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .title-new-conversation { display: grid; width: 28px; height: 28px; place-items: center; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--text-muted); }
  .title-new-conversation:hover { background: var(--surface2); color: var(--text); }
  .title-new-conversation svg { width: 18px; height: 18px; }
  .messages { position: relative; z-index: 1; display: flex; min-height: 0; flex: 1; flex-direction: column; overflow-x: clip; overflow-y: auto; overflow-anchor: none; }
  .empty-chat { display: grid; min-height: 100%; place-content: center; gap: 6px; color: var(--text-muted); text-align: center; }
  .empty-chat strong { color: var(--text); font-size: 18px; font-weight: 600; }
  .empty-chat span { font-size: 13px; }
  .input-area { position: absolute; inset: auto 0 0; z-index: 10; padding-bottom: 16px; pointer-events: none; }
  .input-area::before { position: absolute; z-index: 0; inset: -48px 0 0; background: linear-gradient(to top, var(--bg) 0%, var(--bg) 60%, transparent 100%); content: ""; pointer-events: none; }
  .conversation-aurora { position: absolute; top: calc(100% - 122px); left: 50%; z-index: 0; width: min(calc(100% + 100px), 1064px); height: 210px; background: radial-gradient(ellipse at 12% 62%, rgba(66,133,244,.34) 0 18%, transparent 43%), radial-gradient(ellipse at 36% 52%, rgba(161,66,244,.3) 0 16%, transparent 42%), radial-gradient(ellipse at 61% 64%, rgba(234,67,53,.32) 0 17%, transparent 44%), radial-gradient(ellipse at 84% 54%, rgba(251,188,5,.32) 0 18%, transparent 44%), radial-gradient(ellipse at 50% 78%, rgba(52,168,83,.3) 0 22%, transparent 50%); filter: blur(26px) saturate(1.35); opacity: .56; transform: translateX(-50%); pointer-events: none; }
  .input-inner { position: relative; z-index: 2; box-sizing: border-box; width: min(760px, calc(100% - 32px)); margin: 0 auto; pointer-events: auto; }
  .composer-error { margin: 7px 0 0; text-align: center; }
  .composer-notice { margin: 7px 0 0; color: var(--text-muted); font-size: 12px; text-align: center; }
  .inline-interrupt-hint { margin: 0; padding: 10px; color: var(--text-muted); text-align: center; }
  .approval-card { overflow: hidden; border-radius: 18px; background: var(--control-surface); box-shadow: var(--control-shadow); }
  .approval-copy { padding: 14px 16px; }
  .approval-copy p { margin: 0; font-weight: 600; }
  .approval-copy pre { max-height: 144px; margin: 8px 0 0; overflow: auto; white-space: pre-wrap; color: var(--text-muted); font-size: 12px; }
  @media (prefers-reduced-motion: reduce) { .sidebar { transition: none; } }
  @media (max-width: 760px) {
    .sidebar:not(.collapsed) { position: absolute; z-index: 30; inset: 0 auto 0 0; box-shadow: var(--raised-shadow); }
    .connection-status { max-width: 128px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .input-inner { width: calc(100% - 20px); }
  }
</style>
