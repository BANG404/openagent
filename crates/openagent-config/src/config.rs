use anyhow::{Context, Result};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::permissions::PermissionProfile;

mod appearance;
pub use appearance::{ThemeColors, ThemeOverrides};

pub const CURRENT_CONFIG_VERSION: u32 = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConfigCompatibility {
    Missing,
    Current,
    Legacy(u32),
    Future(u32),
    Invalid,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentConfig {
    #[serde(default)]
    pub provider_id: String,
    pub provider: String,
    pub model: String,
    pub api_key: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub openai_api_mode: OpenAiApiMode,
    #[serde(default)]
    pub reasoning_effort: Option<ReasoningEffort>,
    #[serde(default)]
    pub supports_reasoning_effort: bool,
    #[serde(default)]
    pub supports_vision: bool,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReasoningEffort {
    Low,
    Medium,
    High,
    Xhigh,
    Max,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OpenAiApiMode {
    #[default]
    Responses,
    ChatCompletions,
}

impl OpenAiApiMode {
    pub fn path(self) -> &'static str {
        match self {
            Self::Responses => "/responses",
            Self::ChatCompletions => "/chat/completions",
        }
    }
}

impl ReasoningEffort {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Xhigh => "xhigh",
            Self::Max => "max",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub api_key: String,
    #[serde(default)]
    pub base_url: String,
    /// OpenAI request dialect. Responses is the default; Chat Completions is
    /// retained for compatible services that have not implemented Responses.
    #[serde(default)]
    pub openai_api_mode: OpenAiApiMode,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub models: Vec<String>,
    /// Optional per-model context compaction thresholds. Missing entries use
    /// the global `context_compaction_threshold`.
    #[serde(default)]
    pub model_context_compaction_thresholds: std::collections::HashMap<String, usize>,
    /// Optional actual model windows; compaction reserves ten percent headroom.
    #[serde(default)]
    pub model_context_windows: std::collections::HashMap<String, usize>,
    /// Optional reasoning effort per configured model. Missing entries leave
    /// the provider default unchanged.
    #[serde(default)]
    pub model_reasoning_efforts: std::collections::HashMap<String, ReasoningEffort>,
    /// Models explicitly declared by the user as accepting the OpenAI-compatible
    /// `reasoning_effort` request field. ChatGPT OAuth models always use the
    /// Responses API form and do not need an entry here.
    #[serde(default)]
    pub model_reasoning_effort_enabled: std::collections::HashMap<String, bool>,
    /// Models explicitly enabled for image input and the `view_image` tool.
    #[serde(default)]
    pub model_vision_enabled: std::collections::HashMap<String, bool>,
}

pub const SUPPORTED_PROVIDER_TYPES: &[&str] = &[
    "anthropic",
    "openai",
    "azure",
    "gemini",
    "mistral",
    "cohere",
    "xai",
    "perplexity",
    "deepseek",
    "groq",
    "together",
    "openrouter",
    "hyperbolic",
    "moonshot",
    "minimax",
    "zai",
    "xiaomimimo",
    "mira",
    "doubleword",
    "ollama",
    "llamafile",
    "huggingface",
    "chatgpt",
];

pub fn provider_display_name(provider: &str) -> &'static str {
    match provider {
        "anthropic" => "Anthropic",
        "openai" => "OpenAI",
        "azure" => "Azure OpenAI",
        "gemini" => "Google Gemini",
        "mistral" => "Mistral AI",
        "cohere" => "Cohere",
        "xai" => "xAI",
        "perplexity" => "Perplexity",
        "deepseek" => "DeepSeek",
        "groq" => "Groq",
        "together" => "Together AI",
        "openrouter" => "OpenRouter",
        "hyperbolic" => "Hyperbolic",
        "moonshot" => "Moonshot",
        "minimax" => "MiniMax",
        "zai" => "Z.ai",
        "xiaomimimo" => "Xiaomi MiMo",
        "mira" => "Mira",
        "doubleword" => "Doubleword",
        "ollama" => "Ollama",
        "llamafile" => "Llamafile",
        "huggingface" => "Hugging Face",
        "chatgpt" => "ChatGPT OAuth",
        _ => "Model Provider",
    }
}

pub fn provider_default_base_url(provider: &str) -> &'static str {
    match provider {
        "anthropic" => "https://api.anthropic.com",
        "openai" => "https://api.openai.com/v1",
        "gemini" => "https://generativelanguage.googleapis.com",
        "mistral" => "https://api.mistral.ai",
        "cohere" => "https://api.cohere.ai",
        "xai" => "https://api.x.ai",
        "perplexity" => "https://api.perplexity.ai",
        "deepseek" => "https://api.deepseek.com",
        "groq" => "https://api.groq.com/openai/v1",
        "together" => "https://api.together.xyz",
        "openrouter" => "https://openrouter.ai/api/v1",
        "hyperbolic" => "https://api.hyperbolic.xyz",
        "moonshot" => "https://api.moonshot.ai/v1",
        "minimax" => "https://api.minimax.io/v1",
        "zai" => "https://api.z.ai/api/paas/v4",
        "xiaomimimo" => "https://api.xiaomimimo.com/v1",
        "mira" => "https://api.mira.network",
        "doubleword" => "https://api.doubleword.ai/v1",
        "ollama" => "http://localhost:11434",
        "llamafile" => "http://localhost:8080",
        "huggingface" => "https://router.huggingface.co",
        "chatgpt" => "https://chatgpt.com/backend-api/codex",
        _ => "",
    }
}

fn provider_name_from_request_url(provider: &ProviderConfig) -> String {
    let configured = provider.base_url.trim();
    let request_url = if configured.is_empty() {
        provider_default_base_url(&provider.provider)
    } else {
        configured
    };

    url::Url::parse(request_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .filter(|host| !host.is_empty())
        .unwrap_or_else(|| provider_display_name(&provider.provider).to_string())
}

pub fn provider_requires_api_key(provider: &str) -> bool {
    !matches!(provider, "ollama" | "llamafile" | "chatgpt")
}

pub fn agent_credentials_configured(agent: &AgentConfig) -> bool {
    !provider_requires_api_key(&agent.provider) || !agent.api_key.trim().is_empty()
}

/// Normalizes an OpenAI-compatible API base to the versioned API root expected
/// by Rig. Settings accepts a host, an API root, or either full request URL;
/// the selected Rig client appends its own endpoint path.
pub fn normalize_openai_base_url(base_url: &str) -> String {
    let mut base = base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return "https://api.openai.com/v1".to_string();
    }
    if let Some(prefix) = base.strip_suffix("/chat/completions") {
        base = prefix;
    }
    if let Some(prefix) = base.strip_suffix("/responses") {
        base = prefix;
    }
    if let Some(prefix) = base.strip_suffix("/models") {
        base = prefix;
    }
    let base = base.trim_end_matches('/');
    if base.ends_with("/v1") {
        base.to_string()
    } else {
        format!("{base}/v1")
    }
}

pub fn openai_request_url(base_url: &str, mode: OpenAiApiMode) -> String {
    format!(
        "{}{path}",
        normalize_openai_base_url(base_url),
        path = mode.path()
    )
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct DefaultModelBinding {
    #[serde(default)]
    pub provider_id: String,
    #[serde(default)]
    pub model: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum McpTransport {
    #[default]
    Http,
    Stdio,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpServerCatalog {
    /// Stable digest of the advertised tool and resource names used to decide
    /// whether the cached discovery summary is still valid.
    #[serde(default)]
    pub fingerprint: String,
    /// Short, model-generated capability family such as `browser automation`.
    #[serde(default)]
    pub category: String,
    /// Short, model-generated description of the server's useful capabilities.
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default)]
    pub resources: Vec<String>,
}

/// How tools enter the model's registry, independently of transport and ownership.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum McpToolMode {
    Direct,
    Relay,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub transport: McpTransport,
    // HTTP transport
    #[serde(default)]
    pub url: String,
    /// Bearer token — sent as `Authorization: Bearer <token>`
    #[serde(default)]
    pub bearer_token: String,
    /// Arbitrary extra HTTP request headers
    #[serde(default)]
    pub headers: std::collections::HashMap<String, String>,
    /// RFC 8707 resource indicator used by OAuth-protected MCP servers.
    #[serde(default)]
    pub oauth_resource: String,
    /// Explicit authorization-server issuer discovered or supplied by the
    /// connector. Empty values trigger protected-resource discovery.
    #[serde(default)]
    pub oauth_authorization_server: String,
    /// Public OAuth client identifier. Dynamic registration may populate this
    /// at authorization time when the connector does not provide one.
    #[serde(default)]
    pub oauth_client_id: String,
    /// Space-delimited OAuth scopes requested by the MCP connector.
    #[serde(default)]
    pub oauth_scope: String,
    // Stdio transport
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
    /// Optional working directory for stdio transports. Native entries leave
    /// this empty; portable Agent Plugins supply a validated absolute path.
    #[serde(default)]
    pub cwd: String,
    /// MCP tool names that remain discoverable in Settings but are not exposed
    /// to agents or dispatchable through the runtime.
    #[serde(default)]
    pub disabled_tools: Vec<String>,
    /// The entry belongs to a plugin capability surface rather than the user's
    /// own MCP integration list, so role narrowing keeps it for every role.
    /// Portable Agent Plugins set this flag and also namespace their id with the
    /// `plugin:` prefix; product hosts use the flag to mark reserved built-in
    /// capabilities, such as the Cua Driver plugin.
    #[serde(default)]
    pub plugin_owned: bool,
    /// Unspecified plugin entries mount directly; ordinary MCP entries use load_tool.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_mode: Option<McpToolMode>,
    /// Plugin identity stamped by the trusted package loader for entries that
    /// came from a plugin's `mcp.json`. It is never persisted: the confinement
    /// policy is resolved from the running session when the process starts, and
    /// an entry without an identity is not allowed to start as a plugin process.
    #[serde(skip)]
    pub plugin_process: Option<crate::plugin_identity::PluginProcessIdentity>,
    /// Cached discovery metadata. It contains no URL, token, command, or env.
    #[serde(default)]
    pub catalog: Option<McpServerCatalog>,
}

impl McpServerConfig {
    pub fn is_configured(&self) -> bool {
        match self.transport {
            McpTransport::Http => !self.url.trim().is_empty(),
            McpTransport::Stdio => !self.command.trim().is_empty(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct McpSettings {
    #[serde(default)]
    pub servers: Vec<McpServerConfig>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct DefaultModelsConfig {
    #[serde(default)]
    pub chat_model: DefaultModelBinding,
    #[serde(default)]
    pub flash_model: DefaultModelBinding,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModelRetryConfig {
    #[serde(default = "default_model_retry_count")]
    pub retry_count: usize,
    #[serde(default = "default_model_retry_delay_ms")]
    pub retry_delay_ms: u64,
    /// Fallbacks used for interactive chat requests.
    #[serde(default)]
    pub chat_queue: Vec<DefaultModelBinding>,
    /// Fallbacks used by title, memory, hook, approval, and compaction agents.
    #[serde(default)]
    pub flash_queue: Vec<DefaultModelBinding>,
}

fn default_model_retry_count() -> usize {
    3
}

fn default_model_retry_delay_ms() -> u64 {
    30_000
}

impl Default for ModelRetryConfig {
    fn default() -> Self {
        Self {
            retry_count: default_model_retry_count(),
            retry_delay_ms: default_model_retry_delay_ms(),
            chat_queue: Vec::new(),
            flash_queue: Vec::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FlashAgentConfig {
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub prompt: String,
}

impl Default for FlashAgentConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            prompt: String::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct FlashAgentsConfig {
    #[serde(default)]
    pub title: FlashAgentConfig,
    #[serde(default)]
    pub memory: FlashAgentConfig,
    /// Classifies MCP servers for the deferred `load` capability catalog.
    #[serde(default)]
    pub mcp_server_category: FlashAgentConfig,
    /// Generates actionable follow-up suggestions after completed turns and title updates.
    #[serde(default)]
    pub suggestions: FlashAgentConfig,
    #[serde(default)]
    pub hook: FlashAgentConfig,
    #[serde(default)]
    pub tool_approval: FlashAgentConfig,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalMode {
    Manual,
    Auto,
    #[default]
    #[serde(alias = "sandbox")]
    Off,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RecentWorkspace {
    pub path: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct RemoteGatewayConfig {
    /// The remote gateway is inert until explicitly enabled in Settings.
    #[serde(default)]
    pub enabled: bool,
    /// Allow authenticated devices to connect directly from the local network.
    #[serde(default)]
    pub allow_lan_access: bool,
    /// Canonical workspace paths that paired remote devices may select.
    #[serde(default)]
    pub allowed_workspaces: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct WechatChannelConfig {
    /// The adapter is inert until explicitly enabled in Settings.
    #[serde(default)]
    pub enabled: bool,
    /// Empty allows any direct-message user; otherwise only listed iLink user IDs are accepted.
    #[serde(default)]
    pub allowed_user_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct FeishuChannelConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub app_id: String,
    #[serde(default)]
    pub app_secret: String,
    /// `feishu` uses the China Open Platform; `lark` uses the international endpoint.
    #[serde(default = "default_feishu_domain")]
    pub domain: String,
    #[serde(default)]
    pub allowed_chat_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct TelegramChannelConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub bot_token: String,
    #[serde(default)]
    pub allowed_chat_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct QqChannelConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub app_id: String,
    #[serde(default)]
    pub client_secret: String,
    #[serde(default)]
    pub allowed_user_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct DiscordChannelConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub bot_token: String,
    #[serde(default)]
    pub allowed_channel_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct SlackChannelConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub bot_token: String,
    #[serde(default)]
    pub app_token: String,
    #[serde(default)]
    pub allowed_channel_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct ChannelConfig {
    #[serde(default)]
    pub feishu: FeishuChannelConfig,
    #[serde(default)]
    pub telegram: TelegramChannelConfig,
    #[serde(default)]
    pub qq: QqChannelConfig,
    #[serde(default)]
    pub wechat: WechatChannelConfig,
    #[serde(default)]
    pub discord: DiscordChannelConfig,
    #[serde(default)]
    pub slack: SlackChannelConfig,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomationHookEvent {
    SessionStart,
    SessionEnd,
    UserPromptSubmit,
    SubagentStart,
    SubagentStop,
    PermissionRequest,
    PreCompact,
    PostCompact,
    Stop,
    Interrupt,
    BeforeModel,
    AfterModel,
    BeforeTool,
    AfterTool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AutomationHookAction {
    Command { command: String },
    AgentMessage { message: String },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AutomationHookConfig {
    pub id: String,
    /// The installed package that contributed this hook. User-authored
    /// lifecycle hooks leave this empty; package hooks use it to resolve the
    /// package's own process policy and Host Bridge environment at invocation
    /// time.
    #[serde(default)]
    pub plugin_id: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    pub event: AutomationHookEvent,
    /// Regex matched against the canonical tool name for tool events.
    #[serde(default)]
    pub matcher: String,
    #[serde(default = "default_automation_hook_timeout_secs")]
    pub timeout_secs: u64,
    pub action: AutomationHookAction,
}

fn default_feishu_domain() -> String {
    "feishu".to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// Version of the persisted configuration shape. Missing values identify
    /// configurations written before the versioned compatibility baseline.
    #[serde(default)]
    pub config_version: u32,
    #[serde(default = "default_agent_turn_limit_enabled")]
    pub agent_turn_limit_enabled: bool,
    #[serde(default = "default_agent_max_turns")]
    pub agent_max_turns: usize,
    #[serde(default = "default_context_compaction_enabled")]
    pub context_compaction_enabled: bool,
    #[serde(default = "default_context_compaction_threshold")]
    pub context_compaction_threshold: usize,
    #[serde(default)]
    pub context_compaction_prompt: String,
    #[serde(default = "default_context_compaction_recent_message_count")]
    pub context_compaction_recent_message_count: usize,
    /// Automatically use the flash model to turn every latest user message
    /// into a focused semantic query before retrieving structured agent
    /// memory. Disabled by default so the chat agent can call
    /// `search_agent_memory` only when the turn needs recalled context.
    #[serde(default = "default_memory_retrieval_enabled")]
    pub memory_retrieval_enabled: bool,
    #[serde(default)]
    pub providers: Vec<ProviderConfig>,
    #[serde(default)]
    pub defaults: DefaultModelsConfig,
    #[serde(default)]
    pub model_retry: ModelRetryConfig,
    #[serde(default)]
    pub flash_agents: FlashAgentsConfig,
    /// User-authored commands and messages attached to Rig lifecycle events.
    #[serde(default)]
    pub automation_hooks: Vec<AutomationHookConfig>,
    /// How tool calls are approved: manually, by the flash model, or never gated.
    #[serde(default)]
    pub approval_mode: ApprovalMode,
    /// Filesystem and network permissions enforced independently from whether
    /// a tool call requires user approval.
    #[serde(default)]
    pub permission_profile: PermissionProfile,
    #[serde(default)]
    pub mcp: McpSettings,
    /// Enables the optional persisted chat-group collaboration tools and UI.
    #[serde(default = "default_enabled")]
    pub chat_groups_enabled: bool,
    /// Codex V2-style child-agent collaboration tools.
    #[serde(default)]
    pub multi_agent_v2: MultiAgentV2Config,
    /// Per-plugin lifecycle switches. Missing entries are enabled by default
    /// so existing configurations retain their behavior after normalization.
    #[serde(default)]
    pub agent_plugins_enabled: BTreeMap<String, bool>,
    /// Per-plugin grants to use the real host environment. Missing entries are denied.
    #[serde(default)]
    pub agent_plugins_host_access: BTreeMap<String, bool>,
    /// User mounting overrides; absence follows the installed package declaration.
    #[serde(default)]
    pub agent_plugins_mcp_tool_modes: BTreeMap<String, McpToolMode>,
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Selected installed theme package. Empty retains the built-in design.
    #[serde(default)]
    pub theme_plugin: String,
    #[serde(default)]
    pub theme_overrides: ThemeOverrides,
    #[serde(default = "default_language")]
    pub language: String,
    /// Read-and-discard tombstone for configurations written before the web
    /// search feature was removed. It is never exposed or persisted again.
    #[doc(hidden)]
    #[serde(default, skip_serializing, rename = "web_search")]
    pub removed_web_search: Option<toml::Value>,
    /// Read-and-discard tombstone for configurations written before HTML
    /// transcript previews were removed. It is never exposed or persisted again.
    #[doc(hidden)]
    #[serde(default, skip_serializing, rename = "html_preview")]
    pub removed_html_preview: Option<toml::Value>,
    /// Read-and-discard tombstone for configurations written before webpage
    /// fetching was removed. It is never exposed or persisted again.
    #[doc(hidden)]
    #[serde(default, skip_serializing, rename = "fetch")]
    pub removed_fetch: Option<toml::Value>,
    /// Read-and-discard tombstone for the removed GitHub release token.
    #[doc(hidden)]
    #[serde(default, skip_serializing, rename = "github_token")]
    pub removed_github_token: Option<toml::Value>,
    #[serde(default)]
    pub launch_on_startup: bool,
    /// Whether the user has completed the first-run product setup flow.
    #[serde(default)]
    pub onboarding_completed: bool,
    /// Send privacy-filtered application diagnostics to the OpenAgent telemetry
    /// endpoint. Local rotating logs remain available when this is disabled.
    #[serde(default = "default_enabled")]
    pub diagnostic_log_collection_enabled: bool,
    /// Global accelerator used to toggle the primary window's quick-chat
    /// presentation mode.
    #[serde(default = "default_quick_chat_shortcut")]
    pub quick_chat_shortcut: String,
    #[serde(default = "default_enabled")]
    pub mention_palette_show_global_drafts: bool,
    /// Transcript layout. `responsive_double` paginates rendered assistant
    /// content into columns once the transcript reaches the configured width.
    #[serde(default = "default_message_layout")]
    pub message_layout: String,
    #[serde(default = "default_message_double_column_min_width")]
    pub message_double_column_min_width: usize,
    /// Font size used by the full-window, two-column Agent reply reader.
    #[serde(default = "default_book_mode_font_size")]
    pub book_mode_font_size: usize,
    /// What selecting another workspace from the title-bar menu should do.
    /// `ask` is the first-run state; the user's first decision becomes the
    /// persisted default and can be changed later in General settings.
    #[serde(default = "default_workspace_open_mode")]
    pub workspace_open_mode: String,
    #[serde(default)]
    pub workspace: String,
    #[serde(default)]
    pub recent_workspaces: Vec<RecentWorkspace>,
    #[serde(default)]
    pub remote_gateway: RemoteGatewayConfig,
    #[serde(default)]
    pub channels: ChannelConfig,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MultiAgentV2Config {
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default = "default_multi_agent_max_concurrent")]
    pub max_concurrent_threads_per_session: usize,
    #[serde(default = "default_multi_agent_wait_timeout_ms")]
    pub default_wait_timeout_ms: u64,
    #[serde(default = "default_multi_agent_min_wait_timeout_ms")]
    pub min_wait_timeout_ms: u64,
    #[serde(default = "default_multi_agent_max_wait_timeout_ms")]
    pub max_wait_timeout_ms: u64,
    #[serde(default)]
    pub subagent_developer_instructions: String,
}

impl Default for MultiAgentV2Config {
    fn default() -> Self {
        Self {
            enabled: true,
            max_concurrent_threads_per_session: default_multi_agent_max_concurrent(),
            default_wait_timeout_ms: default_multi_agent_wait_timeout_ms(),
            min_wait_timeout_ms: default_multi_agent_min_wait_timeout_ms(),
            max_wait_timeout_ms: default_multi_agent_max_wait_timeout_ms(),
            subagent_developer_instructions: String::new(),
        }
    }
}

/// Resolve the lifecycle switch for any portable plugin. The shared map is the
/// current source of truth; the legacy product switch below remains only
/// so older settings can disable an already-installed package after upgrade.
pub fn agent_plugin_enabled(config: &Config, plugin_id: &str) -> bool {
    if plugin_id == crate::plugins::MULTI_AGENT_V2_ID {
        return config.multi_agent_v2.enabled;
    }
    if let Some(enabled) = config.agent_plugins_enabled.get(plugin_id) {
        return *enabled;
    }
    if plugin_id == crate::plugins::CHAT_GROUPS_ID {
        return config.chat_groups_enabled;
    }
    true
}

fn default_theme() -> String {
    "system".to_string()
}

fn default_language() -> String {
    "zh".to_string()
}

fn default_quick_chat_shortcut() -> String {
    "CommandOrControl+Shift+Space".to_string()
}

fn supported_quick_chat_key(key: &str) -> bool {
    let bytes = key.as_bytes();
    (bytes.len() == 4 && key.starts_with("Key") && bytes[3].is_ascii_uppercase())
        || (bytes.len() == 6 && key.starts_with("Digit") && bytes[5].is_ascii_digit())
        || key
            .strip_prefix('F')
            .and_then(|value| value.parse::<u8>().ok())
            .is_some_and(|value| (1..=24).contains(&value))
        || matches!(
            key,
            "Backquote"
                | "Backslash"
                | "BracketLeft"
                | "BracketRight"
                | "Pause"
                | "Comma"
                | "Equal"
                | "Minus"
                | "Period"
                | "Quote"
                | "Semicolon"
                | "Slash"
                | "Backspace"
                | "CapsLock"
                | "Enter"
                | "Space"
                | "Tab"
                | "Delete"
                | "End"
                | "Home"
                | "Insert"
                | "PageDown"
                | "PageUp"
                | "PrintScreen"
                | "ScrollLock"
                | "ArrowDown"
                | "ArrowLeft"
                | "ArrowRight"
                | "ArrowUp"
                | "NumLock"
                | "Numpad0"
                | "Numpad1"
                | "Numpad2"
                | "Numpad3"
                | "Numpad4"
                | "Numpad5"
                | "Numpad6"
                | "Numpad7"
                | "Numpad8"
                | "Numpad9"
                | "NumpadAdd"
                | "NumpadDecimal"
                | "NumpadDivide"
                | "NumpadEnter"
                | "NumpadEqual"
                | "NumpadMultiply"
                | "NumpadSubtract"
        )
}

fn valid_quick_chat_shortcut(shortcut: &str) -> bool {
    let tokens = shortcut.split('+').collect::<Vec<_>>();
    if tokens.len() < 2 {
        return false;
    }
    let modifiers = &tokens[..tokens.len() - 1];
    let mut seen = std::collections::HashSet::new();
    modifiers.iter().all(|modifier| {
        matches!(*modifier, "CommandOrControl" | "Alt" | "Shift") && seen.insert(*modifier)
    }) && supported_quick_chat_key(tokens[tokens.len() - 1])
}

fn default_workspace_open_mode() -> String {
    "ask".to_string()
}

fn default_message_layout() -> String {
    "single".to_string()
}

fn default_message_double_column_min_width() -> usize {
    1200
}

fn default_book_mode_font_size() -> usize {
    17
}

fn default_enabled() -> bool {
    true
}

fn default_automation_hook_timeout_secs() -> u64 {
    30
}

fn default_agent_turn_limit_enabled() -> bool {
    false
}

fn default_agent_max_turns() -> usize {
    10
}

fn default_multi_agent_max_concurrent() -> usize {
    8
}

fn default_multi_agent_wait_timeout_ms() -> u64 {
    30_000
}

fn default_multi_agent_min_wait_timeout_ms() -> u64 {
    1_000
}

fn default_multi_agent_max_wait_timeout_ms() -> u64 {
    30_000
}

pub fn configured_agent_max_turns(config: &Config) -> usize {
    if config.agent_turn_limit_enabled {
        config.agent_max_turns
    } else {
        usize::MAX - 1
    }
}

fn default_context_compaction_enabled() -> bool {
    true
}

fn default_memory_retrieval_enabled() -> bool {
    false
}

fn default_context_compaction_threshold() -> usize {
    200_000
}

fn default_context_compaction_recent_message_count() -> usize {
    5
}

pub fn normalize_config(config: &mut Config) {
    if !config.theme_plugin.is_empty() && !crate::plugins::is_plugin_name(&config.theme_plugin) {
        config.theme_plugin.clear();
    }
    config.theme_overrides.normalize();
    config.config_version = CURRENT_CONFIG_VERSION;
    if !valid_quick_chat_shortcut(&config.quick_chat_shortcut) {
        config.quick_chat_shortcut = default_quick_chat_shortcut();
    }
    if !matches!(
        config.message_layout.as_str(),
        "single" | "responsive_double"
    ) {
        config.message_layout = default_message_layout();
    }
    config.message_double_column_min_width =
        config.message_double_column_min_width.clamp(960, 2400);
    config.book_mode_font_size = config.book_mode_font_size.clamp(14, 24);
    if !matches!(
        config.workspace_open_mode.as_str(),
        "ask" | "new_window" | "current_window"
    ) {
        config.workspace_open_mode = default_workspace_open_mode();
    }
    config.flash_agents.tool_approval.enabled = config.approval_mode == ApprovalMode::Auto;
    config
        .agent_plugins_mcp_tool_modes
        .retain(|id, _| crate::plugins::is_plugin_name(id));
    config.agent_plugins_enabled.retain(|id, _| {
        let bytes = id.as_bytes();
        id != crate::plugins::MULTI_AGENT_V2_ID
            && (1..=64).contains(&bytes.len())
            && bytes.iter().all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'.')
            })
            && bytes.first().is_some_and(u8::is_ascii_alphanumeric)
            && bytes.last().is_some_and(u8::is_ascii_alphanumeric)
    });
    if let Some(enabled) = config
        .agent_plugins_enabled
        .get(crate::plugins::CHAT_GROUPS_ID)
    {
        config.chat_groups_enabled = *enabled;
    }
    for hook in &mut config.automation_hooks {
        hook.id = hook.id.trim().to_string();
        hook.name = hook.name.trim().to_string();
        hook.matcher = hook.matcher.trim().to_string();
        hook.timeout_secs = hook.timeout_secs.clamp(1, 300);
        match &mut hook.action {
            AutomationHookAction::Command { command } => {
                *command = command.trim().to_string();
            }
            AutomationHookAction::AgentMessage { message } => {
                *message = message.trim().to_string();
            }
        }
    }
    config.automation_hooks.retain(|hook| {
        !hook.id.is_empty()
            && match &hook.action {
                AutomationHookAction::Command { command } => !command.is_empty(),
                AutomationHookAction::AgentMessage { message } => !message.is_empty(),
            }
    });
    if config.agent_max_turns == 0 {
        config.agent_max_turns = default_agent_max_turns();
    }
    config.agent_max_turns = config.agent_max_turns.min(1000);
    config.multi_agent_v2.max_concurrent_threads_per_session = config
        .multi_agent_v2
        .max_concurrent_threads_per_session
        .clamp(1, 64);
    config.multi_agent_v2.max_wait_timeout_ms =
        config.multi_agent_v2.max_wait_timeout_ms.clamp(1, 300_000);
    config.multi_agent_v2.min_wait_timeout_ms = config
        .multi_agent_v2
        .min_wait_timeout_ms
        .min(config.multi_agent_v2.max_wait_timeout_ms);
    config.multi_agent_v2.default_wait_timeout_ms =
        config.multi_agent_v2.default_wait_timeout_ms.clamp(
            config.multi_agent_v2.min_wait_timeout_ms,
            config.multi_agent_v2.max_wait_timeout_ms,
        );
    if config.context_compaction_threshold == 0 {
        config.context_compaction_threshold = default_context_compaction_threshold();
    }
    config.context_compaction_threshold =
        config.context_compaction_threshold.clamp(1_000, 1_000_000);
    config.context_compaction_recent_message_count =
        config.context_compaction_recent_message_count.min(20);
    config.model_retry.retry_count = config.model_retry.retry_count.min(10);
    config.model_retry.retry_delay_ms = config.model_retry.retry_delay_ms.min(60_000);
    config
        .remote_gateway
        .allowed_workspaces
        .retain(|path| !path.trim().is_empty());
    config.remote_gateway.allowed_workspaces.sort();
    config.remote_gateway.allowed_workspaces.dedup();
    normalize_string_list(&mut config.channels.feishu.allowed_chat_ids);
    normalize_string_list(&mut config.channels.telegram.allowed_chat_ids);
    normalize_string_list(&mut config.channels.qq.allowed_user_ids);
    normalize_string_list(&mut config.channels.wechat.allowed_user_ids);
    normalize_string_list(&mut config.channels.discord.allowed_channel_ids);
    normalize_string_list(&mut config.channels.slack.allowed_channel_ids);
    if !matches!(config.channels.feishu.domain.as_str(), "feishu" | "lark") {
        config.channels.feishu.domain = default_feishu_domain();
    }
    for provider in &mut config.providers {
        if !SUPPORTED_PROVIDER_TYPES.contains(&provider.provider.as_str()) {
            provider.enabled = false;
        }
        if provider.name.trim().is_empty() {
            provider.name = provider_name_from_request_url(provider);
        }
        provider.models.retain(|model| !model.trim().is_empty());
        provider.models.sort();
        provider.models.dedup();
        provider
            .model_context_compaction_thresholds
            .retain(|model, _| provider.models.iter().any(|configured| configured == model));
        for threshold in provider.model_context_compaction_thresholds.values_mut() {
            *threshold = (*threshold).clamp(1_000, 1_000_000);
        }
        provider.model_context_windows.retain(|model, window| {
            provider.models.contains(model) && (1_000..=10_000_000).contains(window)
        });
        provider
            .model_reasoning_efforts
            .retain(|model, _| provider.models.iter().any(|configured| configured == model));
        provider
            .model_reasoning_effort_enabled
            .retain(|model, enabled| {
                *enabled && provider.models.iter().any(|configured| configured == model)
            });
        provider.model_vision_enabled.retain(|model, enabled| {
            *enabled && provider.models.iter().any(|configured| configured == model)
        });
        if provider.models.is_empty() {
            provider.enabled = false;
        }
    }
    for server in &mut config.mcp.servers {
        if !server.is_configured() {
            server.enabled = false;
        }
        normalize_string_list(&mut server.disabled_tools);
        if let Some(catalog) = server.catalog.as_mut() {
            catalog.fingerprint = catalog.fingerprint.trim().to_string();
            catalog.category = catalog.category.trim().to_string();
            catalog.summary = catalog.summary.trim().to_string();
            normalize_string_list(&mut catalog.tools);
            normalize_string_list(&mut catalog.resources);
            catalog.tools.truncate(128);
            catalog.resources.truncate(128);
            if catalog.fingerprint.is_empty() || catalog.category.is_empty() {
                server.catalog = None;
            }
        }
    }

    let is_valid_binding = |binding: &DefaultModelBinding| {
        config.providers.iter().any(|provider| {
            provider.enabled
                && provider.id == binding.provider_id
                && provider.models.iter().any(|model| model == &binding.model)
        })
    };
    let first_available_binding = || {
        config
            .providers
            .iter()
            .filter(|provider| provider.enabled)
            .find_map(|provider| {
                provider.models.first().map(|model| DefaultModelBinding {
                    provider_id: provider.id.clone(),
                    model: model.clone(),
                })
            })
            .unwrap_or_default()
    };

    if !is_valid_binding(&config.defaults.chat_model) {
        config.defaults.chat_model = first_available_binding();
    }
    if !is_valid_binding(&config.defaults.flash_model) {
        config.defaults.flash_model = first_available_binding();
    }
    config.model_retry.chat_queue.retain(&is_valid_binding);
    config.model_retry.flash_queue.retain(&is_valid_binding);
}

fn normalize_string_list(values: &mut Vec<String>) {
    *values = values
        .iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect();
    values.sort();
    values.dedup();
}

/// Resolve a model binding through the configured provider registry.
pub fn agent_for_binding(
    config: &Config,
    binding: &DefaultModelBinding,
) -> Result<AgentConfig, String> {
    let provider = config
        .providers
        .iter()
        .find(|provider| provider.id == binding.provider_id && provider.enabled)
        .ok_or_else(|| "Selected model provider is unavailable".to_string())?;
    if binding.model.trim().is_empty()
        || !provider.models.iter().any(|model| model == &binding.model)
    {
        return Err("Selected model is unavailable".to_string());
    }
    Ok(AgentConfig {
        provider_id: provider.id.clone(),
        provider: provider.provider.clone(),
        model: binding.model.clone(),
        api_key: provider.api_key.clone(),
        base_url: provider.base_url.clone(),
        openai_api_mode: provider.openai_api_mode,
        reasoning_effort: provider
            .model_reasoning_efforts
            .get(&binding.model)
            .copied(),
        supports_reasoning_effort: provider.provider == "chatgpt"
            || provider
                .model_reasoning_effort_enabled
                .get(&binding.model)
                .copied()
                .unwrap_or(false),
        supports_vision: provider
            .model_vision_enabled
            .get(&binding.model)
            .copied()
            .unwrap_or(false),
    })
}

/// Resolve the context compaction threshold for a concrete model binding.
/// A model-specific value takes precedence; otherwise the global threshold is
/// used. Normalization clamps both values before runtime use.
pub fn context_compaction_threshold_for_binding(
    config: &Config,
    binding: &DefaultModelBinding,
) -> usize {
    let threshold = config
        .providers
        .iter()
        .find(|provider| provider.id == binding.provider_id)
        .and_then(|provider| {
            provider
                .model_context_compaction_thresholds
                .get(&binding.model)
        })
        .copied()
        .unwrap_or(config.context_compaction_threshold);
    config
        .providers
        .iter()
        .find(|provider| provider.id == binding.provider_id)
        .and_then(|provider| provider.model_context_windows.get(&binding.model))
        .filter(|window| **window >= 1_000)
        .map_or(threshold, |window| {
            threshold.min(window.saturating_mul(9) / 10)
        })
}

impl Default for Config {
    fn default() -> Self {
        let mut config = Config {
            config_version: CURRENT_CONFIG_VERSION,
            agent_turn_limit_enabled: default_agent_turn_limit_enabled(),
            agent_max_turns: default_agent_max_turns(),
            context_compaction_enabled: default_context_compaction_enabled(),
            context_compaction_threshold: default_context_compaction_threshold(),
            context_compaction_prompt: String::new(),
            context_compaction_recent_message_count:
                default_context_compaction_recent_message_count(),
            memory_retrieval_enabled: default_memory_retrieval_enabled(),
            // A fresh install should not imply that a provider or model exists.
            // Users add only the services they actually have credentials for.
            providers: Vec::new(),
            defaults: DefaultModelsConfig::default(),
            model_retry: ModelRetryConfig::default(),
            flash_agents: FlashAgentsConfig::default(),
            automation_hooks: Vec::new(),
            approval_mode: ApprovalMode::Off,
            permission_profile: PermissionProfile::default(),
            mcp: McpSettings::default(),
            chat_groups_enabled: true,
            multi_agent_v2: MultiAgentV2Config::default(),
            agent_plugins_enabled: BTreeMap::new(),
            agent_plugins_host_access: BTreeMap::new(),
            agent_plugins_mcp_tool_modes: BTreeMap::new(),
            theme: "system".to_string(),
            theme_plugin: String::new(),
            theme_overrides: ThemeOverrides::default(),
            language: "zh".to_string(),
            removed_web_search: None,
            removed_html_preview: None,
            removed_fetch: None,
            removed_github_token: None,
            launch_on_startup: false,
            onboarding_completed: false,
            diagnostic_log_collection_enabled: true,
            quick_chat_shortcut: default_quick_chat_shortcut(),
            mention_palette_show_global_drafts: true,
            message_layout: default_message_layout(),
            message_double_column_min_width: default_message_double_column_min_width(),
            book_mode_font_size: default_book_mode_font_size(),
            workspace_open_mode: default_workspace_open_mode(),
            workspace: String::new(),
            recent_workspaces: Vec::new(),
            remote_gateway: RemoteGatewayConfig::default(),
            channels: ChannelConfig::default(),
        };
        normalize_config(&mut config);
        config
    }
}

fn default_config_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".openagent")
}

fn legacy_config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|path| path.join("openagent"))
}

fn migrate_legacy_config_dir(legacy: &Path, dir: &Path) -> Result<()> {
    if let Some(parent) = dir.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::rename(legacy, dir).with_context(|| {
        format!(
            "failed to migrate OpenAgent data from {} to {}",
            legacy.display(),
            dir.display()
        )
    })
}

pub fn config_dir() -> PathBuf {
    if let Some(path) = std::env::var_os("OPENAGENT_HOME") {
        return PathBuf::from(path);
    }
    default_config_dir()
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.toml")
}

/// Prepare the single application-data root before any subsystem opens files.
/// Installations using the former platform configuration directory are moved
/// once when the cross-platform `~/.openagent` root does not exist yet.
pub fn ensure_config_dir() -> Result<()> {
    let dir = config_dir();
    if !dir.exists() && std::env::var_os("OPENAGENT_HOME").is_none() {
        if let Some(legacy) = legacy_config_dir().filter(|path| path.exists() && path != &dir) {
            migrate_legacy_config_dir(&legacy, &dir)?;
        }
    }
    std::fs::create_dir_all(&dir)?;
    Ok(())
}

pub fn global_memory_path() -> PathBuf {
    config_dir().join("memory.md")
}

/// Workspace-scoped user memory. Workspace state lives under the workspace
/// itself, so this path derives from the workspace rather than the application
/// root.
pub fn project_memory_path(workspace: &str) -> PathBuf {
    Path::new(workspace).join(".agents").join("memory.md")
}

pub fn load_config() -> Result<Config> {
    let path = config_path();
    if !path.exists() {
        let backup = path.with_extension("toml.bak");
        if !backup.exists() {
            return Ok(Config::default());
        }
        return load_config_from_path(&backup);
    }
    match load_config_from_path(&path) {
        Ok(config) => Ok(config),
        Err(primary_error) => {
            let backup = path.with_extension("toml.bak");
            if !backup.exists() {
                return Err(primary_error);
            }
            load_config_from_path(&backup).with_context(|| {
                format!(
                    "{} is invalid and its last-known-good backup could not be loaded",
                    path.display()
                )
            })
        }
    }
}

/// Upgrade a legacy configuration in place without replacing any persisted
/// values with defaults. The original bytes are retained beside the canonical
/// file before the atomic replacement so an interrupted upgrade is recoverable.
pub fn migrate_legacy_config() -> Result<bool> {
    ensure_config_dir()?;
    let path = config_path();
    let backup = path.with_extension("toml.bak");
    let source = if path.exists() {
        path.clone()
    } else if backup.exists() {
        backup
    } else {
        return Ok(false);
    };
    let lock_path = config_dir().join("config.lock");
    let lock = std::fs::OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .truncate(false)
        .open(&lock_path)
        .context("failed to open configuration migration lock")?;
    lock.lock_exclusive()
        .context("failed to lock configuration migration")?;
    let result = (|| {
        let content = std::fs::read_to_string(&source)
            .with_context(|| format!("failed to read legacy configuration {}", source.display()))?;
        let mut config: Config = toml::from_str(&content).with_context(|| {
            format!("failed to parse legacy configuration {}", source.display())
        })?;
        if config.config_version == CURRENT_CONFIG_VERSION {
            return Ok(false);
        }
        if config.config_version > CURRENT_CONFIG_VERSION {
            anyhow::bail!(
                "Configuration version {} is newer than supported version {}",
                config.config_version,
                CURRENT_CONFIG_VERSION
            );
        }

        let legacy_backup =
            path.with_file_name(format!("config.toml.pre-v{}.bak", CURRENT_CONFIG_VERSION));
        if !legacy_backup.exists() {
            atomic_write(&legacy_backup, content.as_bytes())?;
        }
        normalize_config(&mut config);
        let migrated = toml::to_string_pretty(&config)?;
        atomic_write(&path, migrated.as_bytes())?;
        Ok(true)
    })();
    let unlock = lock.unlock();
    match (result, unlock) {
        (Ok(value), Ok(())) => Ok(value),
        (Err(error), Ok(())) => Err(error),
        (Ok(_), Err(error)) => Err(error).context("failed to unlock configuration migration"),
        (Err(error), Err(unlock_error)) => Err(error.context(format!(
            "failed to unlock configuration migration: {unlock_error}"
        ))),
    }
}

pub fn inspect_config_compatibility() -> ConfigCompatibility {
    let path = config_path();
    let backup = path.with_extension("toml.bak");
    if !path.exists() && !backup.exists() {
        return ConfigCompatibility::Missing;
    }
    let inspect = |candidate: &Path| {
        let Ok(content) = std::fs::read_to_string(candidate) else {
            return ConfigCompatibility::Invalid;
        };
        let Ok(config) = toml::from_str::<Config>(&content) else {
            return ConfigCompatibility::Invalid;
        };
        match config.config_version.cmp(&CURRENT_CONFIG_VERSION) {
            std::cmp::Ordering::Less => ConfigCompatibility::Legacy(config.config_version),
            std::cmp::Ordering::Equal => ConfigCompatibility::Current,
            std::cmp::Ordering::Greater => ConfigCompatibility::Future(config.config_version),
        }
    };
    if path.exists() {
        let primary = inspect(&path);
        if primary == ConfigCompatibility::Current {
            return primary;
        }
        if backup.exists() && inspect(&backup) == ConfigCompatibility::Current {
            return ConfigCompatibility::Current;
        }
        return primary;
    }
    inspect(&backup)
}

fn load_config_from_path(path: &Path) -> Result<Config> {
    let content = std::fs::read_to_string(path)?;
    let mut config: Config = toml::from_str(&content)?;
    if config.config_version > CURRENT_CONFIG_VERSION {
        anyhow::bail!(
            "Configuration version {} is newer than supported version {}",
            config.config_version,
            CURRENT_CONFIG_VERSION
        );
    }
    normalize_config(&mut config);
    Ok(config)
}

pub fn save_config(config: &Config) -> Result<()> {
    let dir = config_dir();
    ensure_config_dir()?;
    let mut normalized = config.clone();
    normalize_config(&mut normalized);
    let content = toml::to_string_pretty(&normalized)?;
    let path = dir.join("config.toml");
    if let Ok(previous) = std::fs::read(&path) {
        if std::str::from_utf8(&previous)
            .ok()
            .and_then(|content| toml::from_str::<Config>(content).ok())
            .filter(|config| config.config_version == CURRENT_CONFIG_VERSION)
            .is_some()
        {
            atomic_write(&path.with_extension("toml.bak"), &previous)?;
        }
    }
    atomic_write(&path, content.as_bytes())?;
    Ok(())
}

pub fn update_config<R>(
    fallback: Config,
    update: impl FnOnce(&mut Config) -> Result<R, String>,
) -> Result<(Config, R), String> {
    ensure_config_dir().map_err(|error| error.to_string())?;
    let lock_path = config_dir().join("config.lock");
    let lock = std::fs::OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        // The lock file is only a synchronization inode; opening it must not
        // mutate bytes another process may still have open.
        .truncate(false)
        .open(&lock_path)
        .map_err(|error| error.to_string())?;
    lock.lock_exclusive().map_err(|error| error.to_string())?;

    // A missing or malformed file must not reset an already-running process to
    // defaults when the user next saves. The runtime snapshot is the last
    // validated value and repairs the canonical file on this write.
    let mut config = load_config().unwrap_or(fallback);
    let result = update(&mut config)?;
    normalize_config(&mut config);
    save_config(&config).map_err(|error| error.to_string())?;
    lock.unlock().map_err(|error| error.to_string())?;
    Ok((config, result))
}

/// Replace `path` with `content` so a concurrent reader observes either the
/// whole previous or the whole new file, never a partial one. Shared with the
/// Agent Plugin update cache, which needs the same guarantee across the
/// processes of a multi-window desktop session.
pub fn atomic_write(path: &Path, content: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .with_context(|| format!("configuration path has no parent: {}", path.display()))?;
    std::fs::create_dir_all(parent)?;

    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(content)?;
    temporary.as_file_mut().sync_all()?;
    temporary
        .persist(path)
        .map_err(|error| error.error)
        .with_context(|| format!("failed to replace {} atomically", path.display()))?;

    #[cfg(unix)]
    std::fs::File::open(parent)?.sync_all()?;
    Ok(())
}

pub fn ensure_global_memory() -> Result<()> {
    ensure_config_dir()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    // Configuration tests deliberately mutate defaults before normalization.
    #![allow(clippy::field_reassign_with_default)]

    use super::{
        agent_credentials_configured, agent_for_binding, agent_plugin_enabled, atomic_write,
        configured_agent_max_turns, context_compaction_threshold_for_binding, default_config_dir,
        migrate_legacy_config_dir, normalize_config, normalize_openai_base_url, openai_request_url,
        provider_default_base_url, provider_display_name, provider_requires_api_key, AgentConfig,
        ApprovalMode, AutomationHookAction, AutomationHookEvent, Config, DefaultModelBinding,
        McpServerConfig, McpToolMode, McpTransport, OpenAiApiMode, ProviderConfig,
        CURRENT_CONFIG_VERSION, SUPPORTED_PROVIDER_TYPES,
    };
    use crate::permissions::{
        FileSystemAccess, FileSystemPermissionPath, NetworkAccess, PermissionProfile,
    };
    use std::collections::HashMap;

    #[test]
    fn retired_skill_classifier_loads_and_is_discarded_without_changing_other_tasks() {
        let mut original = Config::default();
        original.flash_agents.memory.enabled = false;
        original.flash_agents.memory.prompt = "Keep my memory rules".into();
        let legacy = format!(
            "{}\n[flash_agents.skill_category]\nenabled = true\nprompt = \"Old taxonomy\"\n",
            toml::to_string(&original).unwrap()
        );
        let loaded: Config = toml::from_str(&legacy).unwrap();
        assert!(!loaded.flash_agents.memory.enabled);
        assert_eq!(loaded.flash_agents.memory.prompt, "Keep my memory rules");
        assert!(!toml::to_string(&loaded).unwrap().contains("skill_category"));
    }

    #[test]
    fn default_config_root_follows_the_user_home() {
        let home = dirs::home_dir().expect("user home directory");
        assert_eq!(default_config_dir(), home.join(".openagent"));
    }

    /// Removed credentials remain readable through a tombstone and disappear
    /// from the next serialized configuration.
    #[test]
    fn removed_github_token_is_migrated_without_serialization() {
        let legacy: Config = toml::from_str("theme = \"dark\"\ngithub_token = \"ghp_legacy\"\n")
            .expect("parse configuration with a removed token");
        assert!(legacy.removed_github_token.is_some());
        assert_eq!(legacy.config_version, 0);

        let serialized = toml::to_string_pretty(&legacy).expect("serialize migrated config");
        assert!(!serialized.contains("github_token"));
        let parsed: Config = toml::from_str(&serialized).expect("parse serialized config");
        assert!(parsed.removed_github_token.is_none());
    }

    #[test]
    fn legacy_application_data_moves_as_one_root() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let legacy = directory.path().join("platform-config").join("openagent");
        let target = directory.path().join("home").join(".openagent");
        std::fs::create_dir_all(&legacy).expect("create legacy root");
        std::fs::write(legacy.join("config.toml"), "theme = \"dark\"\n")
            .expect("seed legacy config");
        std::fs::write(legacy.join("messages.db"), b"conversation database")
            .expect("seed legacy database");

        migrate_legacy_config_dir(&legacy, &target).expect("migrate legacy root");

        assert!(!legacy.exists());
        assert_eq!(
            std::fs::read_to_string(target.join("config.toml")).expect("read migrated config"),
            "theme = \"dark\"\n"
        );
        assert!(target.join("messages.db").is_file());
    }

    #[test]
    fn atomic_config_write_replaces_the_complete_file() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("config.toml");
        std::fs::write(&path, b"stale trailing content").expect("seed config");

        atomic_write(&path, b"theme = \"dark\"\n").expect("replace config");

        assert_eq!(
            std::fs::read_to_string(path).expect("read config"),
            "theme = \"dark\"\n"
        );
        assert_eq!(
            std::fs::read_dir(directory.path())
                .expect("list directory")
                .count(),
            1,
            "the temporary file must not remain beside config.toml"
        );
    }

    #[test]
    fn agent_turn_limit_is_disabled_by_default() {
        assert!(!Config::default().agent_turn_limit_enabled);
    }

    #[test]
    fn context_compaction_defaults_to_two_hundred_thousand_tokens() {
        assert_eq!(Config::default().context_compaction_threshold, 200_000);
        assert_eq!(Config::default().context_compaction_recent_message_count, 5);

        let missing: Config = toml::from_str("").expect("missing field should use default");
        assert_eq!(missing.context_compaction_recent_message_count, 5);

        let mut configured = Config::default();
        configured.context_compaction_recent_message_count = 99;
        normalize_config(&mut configured);
        assert_eq!(configured.context_compaction_recent_message_count, 20);
    }

    #[test]
    fn automatic_memory_retrieval_defaults_off_and_preserves_opt_in() {
        assert!(!Config::default().memory_retrieval_enabled);

        let missing: Config = toml::from_str("").expect("empty config should use field defaults");
        assert!(!missing.memory_retrieval_enabled);

        let enabled: Config = toml::from_str("memory_retrieval_enabled = true")
            .expect("explicit memory retrieval setting should deserialize");
        assert!(enabled.memory_retrieval_enabled);
    }

    #[test]
    fn removed_web_capability_settings_are_ignored_and_not_reserialized() {
        let config: Config = toml::from_str(
            r#"
[web_search]
provider = "tavily"
tavily_api_key = "retained-secret"

[fetch]
page_size = 24000

[html_preview]
fixed_height = 480
"#,
        )
        .expect("removed web capability settings should not block startup");

        let serialized = toml::to_string_pretty(&config).expect("serialize normalized config");
        assert!(!serialized.contains("web_search"));
        assert!(!serialized.contains("[fetch]"));
        assert!(!serialized.contains("html_preview"));
        assert!(!serialized.contains("retained-secret"));
    }

    #[test]
    fn suggestions_replace_the_legacy_personalized_greeting_setting() {
        let config: Config = toml::from_str(
            r#"
[flash_agents.new_conversation_summary]
enabled = false
prompt = "legacy"
"#,
        )
        .expect("legacy Flash config should remain readable");

        assert!(config.flash_agents.suggestions.enabled);
        assert!(config.flash_agents.suggestions.prompt.is_empty());
        let serialized = toml::to_string_pretty(&config).expect("serialize normalized config");
        assert!(!serialized.contains("new_conversation_summary"));
        assert!(serialized.contains("[flash_agents.suggestions]"));
    }

    #[test]
    fn rig_provider_catalog_is_complete_and_unique() {
        let mut providers = SUPPORTED_PROVIDER_TYPES.to_vec();
        providers.sort_unstable();
        providers.dedup();
        assert_eq!(providers.len(), 23);
        assert!(providers.iter().all(|provider| {
            provider_display_name(provider) != "Model Provider"
                && (*provider == "azure" || !provider_default_base_url(provider).is_empty())
        }));
        assert!(!provider_requires_api_key("ollama"));
        assert!(!provider_requires_api_key("llamafile"));
        assert!(!provider_requires_api_key("chatgpt"));
        assert!(provider_requires_api_key("openai"));
    }

    #[test]
    fn credential_validation_allows_auth_backed_and_local_providers_without_keys() {
        for provider in ["chatgpt", "ollama", "llamafile"] {
            assert!(agent_credentials_configured(&AgentConfig {
                provider_id: "provider".into(),
                provider: provider.into(),
                model: "test-model".into(),
                api_key: String::new(),
                base_url: String::new(),
                openai_api_mode: OpenAiApiMode::default(),
                reasoning_effort: None,
                supports_reasoning_effort: false,
                supports_vision: false,
            }));
        }
        assert!(!agent_credentials_configured(&AgentConfig {
            provider_id: "provider".into(),
            provider: "openai".into(),
            model: "test-model".into(),
            api_key: "  ".into(),
            base_url: String::new(),
            openai_api_mode: OpenAiApiMode::default(),
            reasoning_effort: None,
            supports_reasoning_effort: false,
            supports_vision: false,
        }));
    }

    #[test]
    fn visual_multimodality_round_trips_and_projects_per_model() {
        let mut config: Config = toml::from_str(
            r#"
[[providers]]
id = "provider"
name = "Provider"
provider = "openai"
api_key = "key"
enabled = true
models = ["text", "vision"]

[providers.model_vision_enabled]
text = false
vision = true
removed = true
"#,
        )
        .expect("vision settings should deserialize");

        normalize_config(&mut config);
        assert_eq!(
            config.providers[0].model_vision_enabled,
            HashMap::from([("vision".to_string(), true)])
        );

        let serialized = toml::to_string_pretty(&config).expect("vision settings should serialize");
        let restored: Config = toml::from_str(&serialized).expect("vision settings should restore");
        let vision = agent_for_binding(
            &restored,
            &DefaultModelBinding {
                provider_id: "provider".into(),
                model: "vision".into(),
            },
        )
        .expect("vision model should resolve");
        let text = agent_for_binding(
            &restored,
            &DefaultModelBinding {
                provider_id: "provider".into(),
                model: "text".into(),
            },
        )
        .expect("text model should resolve");

        assert!(vision.supports_vision);
        assert!(!text.supports_vision);
    }

    #[test]
    fn missing_agent_turn_limit_setting_is_disabled() {
        let config: Config = toml::from_str("").expect("empty config should use field defaults");

        assert!(!config.agent_turn_limit_enabled);
    }

    #[test]
    fn automation_hooks_round_trip_and_normalize() {
        let mut config: Config = toml::from_str(
            r#"
[[automation_hooks]]
id = " preflight "
name = " Review command "
event = "before_tool"
matcher = " ^exec_command$ "
timeout_secs = 900

[automation_hooks.action]
type = "command"
command = " printf ready "
"#,
        )
        .expect("automation hook should deserialize");

        normalize_config(&mut config);
        let hook = &config.automation_hooks[0];
        assert_eq!(hook.id, "preflight");
        assert_eq!(hook.name, "Review command");
        assert_eq!(hook.event, AutomationHookEvent::BeforeTool);
        assert_eq!(hook.matcher, "^exec_command$");
        assert_eq!(hook.timeout_secs, 300);
        assert_eq!(
            hook.action,
            AutomationHookAction::Command {
                command: "printf ready".into()
            }
        );

        let serialized = toml::to_string_pretty(&config).expect("automation hook should serialize");
        let restored: Config = toml::from_str(&serialized).expect("automation hook should restore");
        assert_eq!(restored.automation_hooks, config.automation_hooks);
    }

    #[test]
    fn model_retry_defaults_to_three_retries_with_a_thirty_second_delay() {
        for config in [
            Config::default(),
            toml::from_str::<Config>("").expect("empty config should use field defaults"),
        ] {
            assert_eq!(config.model_retry.retry_count, 3);
            assert_eq!(config.model_retry.retry_delay_ms, 30_000);
        }
    }

    #[test]
    fn approval_defaults_off_and_migrates_legacy_sandbox_value() {
        assert_eq!(Config::default().approval_mode, ApprovalMode::Off);
        assert_eq!(
            toml::from_str::<Config>("")
                .expect("deserialize missing approval")
                .approval_mode,
            ApprovalMode::Off
        );

        let legacy: Config =
            toml::from_str("approval_mode = \"sandbox\"").expect("deserialize legacy approval");
        assert_eq!(legacy.approval_mode, ApprovalMode::Off);
        assert!(!toml::to_string_pretty(&legacy)
            .expect("serialize migrated approval")
            .contains("sandbox"));
    }

    #[test]
    fn missing_permission_profile_defaults_to_workspace_write() {
        let config: Config = toml::from_str("").expect("empty config should use field defaults");
        let PermissionProfile::Managed {
            file_system,
            network,
        } = config.permission_profile
        else {
            panic!("default permission profile should be managed");
        };

        assert_eq!(network, NetworkAccess::Restricted);
        assert_eq!(file_system.entries.len(), 2);
        assert_eq!(file_system.entries[0].access, FileSystemAccess::Read);
        assert_eq!(file_system.entries[1].access, FileSystemAccess::Write);
        assert_eq!(
            file_system.entries[0].path,
            FileSystemPermissionPath::host_root()
        );
        assert_eq!(
            file_system.entries[1].path,
            FileSystemPermissionPath::workspace()
        );
    }

    #[test]
    fn permission_profile_round_trips_through_toml() {
        let mut config = Config::default();
        config.permission_profile = PermissionProfile::read_only();

        let serialized = toml::to_string_pretty(&config).expect("serialize config");
        let restored: Config = toml::from_str(&serialized).expect("deserialize config");

        assert_eq!(restored.permission_profile, config.permission_profile);
    }

    #[test]
    fn external_permission_profile_is_rejected() {
        let error = toml::from_str::<Config>(
            r#"
[permission_profile]
enforcement = "external"
network = "restricted"
"#,
        )
        .expect_err("external isolation must not bypass runtime filesystem permissions");

        assert!(error.to_string().contains("unknown variant `external`"));
    }

    #[test]
    fn diagnostic_log_collection_defaults_enabled() {
        let config: Config = toml::from_str("").expect("empty config should use field defaults");

        assert!(config.diagnostic_log_collection_enabled);
    }

    #[test]
    fn onboarding_completion_defaults_false_and_round_trips() {
        let missing: Config = toml::from_str("").expect("empty config should use field defaults");
        assert!(!missing.onboarding_completed);

        let mut completed = Config::default();
        completed.onboarding_completed = true;
        let serialized = toml::to_string(&completed).expect("config should serialize");
        let restored: Config = toml::from_str(&serialized).expect("config should deserialize");

        assert!(restored.onboarding_completed);
    }

    #[test]
    fn message_layout_defaults_and_normalizes() {
        let missing: Config = toml::from_str("").expect("empty config should use field defaults");
        assert_eq!(missing.message_layout, "single");
        assert_eq!(missing.message_double_column_min_width, 1200);
        assert_eq!(missing.book_mode_font_size, 17);

        let mut invalid = Config::default();
        invalid.message_layout = "three_columns".into();
        invalid.message_double_column_min_width = 10;
        invalid.book_mode_font_size = 100;
        normalize_config(&mut invalid);
        assert_eq!(invalid.message_layout, "single");
        assert_eq!(invalid.message_double_column_min_width, 960);
        assert_eq!(invalid.book_mode_font_size, 24);
    }

    #[test]
    fn plugin_mcp_overrides_roundtrip_and_follow_package_when_absent() {
        let legacy: Config = toml::from_str("").unwrap();
        assert!(legacy.agent_plugins_mcp_tool_modes.is_empty());
        let mut config: Config = toml::from_str(
            "[agent_plugins_mcp_tool_modes]\ngoal = 'relay'\ngraph = 'direct'\n'../escape' = 'relay'\n",
        ).unwrap();
        normalize_config(&mut config);
        assert_eq!(config.agent_plugins_mcp_tool_modes.len(), 2);
        assert_eq!(
            config.agent_plugins_mcp_tool_modes["goal"],
            McpToolMode::Relay
        );
        assert_eq!(
            config.agent_plugins_mcp_tool_modes["graph"],
            McpToolMode::Direct
        );
        let restored: Config = toml::from_str(&toml::to_string(&config).unwrap()).unwrap();
        assert_eq!(
            restored.agent_plugins_mcp_tool_modes,
            config.agent_plugins_mcp_tool_modes
        );
        assert!(
            toml::from_str::<Config>("[agent_plugins_mcp_tool_modes]\ngoal = 'lazy'\n").is_err()
        );
        assert!(config.agent_plugins_enabled.is_empty());
        assert!(config.agent_plugins_host_access.is_empty());
    }

    #[test]
    fn plugin_enablement_defaults_to_enabled_and_drops_invalid_ids() {
        let missing: Config = toml::from_str("").expect("empty config should use defaults");
        assert!(missing.agent_plugins_enabled.is_empty());

        let mut config = Config::default();
        config
            .agent_plugins_enabled
            .insert("demo-plugin".into(), false);
        config
            .agent_plugins_enabled
            .insert("Bad Plugin".into(), false);
        config
            .agent_plugins_enabled
            .insert("../escape".into(), false);
        config
            .agent_plugins_enabled
            .insert(crate::plugins::MULTI_AGENT_V2_ID.into(), false);
        normalize_config(&mut config);

        assert_eq!(
            config.agent_plugins_enabled.get("demo-plugin"),
            Some(&false)
        );
        assert!(!config.agent_plugins_enabled.contains_key("Bad Plugin"));
        assert!(!config.agent_plugins_enabled.contains_key("../escape"));
        assert!(!config
            .agent_plugins_enabled
            .contains_key(crate::plugins::MULTI_AGENT_V2_ID));

        assert!(!agent_plugin_enabled(&config, "demo-plugin"));
        assert!(agent_plugin_enabled(&config, "goal"));
        config
            .agent_plugins_enabled
            .insert("chat-groups".into(), false);
        config.chat_groups_enabled = true;
        normalize_config(&mut config);
        assert!(!agent_plugin_enabled(&config, "chat-groups"));
        assert!(!config.chat_groups_enabled);
    }

    #[test]
    fn legacy_product_switches_only_apply_to_compatibility_ids() {
        // Goal and Graph are ordinary packages with no Runtime registry entry.
        let config = Config::default();
        assert!(agent_plugin_enabled(&config, "goal"));
        assert!(agent_plugin_enabled(&config, "graph"));
        assert!(
            agent_plugin_enabled(&config, "cua-driver"),
            "desktop-control packages use ordinary plugin enablement"
        );
        assert!(
            agent_plugin_enabled(&config, "unknown-plugin"),
            "a plugin without product settings is enabled by default"
        );

        let mut config: Config = toml::from_str(
            r#"
            [[mcp.servers]]
            id = "cua-driver"
            name = "Cua Driver"
            enabled = true
            command = "cua-driver"
            "#,
        )
        .expect("a configuration with the reserved Cua Driver entry");
        assert!(agent_plugin_enabled(&config, "cua-driver"));
        config.mcp.servers[0].enabled = false;
        assert!(agent_plugin_enabled(&config, "cua-driver"));
        config
            .agent_plugins_enabled
            .insert("cua-driver".into(), false);
        config.mcp.servers[0].enabled = true;
        assert!(!agent_plugin_enabled(&config, "cua-driver"));

        config.chat_groups_enabled = false;
        assert!(!agent_plugin_enabled(&config, "chat-groups"));
        config
            .agent_plugins_enabled
            .insert("chat-groups".into(), true);
        assert!(
            agent_plugin_enabled(&config, "chat-groups"),
            "the shared map wins over the product setting"
        );
    }

    #[test]
    fn quick_chat_shortcut_defaults_and_normalizes() {
        let missing: Config = toml::from_str("").expect("empty config should use field defaults");
        assert_eq!(missing.quick_chat_shortcut, "CommandOrControl+Shift+Space");

        let mut valid = Config::default();
        valid.quick_chat_shortcut = "CommandOrControl+Alt+KeyK".into();
        normalize_config(&mut valid);
        assert_eq!(valid.quick_chat_shortcut, "CommandOrControl+Alt+KeyK");

        let mut invalid = Config::default();
        invalid.quick_chat_shortcut = "KeyK".into();
        normalize_config(&mut invalid);
        assert_eq!(invalid.quick_chat_shortcut, "CommandOrControl+Shift+Space");
    }

    #[test]
    fn configuration_version_distinguishes_legacy_and_fresh_shapes() {
        let legacy: Config = toml::from_str("").expect("legacy config should deserialize");
        assert_eq!(legacy.config_version, 0);

        let fresh = Config::default();
        assert_eq!(fresh.config_version, CURRENT_CONFIG_VERSION);
        assert!(toml::to_string(&fresh)
            .expect("serialize config")
            .contains("config_version = 1"));
    }

    #[test]
    fn configured_agent_max_turns_honors_enabled_and_disabled_settings() {
        let mut config = Config::default();
        config.agent_max_turns = 37;

        assert_eq!(configured_agent_max_turns(&config), usize::MAX - 1);

        config.agent_turn_limit_enabled = true;
        assert_eq!(configured_agent_max_turns(&config), 37);
    }

    #[test]
    fn normalization_disables_incomplete_services_and_repairs_model_bindings() {
        let mut config = Config::default();
        config.providers = vec![
            ProviderConfig {
                id: "empty".into(),
                name: "Empty".into(),
                provider: "openai".into(),
                api_key: "key".into(),
                base_url: String::new(),
                openai_api_mode: OpenAiApiMode::default(),
                enabled: true,
                models: vec![],
                model_context_compaction_thresholds: HashMap::new(),
                model_context_windows: HashMap::new(),
                model_reasoning_efforts: HashMap::new(),
                model_reasoning_effort_enabled: HashMap::new(),
                model_vision_enabled: HashMap::new(),
            },
            ProviderConfig {
                id: "ready".into(),
                name: "Ready".into(),
                provider: "openai".into(),
                api_key: "key".into(),
                base_url: String::new(),
                openai_api_mode: OpenAiApiMode::default(),
                enabled: true,
                models: vec!["model-b".into(), "model-a".into(), "model-a".into()],
                model_context_compaction_thresholds: HashMap::new(),
                model_context_windows: HashMap::new(),
                model_reasoning_efforts: HashMap::new(),
                model_reasoning_effort_enabled: HashMap::new(),
                model_vision_enabled: HashMap::new(),
            },
        ];
        config.defaults.chat_model = DefaultModelBinding {
            provider_id: "empty".into(),
            model: "invented".into(),
        };
        config.defaults.flash_model = config.defaults.chat_model.clone();
        config.model_retry.chat_queue = vec![config.defaults.chat_model.clone()];
        config.mcp.servers = vec![McpServerConfig {
            id: "incomplete".into(),
            name: "Incomplete".into(),
            enabled: true,
            transport: McpTransport::Http,
            url: String::new(),
            bearer_token: String::new(),
            headers: HashMap::new(),
            oauth_resource: String::new(),
            oauth_authorization_server: String::new(),
            oauth_client_id: String::new(),
            oauth_scope: String::new(),
            command: String::new(),
            args: vec![],
            env: HashMap::new(),
            cwd: String::new(),
            disabled_tools: vec!["zeta".into(), " alpha ".into(), "alpha".into()],
            plugin_owned: false,
            tool_mode: None,
            plugin_process: None,
            catalog: None,
        }];

        normalize_config(&mut config);

        assert!(!config.providers[0].enabled);
        assert_eq!(config.providers[0].models, Vec::<String>::new());
        assert_eq!(config.providers[1].models, vec!["model-a", "model-b"]);
        assert_eq!(config.defaults.chat_model.provider_id, "ready");
        assert_eq!(config.defaults.chat_model.model, "model-a");
        assert_eq!(config.defaults.flash_model, config.defaults.chat_model);
        assert!(config.model_retry.chat_queue.is_empty());
        assert!(!config.mcp.servers[0].enabled);
        assert_eq!(config.mcp.servers[0].disabled_tools, vec!["alpha", "zeta"]);
    }

    #[test]
    fn normalization_names_unnamed_services_from_the_request_domain() {
        let mut config = Config::default();
        config.providers = vec![
            ProviderConfig {
                id: "custom".into(),
                name: "  ".into(),
                provider: "openai".into(),
                api_key: "key".into(),
                base_url: "https://gateway.example.com/v1".into(),
                openai_api_mode: OpenAiApiMode::default(),
                enabled: false,
                models: vec![],
                model_context_compaction_thresholds: HashMap::new(),
                model_context_windows: HashMap::new(),
                model_reasoning_efforts: HashMap::new(),
                model_reasoning_effort_enabled: HashMap::new(),
                model_vision_enabled: HashMap::new(),
            },
            ProviderConfig {
                id: "default".into(),
                name: String::new(),
                provider: "anthropic".into(),
                api_key: "key".into(),
                base_url: String::new(),
                openai_api_mode: OpenAiApiMode::default(),
                enabled: false,
                models: vec![],
                model_context_compaction_thresholds: HashMap::new(),
                model_context_windows: HashMap::new(),
                model_reasoning_efforts: HashMap::new(),
                model_reasoning_effort_enabled: HashMap::new(),
                model_vision_enabled: HashMap::new(),
            },
        ];

        normalize_config(&mut config);

        assert_eq!(config.providers[0].name, "gateway.example.com");
        assert_eq!(config.providers[1].name, "api.anthropic.com");
    }

    #[test]
    fn normalizes_openai_compatible_api_roots() {
        assert_eq!(
            normalize_openai_base_url("https://api.example.com"),
            "https://api.example.com/v1"
        );
        assert_eq!(
            normalize_openai_base_url("https://api.example.com/v1/"),
            "https://api.example.com/v1"
        );
        assert_eq!(
            normalize_openai_base_url("https://api.example.com/v1/chat/completions"),
            "https://api.example.com/v1"
        );
        assert_eq!(
            normalize_openai_base_url("https://api.example.com/v1/responses"),
            "https://api.example.com/v1"
        );
        assert_eq!(normalize_openai_base_url(""), "https://api.openai.com/v1");
        assert_eq!(
            openai_request_url("https://api.minimax.cn/v1", OpenAiApiMode::Responses),
            "https://api.minimax.cn/v1/responses"
        );
        assert_eq!(
            openai_request_url(
                "https://api.minimax.cn/v1/responses",
                OpenAiApiMode::ChatCompletions
            ),
            "https://api.minimax.cn/v1/chat/completions"
        );
    }

    #[test]
    fn missing_openai_api_mode_defaults_to_responses() {
        let config: ProviderConfig = toml::from_str(
            r#"
id = "provider"
name = "Provider"
provider = "openai"
api_key = "key"
base_url = "https://api.minimax.cn/v1"
enabled = false
models = []
"#,
        )
        .expect("provider config should deserialize");

        assert_eq!(config.openai_api_mode, OpenAiApiMode::Responses);
    }

    #[test]
    fn model_compaction_threshold_overrides_global_and_falls_back_when_missing() {
        let mut config = Config::default();
        config.context_compaction_threshold = 24_000;
        config.providers = vec![ProviderConfig {
            id: "provider".into(),
            name: "Provider".into(),
            provider: "openai".into(),
            api_key: "key".into(),
            base_url: String::new(),
            openai_api_mode: OpenAiApiMode::default(),
            enabled: true,
            models: vec!["custom".into(), "fallback".into()],
            model_context_compaction_thresholds: HashMap::from([
                ("custom".into(), 48_000),
                ("removed".into(), 96_000),
            ]),
            model_context_windows: HashMap::new(),
            model_reasoning_efforts: HashMap::new(),
            model_reasoning_effort_enabled: HashMap::new(),
            model_vision_enabled: HashMap::new(),
        }];

        normalize_config(&mut config);

        assert_eq!(
            context_compaction_threshold_for_binding(
                &config,
                &DefaultModelBinding {
                    provider_id: "provider".into(),
                    model: "custom".into(),
                },
            ),
            48_000
        );
        assert_eq!(
            context_compaction_threshold_for_binding(
                &config,
                &DefaultModelBinding {
                    provider_id: "provider".into(),
                    model: "fallback".into(),
                },
            ),
            24_000
        );
        assert!(!config.providers[0]
            .model_context_compaction_thresholds
            .contains_key("removed"));
        config.providers[0]
            .model_context_windows
            .insert("custom".into(), 32_000);
        assert_eq!(
            context_compaction_threshold_for_binding(
                &config,
                &DefaultModelBinding {
                    provider_id: "provider".into(),
                    model: "custom".into()
                }
            ),
            28_800
        );
        assert_eq!(
            config.providers[0].model_context_compaction_thresholds["custom"],
            48_000
        );
    }
}
