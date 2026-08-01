import type {
  AppConfig,
  FetchConfig,
  HtmlPreviewConfig,
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

const reasoningEfforts = new Set<ReasoningEffort>(["low", "medium", "high", "xhigh", "max"]);

export function normalizeConfigShape(input: AppConfig): AppConfig {
  const requestedMaxTurns = Number(input.agent_max_turns);
  const agentMaxTurns = Number.isFinite(requestedMaxTurns)
    ? Math.min(1000, Math.max(1, Math.floor(requestedMaxTurns)))
    : 10;
  const requestedCompactionThreshold = Number(input.context_compaction_threshold);
  const contextCompactionThreshold = Number.isFinite(requestedCompactionThreshold)
    ? Math.min(1_000_000, Math.max(1_000, Math.floor(requestedCompactionThreshold)))
    : 24_000;
  const requestedRetryCount = Number(input.model_retry?.retry_count);
  const retryCount = Number.isFinite(requestedRetryCount)
    ? Math.min(10, Math.max(0, Math.floor(requestedRetryCount)))
    : 3;
  const requestedRetryDelayMs = Number(input.model_retry?.retry_delay_ms);
  const retryDelayMs = Number.isFinite(requestedRetryDelayMs)
    ? Math.min(60_000, Math.max(0, Math.floor(requestedRetryDelayMs)))
    : 1_000;
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
          provider.provider === "chatgpt" &&
          configuredModels.has(model) &&
          reasoningEfforts.has(effort as ReasoningEffort),
      ),
    ) as Record<string, ReasoningEffort>;
    return {
      ...provider,
      models: provider.models ?? [],
      model_context_compaction_thresholds,
      model_reasoning_efforts,
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
  const approval_mode = input.approval_mode;
  const requestedDoubleColumnMinWidth = Number(input.message_double_column_min_width);
  const messageDoubleColumnMinWidth = Number.isFinite(requestedDoubleColumnMinWidth)
    ? Math.min(2400, Math.max(960, Math.floor(requestedDoubleColumnMinWidth)))
    : 1200;
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
    new_conversation_summary: {
      enabled: input.flash_agents?.new_conversation_summary?.enabled ?? true,
      prompt: input.flash_agents?.new_conversation_summary?.prompt ?? "",
    },
    hook: {
      enabled: input.flash_agents?.hook?.enabled ?? true,
      prompt: input.flash_agents?.hook?.prompt ?? "",
    },
    tool_approval: {
      enabled: approval_mode === "auto" || approval_mode === "sandbox",
      prompt: input.flash_agents?.tool_approval?.prompt ?? "",
    },
  };

  return {
    ...input,
    approval_mode,
    language: input.language ?? "zh",
    launch_on_startup: input.launch_on_startup ?? false,
    quick_chat_shortcut: normalizeQuickChatShortcut(input.quick_chat_shortcut),
    mention_palette_show_global_drafts: input.mention_palette_show_global_drafts ?? true,
    message_layout: ["single", "responsive_double"].includes(input.message_layout)
      ? input.message_layout
      : "single",
    message_double_column_min_width: messageDoubleColumnMinWidth,
    workspace_open_mode: ["ask", "new_window", "current_window"].includes(input.workspace_open_mode)
      ? input.workspace_open_mode
      : "ask",
    agent_turn_limit_enabled: input.agent_turn_limit_enabled ?? false,
    agent_max_turns: agentMaxTurns,
    context_compaction_enabled: input.context_compaction_enabled ?? true,
    context_compaction_threshold: contextCompactionThreshold,
    context_compaction_prompt: input.context_compaction_prompt ?? "",
    memory_retrieval_enabled: input.memory_retrieval_enabled ?? true,
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
