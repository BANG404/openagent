<script lang="ts">
  import MessageList from "./MessageList.svelte";
  import { checkpointRecordsToMessages } from "$lib/checkpointTree";
  import { createCheckpointController } from "$lib/page/checkpoints";
  import { ChatStreamState } from "$lib/chatStreamState.svelte";
  import { appendCompactionProgress, completeCompactionProgress } from "$lib/chatStream";
  import { mermaidConfigFor } from "$lib/mermaidTheme";
  import type { Locale } from "$lib/i18n";
  import type { CheckpointMessage, Conversation, RenderableCheckpoint } from "$lib/types";

  let { theme, locale }: { theme: string; locale: Locale } = $props();
  const storageKey = "openagent-compaction-transcript-preview";
  const responseId = "compaction-preview-response";
  const record = (
    id: string,
    role: CheckpointMessage["role"],
    content: CheckpointMessage["content"],
  ): CheckpointMessage => ({
    id,
    role,
    content,
    status: "completed",
    timestamp: 1,
    first_token_at: null,
    completed_at: null,
    tags: [],
    system_prompt: null,
    tools: null,
  });
  const initialRecords = [
    record("old-user", "user", [{ type: "text", text: "Earlier request" }]),
    record("old-reply", "assistant", [{ type: "text", text: "Earlier visible answer" }]),
    record("user", "user", [{ type: "text", text: "Continue working" }]),
  ];
  const traceRecords = [
    record(responseId, "assistant", [
      { type: "text", text: "Before compaction trace" },
      { type: "reasoning", text: "Retain the existing trajectory" },
      { type: "tool_use", id: "read-call", name: "read_file", input: { path: "trace.txt" } },
    ]),
    record("result", "user", [
      {
        type: "tool_result",
        tool_use_id: "read-call",
        content: [{ type: "text", text: "Original tool result" }],
      },
    ]),
  ];
  const boundaryRecords = [
    record("divider", "ui", [
      {
        type: "ui",
        ui: {
          version: 1,
          component: "builtin.divider",
          props: { label_key: "compactionCompleted" },
          fallback: "Context compacted",
        },
      },
    ]),
    {
      ...record("replay", "user", [{ type: "text", text: "PRIVATE_PROVIDER_REPLAY" }]),
      tags: ["context_compaction" as const],
    },
  ];
  const approvalRecords = [
    record("approval", "assistant", [
      {
        type: "tool_use",
        id: "approval-call",
        name: "ask_user",
        input: {
          title: "Confirm scenario inputs",
          description: "Review the scenario after compaction.",
          fields: [{ name: "confirmed", label: "Confirm inputs", type: "confirm" }],
        },
      },
    ]),
    record("approval-result", "user", [
      {
        type: "tool_result",
        tool_use_id: "approval-call",
        content: [{ type: "text", text: '{"cancelled":true}' }],
      },
    ]),
  ];
  const completeRecords = [
    ...initialRecords,
    ...traceRecords,
    ...boundaryRecords,
    ...approvalRecords,
    record("continuation", "assistant", [{ type: "text", text: "After compaction continuation" }]),
  ];
  const restored = sessionStorage.getItem(storageKey) === "completed";
  let completed = $state(restored);
  let compacted = $state(restored);
  let conversations = $state<Conversation[]>([
    {
      id: "compaction-preview",
      title: "Fixture",
      createdAt: 1,
      updatedAt: 1,
      messages: checkpointRecordsToMessages(
        restored ? completeRecords : initialRecords,
        "preview-checkpoint",
      ),
    },
  ]);
  let messages = $derived(conversations[0].messages);
  const chatStreams = new ChatStreamState();
  chatStreams.streamingConversationIds = { "compaction-preview": !restored };
  chatStreams.itemsByConversation = {
    "compaction-preview": restored
      ? []
      : (checkpointRecordsToMessages(traceRecords, "preview-checkpoint")[0].items ?? []),
  };
  let items = $derived(chatStreams.itemsByConversation["compaction-preview"] ?? []);
  const controller = createCheckpointController({
    tauriAvailable: false,
    activeConvId: "compaction-preview",
    get conversations() {
      return conversations;
    },
    set conversations(value) {
      conversations = value;
    },
    chatStreams,
    pendingForkUserMessageIds: {},
    convTrees: {},
    loadingConversationIds: {},
    checkpointLoadErrors: {},
    loadedConvIds: new Set(),
    liveCheckpointRefreshVersions: new Map(),
    branchSelectionVersions: new Map(),
    activeBranchIds: {},
    liveCheckpointFlowProjections: {},
    liveFileChangesPerConv: {},
    fileChangesPerConv: {},
    pendingUserInputs: {},
    checkpointFlowPanelAutoOpenKey: null,
    rightSidebarPanel: "status",
    rightSidebarCollapseRequested: false,
    mergeDurableFollowUpSuggestions: () => {},
    restoreMermaidRenderRequests: () => {},
    refreshTaskUsagesForConversation: async () => {},
    findConversationLocation: () => null,
  });
  function checkpoint(
    records: CheckpointMessage[],
    id = "preview-checkpoint",
    parent: string | null = null,
  ): RenderableCheckpoint {
    return {
      meta: {
        thread_id: "compaction-preview",
        checkpoint_id: id,
        parent_checkpoint_id: parent,
        created_at: 1,
        metadata: "{}",
      },
      data: { format_version: 2, messages: records, file_change_ids: [], phase: "final_completed" },
    };
  }
  let scrollElement = $state<HTMLElement | null>(null);
  async function compact(doneFirst = true) {
    chatStreams.itemsByConversation = {
      "compaction-preview": appendCompactionProgress(items, "creating"),
    };
    if (doneFirst)
      chatStreams.itemsByConversation = {
        "compaction-preview": completeCompactionProgress(items),
      };
    chatStreams.itemsByConversation = {
      "compaction-preview": [
        ...items,
        ...checkpointRecordsToMessages(approvalRecords, "preview-checkpoint").flatMap(
          (message) => message.items ?? [],
        ),
      ],
    };
    await controller.hydrateConversation(
      "compaction-preview",
      [checkpoint([...initialRecords, ...traceRecords, ...boundaryRecords])],
      "preview-checkpoint",
      [],
      false,
      undefined,
      true,
    );
    chatStreams.itemsByConversation = {
      "compaction-preview": completeCompactionProgress(items),
    };
    chatStreams.itemsByConversation = {
      "compaction-preview": [...items, { type: "text", content: "After compaction continuation" }],
    };
    compacted = true;
  }
  async function finish() {
    chatStreams.streamingConversationIds = {};
    await controller.hydrateConversation(
      "compaction-preview",
      [
        checkpoint(completeRecords, "previous-completion"),
        checkpoint(completeRecords, "preview-checkpoint", "previous-completion"),
      ],
      "preview-checkpoint",
      [],
      false,
    );
    chatStreams.itemsByConversation = {};
    completed = true;
    sessionStorage.setItem(storageKey, "completed");
  }
</script>

<main
  class="compaction-transcript-preview bg-conversation-surface"
  data-locale={locale}
  bind:this={scrollElement}
>
  <nav aria-label="Compaction fixture">
    <button
      type="button"
      data-compaction-action="compact"
      disabled={compacted}
      onclick={() => compact()}>Compact</button
    >
    <button
      type="button"
      data-compaction-action="checkpoint-first"
      disabled={compacted}
      onclick={() => compact(false)}>Checkpoint first</button
    >
    <button
      type="button"
      data-compaction-action="finish"
      disabled={!compacted || completed}
      onclick={finish}>Finish</button
    >
  </nav>
  <MessageList
    {messages}
    {scrollElement}
    isStreaming={!completed}
    isAwaitingStreamOutput={false}
    currentStreamItems={items}
    currentStreamMessageId={completed ? null : responseId}
    activeConvId="compaction-preview"
    activeBranchId={null}
    debugMode={false}
    activeTree={undefined}
    paddingBottom={48}
    showApiKeyWarn={false}
    shikiTheme={theme === "dark" ? "github-dark" : "github-light"}
    mermaidConfig={mermaidConfigFor(theme === "dark")}
    newConversationGreeting={null}
    newConversationGreetingLoading={false}
    editable={false}
    onCommitEdit={() => {}}
    onAddQuote={() => {}}
    onReExecute={() => {}}
    onSwitchBranch={() => {}}
    onSubmitUserInput={() => {}}
    onCancelUserInput={() => {}}
  />
</main>

<style>
  main {
    height: 100vh;
    overflow: auto;
    padding: 24px;
  }
  nav {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }
  button {
    font: inherit;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 8px 16px;
    border-radius: var(--app-radius);
  }
</style>
