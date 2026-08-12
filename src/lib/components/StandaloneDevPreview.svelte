<script lang="ts">
  import { onMount } from "svelte";
  import { applyDocumentTheme } from "$lib/appTheme";

  import {
    CHECKPOINT_FLOW_PANEL_MAX_WIDTH,
    CHECKPOINT_FLOW_PANEL_MIN_WIDTH,
    clampCheckpointFlowPanelWidth,
  } from "$lib/checkpointFlowPanelSizing";
  import type { CheckpointFlow } from "$lib/checkpointFlow";
  import { previewParameterPrefix, type StandaloneDevPreview } from "$lib/devPreview";
  import { initI18n, t, type Locale } from "$lib/i18n";
  import { mermaidConfigFor } from "$lib/mermaidTheme";
  import { defaultPermissionProfile } from "$lib/config";
  import type {
    ApprovalMode,
    ChatAttachment,
    ChatMessage,
    PermissionProfile,
    ReasoningEffort,
    RecentWorkspace,
    WorkspaceContext,
    UserMessageContext,
  } from "$lib/types";

  import AgentBookReader, { type AgentBookTurn } from "$lib/components/AgentBookReader.svelte";
  import CheckpointFlowStatus from "$lib/components/CheckpointFlowStatus.svelte";
  import MessageInput, { type SlashCommand } from "$lib/components/MessageInput.svelte";
  import MessageList from "$lib/components/MessageList.svelte";
  import PermissionSettings from "$lib/components/PermissionSettings.svelte";
  import ReasoningEffortSelect from "$lib/components/ReasoningEffortSelect.svelte";
  import WorkspaceSwitcher from "$lib/components/WorkspaceSwitcher.svelte";

  let { preview }: { preview: StandaloneDevPreview } = $props();

  const query = new URLSearchParams(window.location.search);
  let prefix = $derived(previewParameterPrefix(preview));
  let explicitTheme = $derived(query.get(`${prefix}-theme`));
  let theme = $derived(
    explicitTheme === "dark" ? "dark" : explicitTheme === "light" ? "light" : "system",
  );
  let locale = $derived<Locale>(query.get(`${prefix}-locale`) === "en" ? "en" : "zh");

  let attachmentValue = $state("");
  let attachmentItems = $state<ChatAttachment[]>([
    { path: "preview://agentgym.txt", name: "agentgym.txt", kind: "document" },
    { path: "preview://sdk-docs.ts", name: "4.1 SDK文档.ts", kind: "document" },
    { path: "preview://interaction.md", name: "交互演示.md", kind: "document" },
    { path: "preview://guide.pdf", name: "preview-guide.pdf", kind: "document" },
    { path: "preview://archive.zip", name: "archive.zip", kind: "document" },
    {
      path: "preview://openagent.png",
      name: "image_bae3ff.png",
      kind: "image",
      previewUrl: "/app-icon.png",
    },
  ]);
  let commandValue = $state("");
  let commandAttachments = $state<ChatAttachment[]>([]);
  let pauseValue = $state("");
  let pauseAttachments = $state<ChatAttachment[]>([]);
  let quoteValue = $state("");
  let quoteContexts = $state<UserMessageContext[]>([]);
  let quoteFocusRequest = $state(0);
  let quoteMessagesElement = $state<HTMLElement | null>(null);
  let paused = $state(false);
  let checkpointValue = $state("");
  let checkpointAttachments = $state<ChatAttachment[]>([]);
  let checkpointApproval = $state<ApprovalMode>("auto");
  let reasoningEffort = $state<ReasoningEffort>("high");
  let permissionProfile = $state<PermissionProfile>(defaultPermissionProfile());
  let panelWidth = $state(320);
  let panelCollapsed = $state(false);
  let panelResizing = $state(false);
  let quoteMessages = $derived<ChatMessage[]>([
    {
      id: "preview-user",
      role: "user",
      content: locale === "zh" ? "总结一下这个设计。" : "Summarize this design.",
      timestamp: Date.now() - 2000,
    },
    {
      id: "preview-assistant",
      role: "assistant",
      content:
        locale === "zh"
          ? "选择这段回答中的任意文字，然后使用浮动操作把它添加到下一条消息。引用会作为结构化上下文保留。"
          : "Select any text in this answer, then use the floating action to add it to the next message. The excerpt remains structured context.",
      items: [
        {
          type: "text",
          content:
            locale === "zh"
              ? "选择这段回答中的任意文字，然后使用浮动操作把它添加到下一条消息。引用会作为结构化上下文保留。"
              : "Select any text in this answer, then use the floating action to add it to the next message. The excerpt remains structured context.",
        },
      ],
      timestamp: Date.now() - 1000,
    },
  ]);

  const slashCommands: SlashCommand[] = [
    {
      id: "compact",
      name: "compact",
      label: "/compact",
      description: "Compact context",
      run: () => {},
    },
    {
      id: "goal",
      name: "goal",
      label: "/goal",
      description: "Create a goal",
      insertText: "/goal",
      run: () => {},
    },
    {
      id: "graph",
      name: "graph",
      label: "/graph",
      description: "Create a graph",
      insertText: "/graph",
      run: () => {},
    },
  ];

  const workspace: WorkspaceContext = {
    path: "C:\\Projects\\Temp",
    git_branch: null,
    has_agent_dir: false,
    environment: { kind: "local" },
  };
  const recentWorkspaces: RecentWorkspace[] = [
    { name: "Temp", path: "C:\\Projects\\Temp" },
    { name: "openagent", path: "C:\\Projects\\openagent" },
    {
      name: "openagent-wsl",
      path: "\\\\wsl.localhost\\Ubuntu-24.04\\home\\developer\\Projects\\openagent",
    },
    { name: "documents", path: "C:\\Projects\\documents" },
    { name: "design-system", path: "C:\\Projects\\design-system" },
    { name: "agent-runtime", path: "C:\\Projects\\agent-runtime" },
    { name: "playground", path: "C:\\Projects\\playground" },
    { name: "research", path: "C:\\Projects\\research" },
    { name: "experiments", path: "C:\\Projects\\experiments" },
    { name: "archive", path: "D:\\Workspace Archive\\2026\\archive" },
  ];

  const checkpointFlow: CheckpointFlow =
    query.get("checkpoint-flow-preview-kind") === "goal"
      ? {
          kind: "goal",
          objective: "完成聊天界面的 Goal 状态面板",
          status: "running",
          iteration: 2,
          todos: [
            { id: "inspect", task: "读取 checkpoint 状态", status: "completed" },
            { id: "panel", task: "实现可拖拽、可收缩的右侧面板", status: "in_progress" },
            { id: "verify", task: "验证主题、语言和交互", status: "pending" },
          ],
        }
      : {
          kind: "graph",
          objective: "并行完成 Goal / Graph 状态可视化",
          status: "running",
          iteration: 1,
          nodes: [
            { id: "checkpoint", task: "整理并核对市场数据", dependsOn: [], status: "completed" },
            {
              id: "goal-panel",
              task: "汇总市场指数和行业表现",
              dependsOn: ["checkpoint"],
              status: "running",
            },
            {
              id: "graph-panel",
              task: "汇总热门板块与涨跌幅",
              dependsOn: ["checkpoint"],
              status: "running",
            },
            {
              id: "sector-analysis",
              task: "分析板块异动和可能驱动因素",
              dependsOn: ["checkpoint"],
              status: "running",
            },
            {
              id: "source-audit",
              task: "检查引用链接、时间与市场口径",
              dependsOn: ["checkpoint"],
              status: "running",
            },
            {
              id: "verification",
              task: "合并结果并生成结构化摘要",
              dependsOn: ["goal-panel", "graph-panel", "sector-analysis", "source-audit"],
              status: "blocked",
            },
          ],
        };
  if (query.has("checkpoint-flow-preview-empty") && checkpointFlow.kind === "graph") {
    checkpointFlow.nodes = [];
  }

  const bookTable = [
    "| Section | Status | Notes |",
    "| --- | --- | --- |",
    ...Array.from(
      { length: 18 },
      (_, index) => `| Row ${index + 1} | Complete | Row-level pagination fixture ${index + 1} |`,
    ),
  ].join("\n");
  const bookTurns: AgentBookTurn[] = [
    {
      key: "book-preview-one",
      items: [
        {
          type: "thinking",
          content:
            "Check the request, inspect the relevant files, and preserve the reply boundary.",
        },
        {
          type: "tool_call",
          name: "read_files",
          args: JSON.stringify({ paths: ["MessageList.svelte", "checkpointTree.ts"] }),
          result: "Read the transcript grouping and compaction boundary logic.",
        },
        { type: "compaction", stage: "summarizing" },
        { type: "compaction_boundary" },
        { type: "text", content: "Answer context immediately before the rendered artifact." },
        {
          type: "tool_call",
          name: "render_mermaid",
          args: JSON.stringify({
            title: "Visible render preview",
            source: "flowchart LR\n  Inspect --> Render --> Reply",
          }),
          result: '{"ok":true,"status":"rendered"}',
        },
        { type: "thinking", content: "Confirm the rendered artifact before summarizing." },
        {
          type: "text",
          content: `Inline code keeps theme contrast for \`pages/\`, \`components/\`, and \`README.md\`.\n\n${bookTable}\n\n${Array.from({ length: 28 }, (_, index) => `### ${index + 1}. 连贯阅读\n\n书籍模式会把一次完整的 Agent 输出保持在同一章中。正文从左栏自然流向右栏，超出当前展开页时继续到下一页。`).join("\n\n")}`,
        },
      ],
    },
    {
      key: "book-preview-two",
      items: [{ type: "text", content: "第二条 Agent 消息用于验证章节切换。" }],
    },
  ];

  async function loadAttachment(locator: string) {
    return /\.(?:txt|md|ts)$/i.test(locator)
      ? { kind: "text" as const, text: "接下来要做什么？\n\nOpenAgent attachment preview" }
      : { kind: "file" as const };
  }

  async function uploadAttachments(files: File[]): Promise<ChatAttachment[]> {
    return files.map((file) => ({
      path: `preview://${file.name}-${file.lastModified}`,
      name: file.name,
      kind: /\.(png|jpe?g|gif|webp)$/i.test(file.name) ? "image" : "document",
      previewUrl: /\.(png|jpe?g|gif|webp)$/i.test(file.name)
        ? URL.createObjectURL(file)
        : undefined,
    }));
  }

  function startPanelResize(event: PointerEvent): void {
    if (event.button !== 0 || panelCollapsed || panelResizing) return;
    event.preventDefault();
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    const panel = target.closest<HTMLElement>(".flow-panel");
    const container = panel?.parentElement;
    if (!panel || !container) return;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startWidth = panel.getBoundingClientRect().width;
    panelWidth = startWidth;
    target.setPointerCapture(pointerId);
    panelResizing = true;
    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      panelWidth = clampCheckpointFlowPanelWidth(
        startWidth + startX - moveEvent.clientX,
        container.clientWidth,
      );
    };
    const onEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      panelResizing = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  }

  onMount(() => {
    applyDocumentTheme(theme);
    void initI18n(locale);
    panelWidth = Math.min(
      CHECKPOINT_FLOW_PANEL_MAX_WIDTH,
      Math.max(CHECKPOINT_FLOW_PANEL_MIN_WIDTH, 320),
    );
  });
</script>

{#if preview === "book-mode"}
  <AgentBookReader
    turns={bookTurns}
    activeKey="book-preview-one"
    shikiTheme={theme === "dark" ? "github-dark" : "github-light"}
    mermaidConfig={mermaidConfigFor(theme === "dark")}
    fontSize={17}
    onClose={() => {}}
    onSubmitUserInput={() => {}}
    onCancelUserInput={() => {}}
  />
{:else if preview === "permission-settings"}
  <main class="permission-settings-preview-stage">
    <section class="permission-settings-preview-card">
      <header>
        <h1>{$t("executionPermissions")}</h1>
        <p>{$t("executionPermissionsDescription")}</p>
      </header>
      <PermissionSettings
        profile={permissionProfile}
        onProfileChange={(profile) => (permissionProfile = profile)}
      />
    </section>
  </main>
{:else if preview === "workspace-switcher"}
  <main class="workspace-switcher-preview-stage">
    <WorkspaceSwitcher
      {workspace}
      workspacePath={workspace.path ?? ""}
      {recentWorkspaces}
      tauriAvailable={true}
      browserModeNotice=""
      onPick={() => {}}
      onPickWsl={() => {}}
      onSelect={() => {}}
    />
  </main>
{:else if preview === "checkpoint-flow"}
  <main
    class="checkpoint-flow-preview-stage"
    class:checkpoint-flow-panel-collapsed={panelCollapsed}
  >
    <div class="conversation-input-fade" aria-hidden="true"></div>
    <div class="conversation-aurora" aria-hidden="true"></div>
    <section class="checkpoint-flow-preview-chat">
      <header>{$t(checkpointFlow.kind === "goal" ? "checkpointGoal" : "checkpointGraph")}</header>
      <div class="checkpoint-flow-preview-messages">
        <div class="checkpoint-flow-preview-user">
          Create a Goal / Graph and show its durable checkpoint state.
        </div>
        <div class="checkpoint-flow-preview-assistant">
          The flow is running. Its progress stays attached to the selected durable branch tip.
        </div>
      </div>
      <div class="checkpoint-flow-preview-composer">
        <MessageInput
          bind:value={checkpointValue}
          bind:attachments={checkpointAttachments}
          selectedModel="preview"
          modelOptions={[{ value: "preview", label: "gpt-5.6" }]}
          placeholder={$t("inputPlaceholder")}
          disabled={false}
          isStreaming={false}
          sendDisabled={!checkpointValue.trim()}
          sendTitle={$t("send")}
          showAttachments={false}
          showApprovalMode
          approvalMode={checkpointApproval}
          onApprovalModeChange={(mode) => (checkpointApproval = mode)}
          onSend={() => (checkpointValue = "")}
          onStop={() => {}}
        />
      </div>
    </section>
    <CheckpointFlowStatus
      flow={checkpointFlow}
      width={panelWidth}
      collapsed={panelCollapsed}
      resizing={panelResizing}
      onToggle={() => (panelCollapsed = !panelCollapsed)}
      onResizeStart={startPanelResize}
    />
  </main>
{:else if preview === "pause-control"}
  <main class="command-palette-preview-stage">
    <MessageInput
      bind:value={pauseValue}
      bind:attachments={pauseAttachments}
      selectedModel=""
      modelOptions={[]}
      placeholder={$t("inputPlaceholder")}
      disabled={false}
      isStreaming
      isPaused={paused}
      sendDisabled={!pauseValue.trim()}
      sendTitle={$t("send")}
      pauseTitle={$t("pauseOutput")}
      resumeTitle={$t("resumeOutput")}
      stopTitle={$t("stopOutput")}
      enableMentions={false}
      showAttachments={false}
      showModelSelector={false}
      onSend={() => (pauseValue = "")}
      onStop={() => {}}
      onPause={() => (paused = true)}
      onResume={() => (paused = false)}
    />
  </main>
{:else if preview === "quote-context"}
  <main class="quote-context-preview-stage">
    <section class="quote-context-preview-messages" bind:this={quoteMessagesElement}>
      <MessageList
        messages={quoteMessages}
        scrollElement={quoteMessagesElement}
        isStreaming={false}
        isAwaitingStreamOutput={false}
        currentStreamItems={[]}
        currentStreamMessageId={null}
        activeConvId="quote-preview"
        activeBranchId={null}
        debugMode={false}
        activeTree={undefined}
        paddingBottom={120}
        showApiKeyWarn={false}
        shikiTheme={theme === "dark" ? "github-dark" : "github-light"}
        mermaidConfig={mermaidConfigFor(theme === "dark")}
        newConversationMemoryPrompt={null}
        newConversationMemoryLoading={false}
        editable={false}
        onCommitEdit={() => {}}
        onAddQuote={(context) => {
          if (!quoteContexts.some((item) => item.text === context.text)) {
            quoteContexts = [...quoteContexts, context];
          }
          quoteFocusRequest += 1;
        }}
        onReExecute={() => {}}
        onSwitchBranch={() => {}}
        onSubmitUserInput={() => {}}
        onCancelUserInput={() => {}}
      />
    </section>
    <div class="quote-context-preview-composer">
      <MessageInput
        bind:value={quoteValue}
        attachments={[]}
        bind:contexts={quoteContexts}
        selectedModel="preview"
        modelOptions={[{ value: "preview", label: "gpt-5.6" }]}
        placeholder={$t("inputPlaceholder")}
        disabled={false}
        isStreaming={false}
        sendDisabled={!quoteValue.trim() && quoteContexts.length === 0}
        sendTitle={$t("send")}
        showAttachments={false}
        focusRequest={quoteFocusRequest}
        onSend={() => {}}
        onStop={() => {}}
      />
    </div>
  </main>
{:else if preview === "command-palette"}
  <main class="command-palette-preview-stage">
    <MessageInput
      bind:value={commandValue}
      bind:attachments={commandAttachments}
      selectedModel=""
      modelOptions={[]}
      placeholder={$t("inputPlaceholder")}
      disabled={false}
      isStreaming={false}
      sendDisabled={true}
      sendTitle={$t("send")}
      {slashCommands}
      enableMentions={false}
      showAttachments={false}
      showModelSelector={false}
      showStopButton={false}
      onSend={() => {}}
      onStop={() => {}}
    />
  </main>
{:else if preview === "reasoning-effort"}
  <main class="reasoning-effort-preview-stage">
    <section class="reasoning-effort-preview-card">
      <div class="reasoning-effort-preview-model">ChatGPT OAuth · gpt-5.6</div>
      <ReasoningEffortSelect
        value={reasoningEffort}
        contentSide="bottom"
        onValueChange={(value) => (reasoningEffort = value)}
      /><code>reasoning.effort = "{reasoningEffort}"</code>
    </section>
  </main>
{:else}
  <main class="attachment-composer-preview-stage">
    <MessageInput
      bind:value={attachmentValue}
      bind:attachments={attachmentItems}
      selectedModel=""
      modelOptions={[]}
      placeholder={$t("inputPlaceholder")}
      disabled={false}
      isStreaming={false}
      sendDisabled={false}
      sendTitle={$t("send")}
      slashCommands={[]}
      enableMentions={false}
      showAttachments
      showModelSelector={false}
      showStopButton={false}
      attachmentPreviewLoader={loadAttachment}
      onUploadAttachments={uploadAttachments}
      onSend={() => {}}
      onStop={() => {}}
    />
  </main>
{/if}

<style>
  .reasoning-effort-preview-stage,
  .permission-settings-preview-stage,
  .workspace-switcher-preview-stage,
  .command-palette-preview-stage,
  .attachment-composer-preview-stage {
    min-height: 100vh;
    box-sizing: border-box;
    background: var(--bg);
  }
  .quote-context-preview-stage {
    position: relative;
    display: flex;
    min-height: 100vh;
    flex-direction: column;
    background: var(--bg);
  }
  .quote-context-preview-messages {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
  }
  .quote-context-preview-composer {
    position: fixed;
    right: 32px;
    bottom: 24px;
    left: 32px;
    z-index: 20;
    width: min(900px, calc(100% - 64px));
    margin: 0 auto;
  }
  .reasoning-effort-preview-stage {
    display: grid;
    place-items: center;
    padding: 32px;
  }
  .permission-settings-preview-stage {
    display: flex;
    justify-content: center;
    padding: 48px 24px;
  }
  .permission-settings-preview-card {
    width: min(680px, 100%);
  }
  .permission-settings-preview-card header {
    margin: 0 4px 18px;
  }
  .permission-settings-preview-card h1,
  .permission-settings-preview-card p {
    margin: 0;
  }
  .permission-settings-preview-card h1 {
    color: var(--text);
    font-size: 20px;
    font-weight: 650;
    letter-spacing: -0.4px;
  }
  .permission-settings-preview-card p {
    margin-top: 6px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .workspace-switcher-preview-stage {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 96px 32px 32px;
  }
  .command-palette-preview-stage {
    display: flex;
    align-items: flex-end;
    padding: 16px 15px;
  }
  .attachment-composer-preview-stage {
    display: flex;
    align-items: flex-end;
    padding: 24px;
  }
  .attachment-composer-preview-stage :global(.input-wrapper) {
    width: min(760px, 100%);
    margin: 0 auto;
  }
  .checkpoint-flow-preview-stage {
    --flow-panel-collapsed-track-width: 30px;
    position: relative;
    isolation: isolate;
    display: flex;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: var(--bg);
  }
  .checkpoint-flow-preview-stage::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 3;
    background: color-mix(in srgb, var(--bg) 62%, transparent);
    backdrop-filter: blur(24px) saturate(1.28);
    pointer-events: none;
  }
  .checkpoint-flow-preview-chat {
    position: relative;
    z-index: 4;
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }
  .checkpoint-flow-preview-chat > header {
    height: 48px;
    display: flex;
    align-items: center;
    padding: 0 18px;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }
  .checkpoint-flow-preview-messages {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 22px;
    overflow: auto;
    padding: 48px clamp(24px, 8vw, 110px) 150px;
    color: var(--text);
    font-size: 14px;
  }
  .checkpoint-flow-preview-user {
    align-self: flex-end;
    max-width: 70%;
    padding: 10px 13px;
    border-radius: 14px 14px 4px 14px;
    background: var(--surface2);
  }
  .checkpoint-flow-preview-assistant {
    max-width: 72%;
    line-height: 1.6;
  }
  .checkpoint-flow-preview-composer {
    position: absolute;
    inset: auto 0 16px;
    padding: 0 18px;
  }
  .checkpoint-flow-preview-composer :global(.input-wrapper) {
    width: min(760px, 100%);
    margin: 0 auto;
  }
  .checkpoint-flow-preview-stage :global(.composer),
  .checkpoint-flow-preview-stage :global(.flow-panel) {
    background: var(--mica-surface);
    backdrop-filter: blur(24px) saturate(1.28);
  }
  .command-palette-preview-stage :global(.input-wrapper) {
    width: 100%;
  }
  .workspace-switcher-preview-stage :global(.workspace-btn) {
    background: var(--control-surface);
    box-shadow: var(--control-shadow);
  }
  .reasoning-effort-preview-card {
    width: min(420px, calc(100vw - 48px));
    display: grid;
    gap: 18px;
    padding: 24px;
    box-sizing: border-box;
    border-radius: 14px;
    background: var(--surface);
    box-shadow: var(--raised-shadow);
  }
  .reasoning-effort-preview-model {
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
  }
  .reasoning-effort-preview-card code {
    color: var(--text-muted);
    font-size: 12px;
  }
  .conversation-input-fade {
    position: absolute;
    inset: auto 0 0;
    z-index: 1;
    height: 168px;
    background: linear-gradient(to top, var(--bg) 0%, var(--bg) 60%, transparent 100%);
    pointer-events: none;
  }
  .conversation-aurora {
    position: absolute;
    left: 50%;
    top: calc(100% - 122px);
    width: min(calc(100% + 100px), 1064px);
    height: 210px;
    z-index: 2;
    background:
      radial-gradient(ellipse at 12% 62%, rgba(66, 133, 244, 0.34) 0 18%, transparent 43%),
      radial-gradient(ellipse at 61% 64%, rgba(234, 67, 53, 0.32) 0 17%, transparent 44%),
      radial-gradient(ellipse at 84% 54%, rgba(251, 188, 5, 0.32) 0 18%, transparent 44%);
    filter: blur(26px) saturate(1.35);
    opacity: 0.56;
    transform: translateX(-50%);
    pointer-events: none;
  }
  @media (max-width: 760px) {
    .checkpoint-flow-preview-stage {
      --flow-panel-collapsed-track-width: 26px;
    }
  }
</style>
