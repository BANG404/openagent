import type {
  AppConfig,
  ApprovalMode,
  FetchConfig,
  HtmlPreviewConfig,
  PermissionProfile,
  ReasoningEffort,
  WebSearchConfig,
} from "./types";
import { normalizeQuickChatShortcut } from "./quickChatShortcut";

function defaultWebSearch(): WebSearchConfig {
  return {
    provider: "brave",
    brave_api_key: "",
    tavily_api_key: "",
    searxng_base_url: "",
  };
}

function defaultHtmlPreview(): HtmlPreviewConfig {
  return {
    fixed_height: 480,
  };
}

function defaultFetch(): FetchConfig {
  return {
    page_size: 12_000,
  };
}

export function defaultPermissionProfile(): PermissionProfile {
  return {
    enforcement: "managed",
    file_system: {
      entries: [
        { path: { kind: "host_root" }, access: "read" },
        { path: { kind: "workspace" }, access: "write" },
      ],
    },
    network: "restricted",
  };
}

function normalizePermissionProfile(profile: PermissionProfile | undefined): PermissionProfile {
  if (!profile) return defaultPermissionProfile();
  if (profile.enforcement === "disabled") return { enforcement: "disabled" };
  if (profile.enforcement === "managed") {
    return {
      enforcement: "managed",
      file_system: {
        entries: profile.file_system?.entries ?? [],
      },
      network: profile.network ?? "restricted",
    };
  }
  return defaultPermissionProfile();
}

const reasoningEfforts = new Set<ReasoningEffort>(["low", "medium", "high", "xhigh", "max"]);

export function normalizeConfigShape(input: AppConfig): AppConfig {
  const requestedMaxTurns = Number(input.agent_max_turns);
  const agentMaxTurns = Number.isFinite(requestedMaxTurns)
    ? Math.min(1000, Math.max(1, Math.floor(requestedMaxTurns)))
    : 10;
  const requestedCompactionThreshold = Number(input.context_compaction_threshold);
  const contextCompactionThreshold = Number.isFinite(requestedCompactionThreshold)
    ? Math.min(1_000_000, Math.max(1_000, Math.floor(requestedCompactionThreshold)))
    : 200_000;
  const requestedRetryCount = Number(input.model_retry?.retry_count);
  const retryCount = Number.isFinite(requestedRetryCount)
    ? Math.min(10, Math.max(0, Math.floor(requestedRetryCount)))
    : 3;
  const requestedRetryDelayMs = Number(input.model_retry?.retry_delay_ms);
  const retryDelayMs = Number.isFinite(requestedRetryDelayMs)
    ? Math.min(60_000, Math.max(0, Math.floor(requestedRetryDelayMs)))
    : 30_000;
  const providers = (input.providers ?? []).map((provider) => {
    const configuredModels = new Set(provider.models ?? []);
    const model_context_compaction_thresholds = Object.fromEntries(
      Object.entries(provider.model_context_compaction_thresholds ?? {})
        .filter(([model]) => configuredModels.has(model))
        .filter(([, rawThreshold]) => Number.isFinite(Number(rawThreshold)))
        .map(([model, rawThreshold]) => {
          const threshold = Number(rawThreshold);
          return [model, Math.min(1_000_000, Math.max(1_000, Math.floor(threshold)))];
        }),
    );
    const model_reasoning_efforts = Object.fromEntries(
      Object.entries(provider.model_reasoning_efforts ?? {}).filter(
        ([model, effort]) =>
          configuredModels.has(model) && reasoningEfforts.has(effort as ReasoningEffort),
      ),
    ) as Record<string, ReasoningEffort>;
    const model_reasoning_effort_enabled = Object.fromEntries(
      Object.entries(provider.model_reasoning_effort_enabled ?? {}).filter(
        ([model, enabled]) => configuredModels.has(model) && enabled === true,
      ),
    ) as Record<string, boolean>;
    return {
      ...provider,
      models: provider.models ?? [],
      model_context_compaction_thresholds,
      model_reasoning_efforts,
      model_reasoning_effort_enabled,
    };
  });
  const defaults = input.defaults ?? {
    chat_model: { provider_id: "", model: "" },
    flash_model: { provider_id: "", model: "" },
  };

  const mcp = {
    servers: (input.mcp?.servers ?? []).map((s) => {
      const defaults = {
        transport: "http" as const,
        url: "",
        bearer_token: "",
        headers: {} as Record<string, string>,
        command: "",
        args: [] as string[],
        env: {} as Record<string, string>,
        cwd: "",
      };
      return { ...defaults, ...s };
    }),
  };

  const web_search: WebSearchConfig = { ...defaultWebSearch(), ...(input.web_search ?? {}) };
  const requestedHtmlHeight = Number(input.html_preview?.fixed_height);
  const html_preview: HtmlPreviewConfig = {
    ...defaultHtmlPreview(),
    ...(input.html_preview ?? {}),
    fixed_height: Number.isFinite(requestedHtmlHeight)
      ? Math.min(1200, Math.max(160, Math.floor(requestedHtmlHeight)))
      : 480,
  };
  const requestedFetchPageSize = Number(input.fetch?.page_size);
  const fetch: FetchConfig = {
    ...defaultFetch(),
    ...(input.fetch ?? {}),
    page_size: Number.isFinite(requestedFetchPageSize)
      ? Math.min(50_000, Math.max(1_000, Math.floor(requestedFetchPageSize)))
      : 12_000,
  };
  const approval_mode: ApprovalMode = ["manual", "auto", "off"].includes(input.approval_mode)
    ? input.approval_mode
    : "off";
  const permission_profile = normalizePermissionProfile(input.permission_profile);
  const requestedDoubleColumnMinWidth = Number(input.message_double_column_min_width);
  const messageDoubleColumnMinWidth = Number.isFinite(requestedDoubleColumnMinWidth)
    ? Math.min(2400, Math.max(960, Math.floor(requestedDoubleColumnMinWidth)))
    : 1200;
  const requestedBookModeFontSize = Number(input.book_mode_font_size);
  const bookModeFontSize = Number.isFinite(requestedBookModeFontSize)
    ? Math.min(24, Math.max(14, Math.floor(requestedBookModeFontSize)))
    : 17;
  const flash_agents = {
    title: {
      enabled: input.flash_agents?.title?.enabled ?? true,
      prompt: input.flash_agents?.title?.prompt ?? "",
    },
    memory: {
      enabled: input.flash_agents?.memory?.enabled ?? true,
      prompt: input.flash_agents?.memory?.prompt ?? "",
    },
    skill_category: {
      enabled: input.flash_agents?.skill_category?.enabled ?? true,
      prompt: input.flash_agents?.skill_category?.prompt ?? "",
    },
    suggestions: {
      enabled: input.flash_agents?.suggestions?.enabled ?? true,
      prompt: input.flash_agents?.suggestions?.prompt ?? "",
    },
    hook: {
      enabled: input.flash_agents?.hook?.enabled ?? true,
      prompt: input.flash_agents?.hook?.prompt ?? "",
    },
    tool_approval: {
      enabled: approval_mode === "auto",
      prompt: input.flash_agents?.tool_approval?.prompt ?? "",
    },
  };

  return {
    ...input,
    config_version: 1,
    approval_mode,
    permission_profile,
    language: input.language ?? "zh",
    launch_on_startup: input.launch_on_startup ?? false,
    onboarding_completed: input.onboarding_completed ?? false,
    diagnostic_log_collection_enabled: input.diagnostic_log_collection_enabled ?? true,
    quick_chat_shortcut: normalizeQuickChatShortcut(input.quick_chat_shortcut),
    mention_palette_show_global_drafts: input.mention_palette_show_global_drafts ?? true,
    message_layout: ["single", "responsive_double"].includes(input.message_layout)
      ? input.message_layout
      : "single",
    message_double_column_min_width: messageDoubleColumnMinWidth,
    book_mode_font_size: bookModeFontSize,
    workspace_open_mode: ["ask", "new_window", "current_window"].includes(input.workspace_open_mode)
      ? input.workspace_open_mode
      : "ask",
    agent_turn_limit_enabled: input.agent_turn_limit_enabled ?? false,
    agent_max_turns: agentMaxTurns,
    context_compaction_enabled: input.context_compaction_enabled ?? true,
    context_compaction_threshold: contextCompactionThreshold,
    context_compaction_prompt: input.context_compaction_prompt ?? "",
    memory_retrieval_enabled: input.memory_retrieval_enabled ?? false,
    model_retry: {
      retry_count: retryCount,
      retry_delay_ms: retryDelayMs,
      chat_queue: (input.model_retry?.chat_queue ?? []).filter(
        (binding) => binding.provider_id && binding.model,
      ),
      flash_queue: (input.model_retry?.flash_queue ?? []).filter(
        (binding) => binding.provider_id && binding.model,
      ),
    },
    web_search,
    html_preview,
    fetch,
    remote_gateway: {
      enabled: input.remote_gateway?.enabled ?? false,
      allow_lan_access: input.remote_gateway?.allow_lan_access ?? false,
      allowed_workspaces: input.remote_gateway?.allowed_workspaces ?? [],
    },
    channels: {
      feishu: {
        enabled: input.channels?.feishu?.enabled ?? false,
        app_id: input.channels?.feishu?.app_id ?? "",
        app_secret: input.channels?.feishu?.app_secret ?? "",
        domain: input.channels?.feishu?.domain === "lark" ? "lark" : "feishu",
        allowed_chat_ids: input.channels?.feishu?.allowed_chat_ids ?? [],
      },
      telegram: {
        enabled: input.channels?.telegram?.enabled ?? false,
        bot_token: input.channels?.telegram?.bot_token ?? "",
        allowed_chat_ids: input.channels?.telegram?.allowed_chat_ids ?? [],
      },
      qq: {
        enabled: input.channels?.qq?.enabled ?? false,
        app_id: input.channels?.qq?.app_id ?? "",
        client_secret: input.channels?.qq?.client_secret ?? "",
        allowed_user_ids: input.channels?.qq?.allowed_user_ids ?? [],
      },
      wechat: {
        enabled: input.channels?.wechat?.enabled ?? false,
        allowed_user_ids: input.channels?.wechat?.allowed_user_ids ?? [],
      },
      discord: {
        enabled: input.channels?.discord?.enabled ?? false,
        bot_token: input.channels?.discord?.bot_token ?? "",
        allowed_channel_ids: input.channels?.discord?.allowed_channel_ids ?? [],
      },
      slack: {
        enabled: input.channels?.slack?.enabled ?? false,
        bot_token: input.channels?.slack?.bot_token ?? "",
        app_token: input.channels?.slack?.app_token ?? "",
        allowed_channel_ids: input.channels?.slack?.allowed_channel_ids ?? [],
      },
    },
    flash_agents,
    providers,
    mcp,
    defaults: {
      chat_model: {
        provider_id: defaults.chat_model?.provider_id || providers[0]?.id || "",
        model: defaults.chat_model?.model || "",
      },
      flash_model: {
        provider_id: defaults.flash_model?.provider_id || providers[0]?.id || "",
        model: defaults.flash_model?.model || "",
      },
    },
  };
}
