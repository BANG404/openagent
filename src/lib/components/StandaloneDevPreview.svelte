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
  import { NEW_CONVERSATION_GREETING } from "$lib/newConversation";
  import { defaultPermissionProfile, normalizeConfigShape } from "$lib/config";
  import { ComposerPreferences } from "$lib/composerPreferences.svelte";
  import type { WindowPlatform } from "$lib/windowPlatform";
  import type {
    AgentRole,
    AppConfig,
    ChatAttachment,
    ChatMessage,
    FileChange,
    PermissionProfile,
    ReasoningEffort,
    RecentWorkspace,
    StreamItem,
    TaskTokenUsage,
    UserInputRequest,
    WorkspaceContext,
    UserMessageContext,
  } from "$lib/types";

  import AgentBookReader, { type AgentBookTurn } from "$lib/components/AgentBookReader.svelte";
  import CheckpointFlowStatus from "$lib/components/CheckpointFlowStatus.svelte";
  import CheckpointFlowToggleButton from "$lib/components/CheckpointFlowToggleButton.svelte";
  import CompactionStatus from "$lib/components/CompactionStatus.svelte";
  import DesktopShellPreview from "$lib/components/DesktopShellPreview.svelte";
  import FollowUpSuggestions from "$lib/components/FollowUpSuggestions.svelte";
  import MessageInput, { type SlashCommand } from "$lib/components/MessageInput.svelte";
  import MessageDivider from "$lib/components/MessageDivider.svelte";
  import MessageList from "$lib/components/MessageList.svelte";
  import MediaSourcePreview from "$lib/components/MediaSourcePreview.svelte";
  import NewConversationContext from "$lib/components/NewConversationContext.svelte";
  import PermissionSettings from "$lib/components/PermissionSettings.svelte";
  import ReasoningEffortSelect from "$lib/components/ReasoningEffortSelect.svelte";
  import RoleSelector from "$lib/components/RoleSelector.svelte";
  import ToolCallCard from "$lib/components/ToolCallCard.svelte";
  import UserInputForm from "$lib/components/UserInputForm.svelte";
  import UserInputSummary from "$lib/components/UserInputSummary.svelte";
  import WorkspaceSwitcher from "$lib/components/WorkspaceSwitcher.svelte";

  let { preview }: { preview: StandaloneDevPreview } = $props();

  const query = new URLSearchParams(window.location.search);
  let prefix = $derived(previewParameterPrefix(preview));
  let explicitTheme = $derived(query.get(`${prefix}-theme`));
  let theme = $derived(
    explicitTheme === "dark" ? "dark" : explicitTheme === "light" ? "light" : "system",
  );
  let locale = $derived<Locale>(query.get(`${prefix}-locale`) === "en" ? "en" : "zh");
  let platformOverride = $derived<WindowPlatform | undefined>(
    ["linux", "macos", "windows"].includes(query.get(`${prefix}-platform`) ?? "")
      ? (query.get(`${prefix}-platform`) as WindowPlatform)
      : undefined,
  );
  let streamingAwaitingOutput = $derived(query.has(`${prefix}-awaiting-output`));

  let attachmentValue = $state("");
  let inputSurfaceValue = $state("");
  let inputSurfaceRole = $state("openagent");
  const inputSurfaceRoles: AgentRole[] = [
    {
      id: "reviewer",
      scope: "local",
      name: "Reviewer",
      description: "Review implementation changes",
      skill_ids: [],
      mcp_server_ids: [],
      usage_count: 2,
      created_at: 1,
      updated_at: 2,
      last_used_at: 2,
    },
    {
      id: "developer",
      scope: "local",
      name: "Developer",
      description: "Build and debug product features",
      skill_ids: [],
      mcp_server_ids: [],
      usage_count: 1,
      created_at: 1,
      updated_at: 2,
      last_used_at: 2,
    },
  ];
  const checkpointPanelChanges: FileChange[] = [
    {
      id: "preview-file-change",
      conv_id: "input-surfaces-preview",
      checkpoint_id: "preview-checkpoint",
      path: "src/lib/components/MessageInput.svelte",
      operation: "write",
      old_patch: "@@ -1 +1 @@\n-shared surface\n+old surface",
      old_content_z: null,
      new_content_z: null,
      new_hash: null,
      seq: 1,
      created_at: 1,
    },
    {
      id: "preview-file-change-two",
      conv_id: "input-surfaces-preview",
      checkpoint_id: "preview-checkpoint",
      path: "src/lib/components/ConversationSurface.svelte",
      operation: "write",
      old_patch:
        "@@ -238,2 +238,5 @@\n-          <FileChangeBanner changes={view.fileChanges} />\n+          <MessageInput\n+            bind:value={composerDraft.text}\n             disabled={!view.tauriAvailable}",
      old_content_z: null,
      new_content_z: null,
      new_hash: null,
      seq: 2,
      created_at: 2,
    },
    {
      id: "preview-file-change-three",
      conv_id: "input-surfaces-preview",
      checkpoint_id: "preview-checkpoint",
      path: "docs/conversation-details.md",
      operation: "write",
      old_patch: null,
      old_content_z: null,
      new_content_z: [40, 181, 47, 253, 32, 4, 33, 0, 0, 97, 10, 98, 10],
      new_hash: null,
      seq: 3,
      created_at: 3,
    },
  ];
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
  let suggestionValue = $state("");
  let selectedSuggestion = $state("");
  let pauseValue = $state("");
  let pauseAttachments = $state<ChatAttachment[]>([]);
  let quoteValue = $state("");
  let quoteContexts = $state<UserMessageContext[]>([]);
  let quoteFocusRequest = $state(0);
  let quoteMessagesElement = $state<HTMLElement | null>(null);
  let runtimeNoticeMessagesElement = $state<HTMLElement | null>(null);
  let mermaidFinalizationMessagesElement = $state<HTMLElement | null>(null);
  let toolDiffExpanded = $state(false);
  const toolDiffArgs = JSON.stringify({
    file_path: "src/generated/large-agent-edit.html",
    old_string: Array.from({ length: 2_000 }, (_, index) => `old line ${index}`).join("\n"),
    new_string: Array.from({ length: 2_000 }, (_, index) => `new line ${index}`).join("\n"),
  });
  let mermaidFinalized = $state(false);
  let streamingMessagesElement = $state<HTMLElement | null>(null);
  let streamingFollowTail = $state(true);
  let streamingText = $state(
    "Preparing the live response. [OpenAgent](https://github.com/BANG404/openagent)",
  );
  let paused = $state(false);
  const approvalPreviewRequests: UserInputRequest[] = [
    {
      request_id: "approval-preview-1",
      conv_id: "approval-queue-preview",
      kind: "tool_approval",
      fields: [],
    },
    {
      request_id: "approval-preview-2",
      conv_id: "approval-queue-preview",
      kind: "tool_approval",
      fields: [],
    },
    {
      request_id: "approval-preview-3",
      conv_id: "approval-queue-preview",
      kind: "tool_approval",
      fields: [],
    },
  ];
  let approvalPreviewStates = $state<Record<string, "pending" | "answered" | "cancelled">>(
    Object.fromEntries(approvalPreviewRequests.map((request) => [request.request_id, "pending"])),
  );
  const unansweredToolResult =
    "Tool 'write_file' was not approved because the user continued the conversation. It was not executed.";
  let toolStatusAskUserRequest = $derived<UserInputRequest>({
    request_id: "tool-status-ask-user",
    conv_id: "tool-status-preview",
    kind: "ask_user",
    title: locale === "zh" ? "补充执行方式" : "Choose an execution mode",
    fields: [
      {
        type: "select",
        name: "mode",
        label: locale === "zh" ? "执行方式" : "Execution mode",
        options: locale === "zh" ? ["安全模式", "快速模式"] : ["Safe", "Fast"],
      },
    ],
  });
  const toolStatusApprovalRequest: UserInputRequest = {
    request_id: "tool-status-approval",
    conv_id: "tool-status-preview",
    kind: "tool_approval",
    fields: [],
  };
  let checkpointValue = $state("");
  let checkpointAttachments = $state<ChatAttachment[]>([]);
  let checkpointConfig = $state<AppConfig>(
    normalizeConfigShape({ approval_mode: "auto" } as AppConfig),
  );
  const checkpointComposerPreferences = new ComposerPreferences({
    getConfig: () => checkpointConfig,
    setConfig: (next) => (checkpointConfig = next),
    loadSettings: async () => {},
    saveSettings: async (next) => structuredClone(next),
    tauriAvailable: false,
  });
  let reasoningEffort = $state<ReasoningEffort>("high");
  let permissionProfile = $state<PermissionProfile>(defaultPermissionProfile());
  let panelWidth = $state(320);
  let panelCollapsed = $state(true);
  let panelResizing = $state(false);
  let compactionPreviewItems = $derived<Extract<StreamItem, { type: "compaction" }>[]>([
    { type: "compaction", stage: "checking" },
    { type: "compaction", stage: "summarizing" },
    { type: "compaction", stage: "creating" },
    {
      type: "compaction",
      stage: "failed",
      error:
        locale === "zh"
          ? "无法保存压缩后的上下文，请稍后重试。"
          : "The compacted context could not be saved. Please try again.",
    },
  ]);
  let quoteMessages = $derived<ChatMessage[]>([
    {
      id: "preview-user",
      role: "user",
      content: locale === "zh" ? "总结一下这个设计。" : "Summarize this design.",
      items: [
        {
          type: "quote",
          context: {
            type: "quote",
            text: locale === "zh" ? "合外力" : "Net force",
            sourceMessageId: "preview-source",
          },
        },
      ],
      timestamp: Date.now() - 2000,
    },
    {
      id: "preview-assistant",
      role: "assistant",
      content:
        locale === "zh"
          ? "选择这段回答中的文字或公式，然后使用浮动操作把它添加到下一条消息。麦克斯韦方程为 $\\nabla \\cdot E = \\frac{\\rho}{\\varepsilon_0}$。引用会作为结构化上下文保留。"
          : "Select text or math in this answer, then use the floating action to add it to the next message. Maxwell's equation is $\\nabla \\cdot E = \\frac{\\rho}{\\varepsilon_0}$. The excerpt remains structured context.",
      items: [
        {
          type: "text",
          content:
            locale === "zh"
              ? "选择这段回答中的文字或公式，然后使用浮动操作把它添加到下一条消息。麦克斯韦方程为 $\\nabla \\cdot E = \\frac{\\rho}{\\varepsilon_0}$。引用会作为结构化上下文保留。"
              : "Select text or math in this answer, then use the floating action to add it to the next message. Maxwell's equation is $\\nabla \\cdot E = \\frac{\\rho}{\\varepsilon_0}$. The excerpt remains structured context.",
        },
      ],
      timestamp: Date.now() - 1000,
    },
  ]);
  let runtimeNoticeMessages = $derived<ChatMessage[]>([
    {
      id: "runtime-notice-user",
      role: "user",
      content:
        locale === "zh" ? "继续执行前先征求我的确认。" : "Ask for confirmation before continuing.",
      timestamp: Date.now() - 2_000,
    },
    {
      id: "runtime-notice-assistant",
      role: "assistant",
      content:
        locale === "zh"
          ? "我需要你的确认才能继续。"
          : "I need your confirmation before I can continue.",
      items: [
        {
          type: "thinking",
          content:
            locale === "zh"
              ? "已检查请求，并在需要授权的工具调用前暂停。"
              : "Checked the request and paused before the tool call that needs authorization.",
        },
        {
          type: "text",
          content:
            locale === "zh"
              ? "我需要你的确认才能继续。"
              : "I need your confirmation before I can continue.",
        },
        {
          type: "user_input",
          request: {
            request_id: "runtime-notice-confirmation",
            conv_id: "runtime-notice-preview",
            kind: "ask_user",
            title: locale === "zh" ? "确认下一步" : "Confirm the next step",
            fields: [
              {
                type: "confirm",
                name: "approved",
                label: locale === "zh" ? "允许继续执行" : "Allow the run to continue",
                default: false,
              },
            ],
            submit_label: locale === "zh" ? "确认并继续" : "Confirm and continue",
            cancel_label: locale === "zh" ? "取消" : "Cancel",
          },
          state: "pending",
        },
        {
          type: "runtime_notice",
          kind: "interrupted",
          reason: "The agent run was interrupted.",
        },
      ],
      timestamp: Date.now() - 1_000,
      turn: {
        id: "runtime-notice-assistant",
        input_message_id: "runtime-notice-user",
        response_message_id: "runtime-notice-assistant",
        status: "interrupted",
        started_at: Date.now() - 2_000,
      },
    },
  ]);
  let suggestionItems = $derived(
    locale === "zh"
      ? ["继续完善刚才的实现", "对比另一种方案的取舍", "检查还有哪些潜在风险"]
      : [
          "Continue refining the implementation",
          "Compare the tradeoffs with another approach",
          "Check for any remaining risks",
        ],
  );
  let suggestionMessages = $derived<ChatMessage[]>([
    {
      id: "suggestion-preview-previous-user",
      role: "user",
      content: locale === "zh" ? "先分析现有方案。" : "First analyze the existing approach.",
      timestamp: Date.now() - 4_000,
    },
    {
      id: "suggestion-preview-previous-assistant",
      role: "assistant",
      content:
        locale === "zh"
          ? "现有方案可以继续收敛。"
          : "The existing approach can be narrowed further.",
      items: [
        {
          type: "text",
          content:
            locale === "zh"
              ? "现有方案可以继续收敛。"
              : "The existing approach can be narrowed further.",
        },
      ],
      timestamp: Date.now() - 3_000,
    },
    {
      id: "suggestion-preview-user",
      role: "user",
      content:
        locale === "zh" ? "请给我一个简洁的实现方案。" : "Give me a concise implementation plan.",
      timestamp: Date.now() - 2_000,
    },
    {
      id: "suggestion-preview-turn",
      role: "assistant",
      content: "",
      items: [
        {
          type: "tool_call",
          name: "read_files",
          args: JSON.stringify({ paths: ["MessageList.svelte"] }),
          result: locale === "zh" ? "已检查消息分组。" : "Checked the message grouping.",
        },
      ],
      turn: {
        id: "suggestion-preview-turn",
        input_message_id: "suggestion-preview-user",
        response_message_id: "suggestion-preview-turn",
        status: "completed",
        started_at: Date.now() - 2_000,
        completed_at: Date.now() - 1_000,
        duration_ms: 1_000,
      },
      timestamp: Date.now() - 1_500,
    },
    {
      id: "suggestion-preview-assistant-final",
      role: "assistant",
      content:
        locale === "zh"
          ? "可以先收敛状态边界，再补充类型化事件和浏览器验证。"
          : "Start by narrowing the state boundary, then add typed events and browser verification.",
      items: [
        {
          type: "text",
          content:
            locale === "zh"
              ? "可以先收敛状态边界，再补充类型化事件和浏览器验证。"
              : "Start by narrowing the state boundary, then add typed events and browser verification.",
        },
      ],
      timestamp: Date.now() - 1_000,
    },
  ]);
  const cacheUsageMessages: ChatMessage[] = [
    {
      id: "cache-preview-user-hit",
      role: "user",
      content: "Show the cache utilization for this reply.",
      timestamp: Date.now() - 6_000,
    },
    {
      id: "cache-preview-assistant-hit",
      role: "assistant",
      content: "This completed turn reused most of its provider input.",
      items: [{ type: "text", content: "This completed turn reused most of its provider input." }],
      checkpointId: "cache-preview-hit",
      timestamp: Date.now() - 5_000,
      turn: {
        id: "cache-preview-turn-hit",
        input_message_id: "cache-preview-user-hit",
        response_message_id: "cache-preview-assistant-hit",
        status: "completed",
        started_at: Date.now() - 6_000,
        completed_at: Date.now() - 5_000,
        duration_ms: 1_000,
      },
    },
    {
      id: "cache-preview-user-zero",
      role: "user",
      content: "Show a separate cache rate for this turn.",
      timestamp: Date.now() - 3_000,
    },
    {
      id: "cache-preview-assistant-zero",
      role: "assistant",
      content: "This completed turn has its own provider usage.",
      items: [{ type: "text", content: "This completed turn has its own provider usage." }],
      checkpointId: "cache-preview-zero",
      timestamp: Date.now() - 2_000,
      turn: {
        id: "cache-preview-turn-zero",
        input_message_id: "cache-preview-user-zero",
        response_message_id: "cache-preview-assistant-zero",
        status: "completed",
        started_at: Date.now() - 3_000,
        completed_at: Date.now() - 2_000,
        duration_ms: 1_000,
      },
    },
    {
      id: "cache-preview-user-hidden",
      role: "user",
      content: "Do not show cache metadata when no hit rate is available.",
      timestamp: Date.now() - 1_500,
    },
    {
      id: "cache-preview-assistant-hidden",
      role: "assistant",
      content: "This completed turn has no displayable cache rate.",
      items: [{ type: "text", content: "This completed turn has no displayable cache rate." }],
      checkpointId: "cache-preview-hidden",
      timestamp: Date.now() - 1_000,
      turn: {
        id: "cache-preview-turn-hidden",
        input_message_id: "cache-preview-user-hidden",
        response_message_id: "cache-preview-assistant-hidden",
        status: "completed",
        started_at: Date.now() - 1_500,
        completed_at: Date.now() - 1_000,
        duration_ms: 500,
      },
    },
  ];
  const cacheUsageByCheckpoint: Record<string, TaskTokenUsage[]> = {
    "cache-preview-hit": [
      {
        input_tokens: 10,
        output_tokens: 10,
        total_tokens: 110,
        cached_input_tokens: 70,
        cache_creation_input_tokens: 20,
        tool_use_prompt_tokens: 0,
        reasoning_tokens: 0,
      },
    ],
    "cache-preview-zero": [
      {
        input_tokens: 40,
        output_tokens: 10,
        total_tokens: 110,
        cached_input_tokens: 60,
        cache_creation_input_tokens: 0,
        tool_use_prompt_tokens: 0,
        reasoning_tokens: 0,
      },
    ],
    "cache-preview-hidden": [
      {
        input_tokens: 100,
        output_tokens: 10,
        total_tokens: 110,
        cached_input_tokens: 0,
        cache_creation_input_tokens: 0,
        tool_use_prompt_tokens: 0,
        reasoning_tokens: 0,
      },
    ],
  };
  const streamingMessages: ChatMessage[] = [];
  const fencedCodePreview = [
    "A language-tagged fence keeps its compact header:",
    "",
    "```svelte",
    '<script lang="ts">',
    "  let count = 0;",
    "<" + "/script>",
    "```",
    "",
    "A fence without a language keeps the same surface without an empty header:",
    "",
    "```",
    "import {",
    "  Select,",
    "  SelectContent,",
    "  SelectGroup,",
    "  SelectItem,",
    "  SelectTrigger,",
    "  SelectValue,",
    "} from '@/components/ui/select'",
    "```",
  ].join("\n");
  for (let index = 0; index < 18; index += 1) {
    const content =
      index === 17
        ? fencedCodePreview
        : `Completed answer ${index + 1}. ${"Fully mounted turn content. ".repeat(8)}`;
    streamingMessages.push(
      {
        id: `streaming-preview-user-${index}`,
        role: "user",
        content: `Turn ${index + 1}: keep this transcript long enough to exercise scrolling.`,
        timestamp: Date.now() - (36 - index * 2) * 1000,
      },
      {
        id: `streaming-preview-assistant-${index}`,
        role: "assistant",
        content,
        items: [{ type: "text", content }],
        timestamp: Date.now() - (35 - index * 2) * 1000,
      },
    );
  }
  let streamingItems = $derived<StreamItem[]>([
    { type: "text", content: streamingText },
    ...(streamingAwaitingOutput
      ? [
          {
            type: "tool_call" as const,
            name: "read_file",
            args: JSON.stringify({ path: "src/routes/+page.svelte" }),
            result: "Loaded the requested file.",
          },
        ]
      : []),
  ]);
  let mermaidFinalizationItems = $derived<StreamItem[]>([
    {
      type: "thinking",
      content:
        locale === "zh"
          ? "先检查依赖关系，再生成图表。"
          : "Inspect the dependencies before rendering the diagram.",
    },
    {
      type: "text",
      content: locale === "zh" ? "下面是最终关系图。" : "Here is the final relationship diagram.",
    },
    {
      type: "tool_call",
      name: "render_mermaid",
      args: JSON.stringify({
        title: locale === "zh" ? "流式收敛" : "Streaming finalization",
        source:
          "flowchart LR\n  Stream[Live stream] --> Fold[Process fold]\n  Fold --> Diagram[Rendered diagram]",
      }),
      result: '{"ok":true,"status":"rendered"}',
    },
    {
      type: "text",
      content:
        locale === "zh"
          ? "完成后，图表必须继续显示在折叠的工作过程之外。"
          : "After completion, the diagram must remain visible outside the collapsed process.",
    },
  ]);
  let mermaidFinalizationMessages = $derived<ChatMessage[]>([
    {
      id: "mermaid-finalization-user",
      role: "user",
      content: locale === "zh" ? "渲染一个 Mermaid 流程图。" : "Render a Mermaid flowchart.",
      timestamp: Date.now() - 2_000,
    },
    ...(mermaidFinalized
      ? [
          {
            id: "mermaid-finalization-assistant",
            role: "assistant" as const,
            content: "",
            items: mermaidFinalizationItems,
            timestamp: Date.now() - 1_000,
            turn: {
              id: "mermaid-finalization-turn",
              input_message_id: "mermaid-finalization-user",
              response_message_id: "mermaid-finalization-assistant",
              status: "completed" as const,
              started_at: Date.now() - 2_000,
              completed_at: Date.now() - 1_000,
              duration_ms: 1_000,
            },
          },
        ]
      : []),
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
      status: "completed",
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
        {
          type: "tool_call",
          name: "search_symbols",
          args: JSON.stringify({ query: "ToolCallGroup" }),
          result: "Found the grouped tool-call renderer.",
        },
        {
          type: "tool_call",
          name: "inspect_styles",
          args: JSON.stringify({ selector: ".tool-call-group" }),
          result: "Confirmed the group wrapper stays transparent.",
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
      status: "completed",
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
    if (preview !== "streaming-transcript") return;
    if (streamingAwaitingOutput) return;
    let chunk = 0;
    const timer = window.setInterval(() => {
      chunk += 1;
      const separator = chunk % 12 === 0 ? "\n\n" : " ";
      streamingText += `${separator}streamed chunk ${chunk}`;
      if (chunk >= 480) window.clearInterval(timer);
    }, 55);
    return () => window.clearInterval(timer);
  });

  function updateStreamingFollowTail() {
    if (!streamingMessagesElement) return;
    streamingFollowTail =
      streamingMessagesElement.scrollHeight -
        streamingMessagesElement.scrollTop -
        streamingMessagesElement.clientHeight <=
      24;
  }

  function resolvePreviewApproval(requestId: string, approved: boolean) {
    if (approvalPreviewStates[requestId] !== "pending") return;
    approvalPreviewStates = {
      ...approvalPreviewStates,
      [requestId]: approved ? "answered" : "cancelled",
    };
  }
</script>

{#if preview === "desktop-shell"}
  <DesktopShellPreview />
{:else if preview === "approval-queue"}
  <main class="approval-queue-preview-stage">
    <section class="approval-queue-preview-stack" aria-label="Approval queue preview">
      {#each approvalPreviewRequests as request, index (request.request_id)}
        <ToolCallCard
          name={index === 0 ? "terminal_exec" : index === 1 ? "write_file" : "dispatch_role"}
          args={JSON.stringify({ request: index + 1 }, null, 2)}
          result={undefined}
          expanded={false}
          argHint={`request ${index + 1}`}
          approval={{ request, state: approvalPreviewStates[request.request_id] }}
          onApprove={(requestId) => resolvePreviewApproval(requestId, true)}
          onDeny={(requestId) => resolvePreviewApproval(requestId, false)}
          onToggle={() => {}}
        />
      {/each}
    </section>
  </main>
{:else if preview === "tool-diff"}
  <main class="tool-diff-preview-stage">
    <section class="tool-diff-preview-stack" aria-label="Large Agent edit preview">
      <ToolCallCard
        name="edit_file"
        args={toolDiffArgs}
        result="updated"
        expanded={toolDiffExpanded}
        argHint="large-agent-edit.html"
        onToggle={() => (toolDiffExpanded = !toolDiffExpanded)}
      />
    </section>
  </main>
{:else if preview === "tool-status"}
  <main class="tool-status-preview-stage">
    <section class="tool-status-preview-stack" aria-label="Tool result status preview">
      <ToolCallCard
        name="terminal_exec"
        args={JSON.stringify({ command: "bun run check" }, null, 2)}
        result={undefined}
        expanded={false}
        argHint="bun run check"
        approval={{ request: toolStatusApprovalRequest, state: "pending" }}
        onApprove={() => {}}
        onDeny={() => {}}
        onToggle={() => {}}
      />
      <ToolCallCard
        name="read_file"
        args={JSON.stringify({ path: "src/lib/types.ts" }, null, 2)}
        result="42 lines"
        expanded={false}
        argHint="src/lib/types.ts"
        onToggle={() => {}}
      />
      <ToolCallCard
        name="write_file"
        args={JSON.stringify({ path: "notes.md" }, null, 2)}
        result={unansweredToolResult}
        expanded={false}
        argHint="notes.md"
        onToggle={() => {}}
      />
      <ToolCallCard
        name="hidden_failed_tool"
        args={"{}"}
        result="failed to parse tool arguments: missing required field"
        expanded={false}
        argHint="hidden"
        onToggle={() => {}}
      />
      <UserInputForm request={toolStatusAskUserRequest} onSubmit={() => {}} onCancel={() => {}} />
      <UserInputSummary
        request={toolStatusAskUserRequest}
        state="unanswered"
        response={unansweredToolResult}
      />
    </section>
  </main>
{:else if preview === "input-surfaces"}
  <main class="input-surfaces-preview-stage">
    <section class="input-surfaces-preview-stack">
      <MessageInput
        bind:value={inputSurfaceValue}
        attachments={[]}
        selectedModel="preview"
        modelOptions={[{ value: "preview", label: "gpt-5.6" }]}
        placeholder={$t("inputPlaceholder")}
        disabled={false}
        isStreaming={false}
        sendDisabled={!inputSurfaceValue.trim()}
        sendTitle={$t("send")}
        showAttachments={false}
        showWorkspaceSwitcher
        {workspace}
        workspacePath={workspace.path ?? ""}
        {recentWorkspaces}
        workspaceTauriAvailable
        workspaceBrowserModeNotice=""
        onPickWorkspace={() => {}}
        onPickWslWorkspace={() => {}}
        onSelectWorkspace={() => {}}
        onSend={() => {}}
        onStop={() => {}}
      />
      <div class="input-surfaces-role-anchor">
        <RoleSelector
          value={inputSurfaceRole}
          roles={inputSurfaceRoles}
          onChange={(value) => (inputSurfaceRole = value)}
        />
      </div>
    </section>
  </main>
{:else if preview === "book-mode"}
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
{:else if preview === "media-sources"}
  <MediaSourcePreview {locale} />
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
      {platformOverride}
    />
  </main>
{:else if preview === "checkpoint-flow"}
  <main class="checkpoint-flow-preview-stage">
    <div class="conversation-input-fade" aria-hidden="true"></div>
    <header class="checkpoint-flow-preview-titlebar">
      <span>{$t("conversationDetails")}</span>
      <CheckpointFlowToggleButton
        collapsed={panelCollapsed}
        onToggle={() => (panelCollapsed = !panelCollapsed)}
      />
    </header>
    <section class="checkpoint-flow-preview-chat">
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
          approvalMode={checkpointConfig.approval_mode}
          onApprovalModeChange={checkpointComposerPreferences.handleApprovalModeChange}
          onSend={() => (checkpointValue = "")}
          onStop={() => {}}
        />
      </div>
    </section>
    <CheckpointFlowStatus
      flow={query.has("checkpoint-flow-preview-files-only") ? null : checkpointFlow}
      changes={checkpointPanelChanges}
      width={panelWidth}
      collapsed={panelCollapsed}
      resizing={panelResizing}
      onRevert={async () => {}}
      onResizeStart={startPanelResize}
    />
  </main>
{:else if preview === "follow-up-suggestions"}
  <main class="follow-up-suggestions-preview-stage">
    <section class="suggestions-new-conversation">
      <NewConversationContext
        prompt={NEW_CONVERSATION_GREETING}
        loading={false}
        showApiKeyWarn={false}
        placement="stack"
      />
      <div class="suggestions-new-conversation-composer">
        <MessageInput
          bind:value={suggestionValue}
          attachments={[]}
          selectedModel="preview"
          modelOptions={[{ value: "preview", label: "gpt-5.6" }]}
          placeholder={$t("inputPlaceholder")}
          disabled={false}
          isStreaming={false}
          sendDisabled={!suggestionValue.trim()}
          sendTitle={$t("send")}
          showAttachments={false}
          onSend={() => {}}
          onStop={() => {}}
        />
      </div>
      <FollowUpSuggestions
        suggestions={suggestionItems}
        onSelect={(suggestion) => {
          selectedSuggestion = suggestion;
        }}
        variant="new-conversation"
      />
    </section>
    <section class="suggestions-turn-preview">
      <MessageList
        messages={suggestionMessages}
        scrollElement={null}
        isStreaming={false}
        isAwaitingStreamOutput={false}
        currentStreamItems={[]}
        currentStreamMessageId={null}
        activeConvId="suggestion-preview"
        activeBranchId={null}
        debugMode={false}
        activeTree={undefined}
        paddingBottom={24}
        showApiKeyWarn={false}
        shikiTheme={theme === "dark" ? "github-dark" : "github-light"}
        mermaidConfig={mermaidConfigFor(theme === "dark")}
        newConversationGreeting={null}
        newConversationGreetingLoading={false}
        followUpSuggestionsByMessageId={{
          "suggestion-preview-previous-assistant": suggestionItems,
          "suggestion-preview-turn": suggestionItems,
        }}
        editable={false}
        onCommitEdit={() => {}}
        onAddQuote={() => {}}
        onReExecute={() => {}}
        onSwitchBranch={() => {}}
        onSubmitUserInput={() => {}}
        onCancelUserInput={() => {}}
        onSelectSuggestion={(suggestion) => {
          selectedSuggestion = suggestion;
        }}
      />
    </section>
    <output>{selectedSuggestion || $t("followUpSuggestions")}</output>
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
        newConversationGreeting={null}
        newConversationGreetingLoading={false}
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
{:else if preview === "runtime-notice"}
  <main class="runtime-notice-preview-stage" bind:this={runtimeNoticeMessagesElement}>
    <section class="runtime-notice-preview-messages">
      <MessageList
        messages={runtimeNoticeMessages}
        scrollElement={runtimeNoticeMessagesElement}
        isStreaming={false}
        isAwaitingStreamOutput={false}
        currentStreamItems={[]}
        currentStreamMessageId={null}
        activeConvId="runtime-notice-preview"
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
    </section>
  </main>
{:else if preview === "compaction-status"}
  <main class="compaction-status-preview-stage">
    <section class="compaction-status-preview-list" aria-label={$t("contextCompaction")}>
      {#each compactionPreviewItems as item (item.stage)}
        <CompactionStatus {item} itemKey={`compaction-preview-${item.stage}`} />
      {/each}
      <MessageDivider
        title={$t("compactionCompleted")}
        streamItemKey="compaction-preview-completed"
      />
    </section>
  </main>
{:else if preview === "cache-usage"}
  <main class="cache-usage-preview-stage">
    <section class="cache-usage-preview-messages">
      <MessageList
        messages={cacheUsageMessages}
        scrollElement={null}
        isStreaming={false}
        isAwaitingStreamOutput={false}
        currentStreamItems={[]}
        currentStreamMessageId={null}
        activeConvId="cache-usage-preview"
        activeBranchId={null}
        debugMode={false}
        taskUsagesByCheckpointId={cacheUsageByCheckpoint}
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
    </section>
  </main>
{:else if preview === "streaming-transcript"}
  <main
    class="streaming-transcript-preview-stage"
    class:following-tail={streamingFollowTail}
    bind:this={streamingMessagesElement}
    onscroll={updateStreamingFollowTail}
    aria-label="Streaming transcript preview"
  >
    <MessageList
      messages={streamingMessages}
      scrollElement={streamingMessagesElement}
      isStreaming={true}
      isAwaitingStreamOutput={streamingAwaitingOutput}
      currentStreamItems={streamingItems}
      currentStreamMessageId="streaming-preview-live-turn"
      activeConvId="streaming-preview"
      activeBranchId={null}
      debugMode={false}
      activeTree={undefined}
      paddingBottom={48}
      showApiKeyWarn={false}
      shikiTheme={theme === "dark" ? "github-dark" : "github-light"}
      mermaidConfig={mermaidConfigFor(theme === "dark")}
      followTail={streamingFollowTail}
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
{:else if preview === "mermaid-finalization"}
  <main class="mermaid-finalization-preview-stage" bind:this={mermaidFinalizationMessagesElement}>
    <button
      type="button"
      class="mermaid-finalization-control"
      disabled={mermaidFinalized}
      onclick={() => (mermaidFinalized = true)}
    >
      {mermaidFinalized
        ? locale === "zh"
          ? "已完成并折叠"
          : "Completed and folded"
        : locale === "zh"
          ? "完成流式响应"
          : "Finalize stream"}
    </button>
    <MessageList
      messages={mermaidFinalizationMessages}
      scrollElement={mermaidFinalizationMessagesElement}
      isStreaming={!mermaidFinalized}
      isAwaitingStreamOutput={false}
      currentStreamItems={mermaidFinalizationItems}
      currentStreamMessageId="mermaid-finalization-assistant"
      activeConvId="mermaid-finalization-preview"
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
  .approval-queue-preview-stage,
  .tool-status-preview-stage,
  .tool-diff-preview-stage,
  .reasoning-effort-preview-stage,
  .input-surfaces-preview-stage,
  .permission-settings-preview-stage,
  .workspace-switcher-preview-stage,
  .command-palette-preview-stage,
  .follow-up-suggestions-preview-stage,
  .runtime-notice-preview-stage,
  .compaction-status-preview-stage,
  .attachment-composer-preview-stage {
    min-height: 100vh;
    box-sizing: border-box;
    background: var(--bg);
  }
  .approval-queue-preview-stage {
    display: grid;
    place-items: start center;
    padding: 48px 24px;
  }
  .approval-queue-preview-stack,
  .tool-status-preview-stack,
  .tool-diff-preview-stack {
    display: grid;
    width: min(720px, 100%);
    gap: 12px;
  }
  .tool-status-preview-stage {
    display: grid;
    place-items: start center;
    padding: 48px 24px;
  }
  .tool-diff-preview-stage {
    display: grid;
    place-items: start center;
    padding: 48px 24px;
  }
  .input-surfaces-preview-stage {
    display: grid;
    place-items: start center;
    padding: 48px 24px;
  }
  .input-surfaces-preview-stack {
    display: grid;
    width: min(720px, 100%);
    gap: 24px;
  }
  .input-surfaces-role-anchor {
    width: 240px;
  }
  .follow-up-suggestions-preview-stage {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
    padding: 36px;
  }
  .suggestions-new-conversation,
  .suggestions-turn-preview {
    min-width: 0;
    padding: 28px;
    border: 1px solid var(--mica-border);
    border-radius: 18px;
    background: var(--mica-surface);
    box-shadow: var(--mica-shadow);
    backdrop-filter: blur(24px) saturate(1.2);
  }
  .suggestions-new-conversation {
    align-self: start;
  }
  .suggestions-new-conversation-composer {
    box-sizing: border-box;
    width: 100%;
    padding: 0 32px;
  }
  .suggestions-turn-preview {
    min-height: 420px;
    overflow-y: auto;
  }
  .follow-up-suggestions-preview-stage output {
    position: fixed;
    right: 20px;
    bottom: 16px;
    max-width: calc(100vw - 40px);
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--control-surface);
    color: var(--text-muted);
    font-size: 12px;
    box-shadow: var(--raised-shadow);
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
  .runtime-notice-preview-stage {
    height: 100vh;
    overflow-y: auto;
    padding: 24px;
  }
  .runtime-notice-preview-messages {
    width: min(900px, 100%);
    margin: 0 auto;
  }
  .compaction-status-preview-stage {
    display: grid;
    min-height: 100vh;
    place-items: center;
    padding: 24px;
  }
  .compaction-status-preview-list {
    width: min(900px, 100%);
  }
  .cache-usage-preview-stage {
    min-height: 100vh;
    padding: 24px;
    background: var(--bg);
  }
  .cache-usage-preview-messages {
    width: min(900px, 100%);
    margin: 0 auto;
  }
  .streaming-transcript-preview-stage {
    height: 100vh;
    overflow-x: clip;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    background: var(--bg);
    scrollbar-gutter: stable;
  }
  .mermaid-finalization-preview-stage {
    position: relative;
    height: 100vh;
    overflow-x: clip;
    overflow-y: auto;
    padding-top: 52px;
    background: var(--bg);
    scrollbar-gutter: stable;
  }
  .mermaid-finalization-control {
    position: fixed;
    z-index: 30;
    top: 12px;
    left: 50%;
    min-height: 30px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--surface);
    color: var(--text);
    transform: translateX(-50%);
    cursor: pointer;
  }
  .mermaid-finalization-control:disabled {
    color: var(--text-muted);
    cursor: default;
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
    position: relative;
    isolation: isolate;
    display: flex;
    width: 100vw;
    height: 100vh;
    box-sizing: border-box;
    overflow: hidden;
    padding: 56px 8px 8px;
    background: var(--bg);
  }
  .checkpoint-flow-preview-chat {
    position: relative;
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface);
  }
  .checkpoint-flow-preview-titlebar {
    position: absolute;
    inset: 0 0 auto;
    z-index: 14;
    height: 48px;
    display: flex;
    align-items: center;
    padding: 0 18px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--border);
    background: var(--app-chrome-bg);
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }
  .checkpoint-flow-preview-titlebar span {
    flex: 1;
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
  .checkpoint-flow-preview-stage :global(.composer) {
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
  @media (max-width: 760px) {
    .follow-up-suggestions-preview-stage {
      grid-template-columns: 1fr;
      padding: 20px;
    }
  }
</style>
