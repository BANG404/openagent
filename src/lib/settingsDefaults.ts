import { DEFAULT_QUICK_CHAT_SHORTCUT } from "$lib/quickChatShortcut";
import type { AppConfig } from "$lib/types";

export const approvalModeDescriptionKey = {
  manual: "approvalModeManualDescription",
  auto: "approvalModeAutoDescription",
  off: "approvalModeOffDescription",
} as const;

export const DEFAULT_APP_CONFIG: AppConfig = {
  providers: [],
  defaults: {
    chat_model: { provider_id: "", model: "" },
    flash_model: { provider_id: "", model: "" },
  },
  model_retry: {
    retry_count: 3,
    retry_delay_ms: 30000,
    chat_queue: [],
    flash_queue: [],
  },
  flash_agents: {
    title: { enabled: true, prompt: "" },
    memory: { enabled: true, prompt: "" },
    skill_category: { enabled: true, prompt: "" },
    suggestions: { enabled: true, prompt: "" },
    hook: { enabled: true, prompt: "" },
    tool_approval: { enabled: false, prompt: "" },
  },
  automation_hooks: [],
  approval_mode: "off",
  mcp: { servers: [] },
  theme: "system",
  language: "zh",
  launch_on_startup: false,
  onboarding_completed: false,
  diagnostic_log_collection_enabled: true,
  quick_chat_shortcut: DEFAULT_QUICK_CHAT_SHORTCUT,
  mention_palette_show_global_drafts: true,
  message_layout: "single",
  message_double_column_min_width: 1200,
  book_mode_font_size: 17,
  workspace_open_mode: "ask",
  agent_turn_limit_enabled: false,
  agent_max_turns: 10,
  context_compaction_enabled: true,
  context_compaction_threshold: 200000,
  context_compaction_prompt: "",
  context_compaction_recent_message_count: 5,
  memory_retrieval_enabled: false,
  remote_gateway: {
    enabled: false,
    allow_lan_access: false,
    allowed_workspaces: [],
  },
};
