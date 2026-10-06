//! Explicit embedded-diagnostic Tauri passthroughs; Runtime owns behavior.
use crate::cua_driver::{ensure_cua_driver_serve, plugin_daemon_supervisor};
use openagent_runtime::checkpoint::{
    BranchMeta, ChatTaskUsage, CheckpointMeta, ConvPatch, ConversationMeta, FileChange,
    RenderableCheckpoint, TaskTrace,
};
use openagent_runtime::commands::*;
use openagent_runtime::config::{
    Config, DefaultModelBinding, McpServerConfig, ReasoningEffort, RecentWorkspace,
};
use openagent_runtime::conversation_memory::{
    AgentMemoryEntry, AgentRole, ConversationPage, ConversationPageCursor,
};
use openagent_runtime::skills::SkillMetadata;
use openagent_runtime::state::{OpenAgentRuntime, ScheduledChatHookDefinition};
use openagent_runtime::tools::ScheduleChatHookArgs;
use openagent_runtime::{
    mcp as runtime_mcp, AgentInputRequest, ChatModelBinding, CommandSpec,
    CreateConversationRequest, InputError, ResolvedInput, ResumeInterruptRequest,
    SubmissionOutcome, SubmitInterruptResponseRequest, UserMessageContext,
};
use std::sync::Arc;
use tauri::State;
pub(crate) mod conversations;
pub(crate) mod documents;
pub(crate) mod input;
pub(crate) mod lifecycle;
pub(crate) mod mcp;
pub(crate) mod memory;
pub(crate) mod models;
pub(crate) mod plugins;
pub(crate) mod settings;
pub(crate) mod workspace;
