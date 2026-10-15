//! Tauri-independent contracts for submitting input to OpenAgent.
//!
//! This crate is the public edge of the agent runtime. UI adapters submit raw
//! text and use the resolved route instead of duplicating slash-command
//! parsing. It deliberately has no dependency on Tauri, providers, SQLite, or
//! workspace state so it can be embedded in an SDK and tested independently.

use serde::{Deserialize, Serialize};
use std::fmt;

pub const SDK_PROTOCOL_VERSION: u32 = 3;

/// Plugin manifest extensions and Host Bridge contract, independent of the
/// desktop transport and Runtime release version.
pub const PLUGIN_PROTOCOL_VERSION: u32 = 1;

/// Optional Host Bridge embedding capability, discovered through embedding.status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PluginEmbeddingRequest {
    pub texts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PluginEmbeddingStatus {
    pub version: u32,
    pub supported: bool,
    pub ready: bool,
    pub model_id: String,
    pub model_version: String,
    pub dimensions: usize,
    pub max_texts: usize,
    pub max_text_bytes: usize,
    pub max_total_bytes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PluginEmbeddingResponse {
    pub version: u32,
    pub model_id: String,
    pub model_version: String,
    pub dimensions: usize,
    pub vectors: Vec<Vec<f32>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PluginI18n {
    pub supported_locales: Vec<String>,
    pub default_locale: String,
    pub translations:
        std::collections::BTreeMap<String, std::collections::BTreeMap<String, String>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandOwner {
    Runtime,
    Client,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandArgument {
    None,
    RequiredText,
    OptionalText,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommandSpec {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plugin_i18n: Option<PluginI18n>,
    pub name: String,
    pub owner: CommandOwner,
    pub argument: CommandArgument,
    pub label_key: String,
    pub description_key: String,
    #[serde(default)]
    pub plugin_id: Option<String>,
    /// Literal labels supplied by portable plugins. Builtin commands keep
    /// using localized translation keys for compatibility.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentCommand {
    Compact,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClientAction {
    NewConversation,
    OpenModelSettings,
    OpenDrafts,
    OpenMemory,
    OpenSkills,
    OpenSettings,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ResolvedInput {
    Chat {
        text: String,
    },
    AgentCommand {
        command: AgentCommand,
        argument: String,
        original_text: String,
    },
    ClientAction {
        action: ClientAction,
        original_text: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SubmissionOutcome {
    RunCompleted,
    ImmediateCommand {
        command: AgentCommand,
        changed: bool,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatModelBinding {
    pub provider_id: String,
    pub model: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum UserMessageContext {
    Quote {
        text: String,
        #[serde(default)]
        #[serde(rename = "sourceMessageId")]
        source_message_id: Option<String>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInputRequest {
    pub conv_id: String,
    pub text: String,
    #[serde(default)]
    pub parent_checkpoint_id: Option<String>,
    #[serde(default)]
    pub branch_id: Option<String>,
    #[serde(default)]
    pub attachments: Vec<String>,
    #[serde(default)]
    pub contexts: Vec<UserMessageContext>,
    #[serde(default)]
    pub model_binding: Option<ChatModelBinding>,
    #[serde(default)]
    pub user_message_id: Option<String>,
    #[serde(default)]
    pub assistant_message_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateConversationRequest {
    pub id: String,
    pub title: String,
    pub workspace: String,
    #[serde(default)]
    pub parent_conv_id: Option<String>,
    #[serde(default)]
    pub role_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeInterruptRequest {
    pub conv_id: String,
    pub interrupt_id: String,
    pub response: String,
    #[serde(default)]
    pub branch_id: Option<String>,
    pub assistant_message_id: String,
    #[serde(default)]
    pub model_binding: Option<ChatModelBinding>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitInterruptResponseRequest {
    pub conv_id: String,
    pub interrupt_id: String,
    pub response: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InputErrorCode {
    EmptyInput,
    MissingArgument,
    UnexpectedArgument,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct InputError {
    pub code: InputErrorCode,
    pub command: Option<String>,
    pub message: String,
}

impl fmt::Display for InputError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for InputError {}

pub fn command_specs() -> Vec<CommandSpec> {
    vec![
        client_spec("new", "slashCmdNewLabel", "slashCmdNewDesc"),
        client_spec("model", "slashCmdModelLabel", "slashCmdModelDesc"),
        client_spec("drafts", "slashCmdDraftsLabel", "slashCmdDraftsDesc"),
        client_spec("memory", "slashCmdMemoryLabel", "slashCmdMemoryDesc"),
        runtime_spec(
            "compact",
            "slashCmdCompactLabel",
            "slashCmdCompactDesc",
            CommandArgument::None,
        ),
        client_spec("skills", "slashCmdSkillsLabel", "slashCmdSkillsDesc"),
        client_spec("settings", "slashCmdSettingsLabel", "slashCmdSettingsDesc"),
    ]
}

pub fn resolve_input(input: &str) -> Result<ResolvedInput, InputError> {
    if input.trim().is_empty() {
        return Err(InputError {
            code: InputErrorCode::EmptyInput,
            command: None,
            message: "input must not be empty".to_string(),
        });
    }

    // Slash commands are control syntax only at byte zero. Leading whitespace
    // deliberately keeps the input as ordinary chat text.
    let Some(without_slash) = input.strip_prefix('/') else {
        return Ok(ResolvedInput::Chat {
            text: input.trim_end().to_string(),
        });
    };
    let token_end = without_slash
        .find(char::is_whitespace)
        .unwrap_or(without_slash.len());
    let command_name = without_slash[..token_end].to_ascii_lowercase();
    let argument = without_slash[token_end..].trim();

    let resolved = match command_name.as_str() {
        "compact" => agent_command(
            AgentCommand::Compact,
            "compact",
            argument,
            input.trim_end(),
            CommandArgument::None,
        )?,
        "new" => client_action(
            ClientAction::NewConversation,
            "new",
            argument,
            input.trim_end(),
        )?,
        "model" => client_action(
            ClientAction::OpenModelSettings,
            "model",
            argument,
            input.trim_end(),
        )?,
        "drafts" => client_action(
            ClientAction::OpenDrafts,
            "drafts",
            argument,
            input.trim_end(),
        )?,
        "memory" => client_action(
            ClientAction::OpenMemory,
            "memory",
            argument,
            input.trim_end(),
        )?,
        "skills" => client_action(
            ClientAction::OpenSkills,
            "skills",
            argument,
            input.trim_end(),
        )?,
        "settings" => client_action(
            ClientAction::OpenSettings,
            "settings",
            argument,
            input.trim_end(),
        )?,
        // A leading slash is also a valid start for paths and ordinary prompts.
        // Only registered names have command semantics.
        _ => ResolvedInput::Chat {
            text: input.trim().to_string(),
        },
    };
    Ok(resolved)
}

/// Whether a transport must wait for the canonical submission result.
///
/// Long-running chat and plugin requests may be acknowledged after dispatch.
/// Compact and client-owned commands must return their immediate outcome so a
/// transport does not leave the caller pending indefinitely.
pub fn submission_requires_synchronous_outcome(input: &str) -> Result<bool, InputError> {
    resolve_input(input).map(|resolved| {
        matches!(
            resolved,
            ResolvedInput::AgentCommand {
                command: AgentCommand::Compact,
                ..
            } | ResolvedInput::ClientAction { .. }
        )
    })
}

/// Extract backend-owned `@mention` tokens from raw user input.
///
/// Mentions begin at the start of the input or after a non-word character.
/// Quoted mentions support whitespace and backslash-escaped quotes.
pub fn extract_mentions(input: &str) -> Vec<String> {
    let chars = input.chars().collect::<Vec<_>>();
    let mut mentions = Vec::new();
    let mut index = 0usize;
    while index < chars.len() {
        if chars[index] != '@'
            || (index > 0
                && (chars[index.saturating_sub(1)].is_alphanumeric()
                    || chars[index.saturating_sub(1)] == '_'))
        {
            index += 1;
            continue;
        }
        index += 1;
        if index < chars.len() && chars[index] == '"' {
            index += 1;
            let mut mention = String::new();
            while index < chars.len() {
                match chars[index] {
                    '\\' if index + 1 < chars.len() && chars[index + 1] == '"' => {
                        mention.push('"');
                        index += 2;
                    }
                    '"' => {
                        index += 1;
                        break;
                    }
                    ch => {
                        mention.push(ch);
                        index += 1;
                    }
                }
            }
            if !mention.is_empty() {
                mentions.push(mention);
            }
            continue;
        }
        let start = index;
        while index < chars.len()
            && (chars[index].is_alphanumeric() || matches!(chars[index], '_' | '-' | '/' | '.'))
        {
            index += 1;
        }
        if index > start {
            mentions.push(chars[start..index].iter().collect());
        }
    }
    mentions
}

fn runtime_spec(
    name: &str,
    label_key: &str,
    description_key: &str,
    argument: CommandArgument,
) -> CommandSpec {
    CommandSpec {
        plugin_i18n: None,
        name: name.to_string(),
        owner: CommandOwner::Runtime,
        argument,
        label_key: label_key.to_string(),
        description_key: description_key.to_string(),
        plugin_id: None,
        label: None,
        description: None,
    }
}

fn client_spec(name: &str, label_key: &str, description_key: &str) -> CommandSpec {
    CommandSpec {
        plugin_i18n: None,
        name: name.to_string(),
        owner: CommandOwner::Client,
        argument: CommandArgument::None,
        label_key: label_key.to_string(),
        description_key: description_key.to_string(),
        plugin_id: None,
        label: None,
        description: None,
    }
}

fn agent_command(
    command: AgentCommand,
    name: &str,
    argument: &str,
    original_text: &str,
    argument_kind: CommandArgument,
) -> Result<ResolvedInput, InputError> {
    match argument_kind {
        CommandArgument::RequiredText if argument.is_empty() => {
            return Err(InputError {
                code: InputErrorCode::MissingArgument,
                command: Some(name.to_string()),
                message: format!("/{name} requires a text argument"),
            });
        }
        CommandArgument::None if !argument.is_empty() => {
            return Err(InputError {
                code: InputErrorCode::UnexpectedArgument,
                command: Some(name.to_string()),
                message: format!("/{name} does not accept an argument"),
            });
        }
        _ => {}
    }
    Ok(ResolvedInput::AgentCommand {
        command,
        argument: argument.to_string(),
        original_text: original_text.to_string(),
    })
}

fn client_action(
    action: ClientAction,
    name: &str,
    argument: &str,
    original_text: &str,
) -> Result<ResolvedInput, InputError> {
    if !argument.is_empty() {
        return Err(InputError {
            code: InputErrorCode::UnexpectedArgument,
            command: Some(name.to_string()),
            message: format!("/{name} does not accept an argument"),
        });
    }
    Ok(ResolvedInput::ClientAction {
        action,
        original_text: original_text.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn publishes_the_current_sdk_protocol_version() {
        assert_eq!(SDK_PROTOCOL_VERSION, 3);
    }

    #[test]
    fn identifies_submissions_that_require_a_synchronous_transport_result() {
        assert!(!submission_requires_synchronous_outcome("hello").unwrap());
        // Product commands are plugin-owned. The protocol parser must leave
        // their tokens available to the installed-plugin resolver.
        assert!(!submission_requires_synchronous_outcome("/goal ship it").unwrap());
        assert!(!submission_requires_synchronous_outcome("/graph build it").unwrap());
        assert!(submission_requires_synchronous_outcome("/compact").unwrap());
        assert!(submission_requires_synchronous_outcome("/new").unwrap());
        assert!(!submission_requires_synchronous_outcome("/goal").unwrap());
    }

    #[test]
    fn resolves_chat_without_interpreting_embedded_commands() {
        assert_eq!(
            resolve_input("A /goal in ordinary text").unwrap(),
            ResolvedInput::Chat {
                text: "A /goal in ordinary text".to_string()
            }
        );
        assert_eq!(
            resolve_input("/usr/bin/env is a path").unwrap(),
            ResolvedInput::Chat {
                text: "/usr/bin/env is a path".to_string()
            }
        );
    }

    #[test]
    fn leaves_plugin_commands_for_the_installed_plugin_resolver() {
        assert_eq!(
            resolve_input("/GOAL  improve test coverage ").unwrap(),
            ResolvedInput::Chat {
                text: "/GOAL  improve test coverage".to_string(),
            }
        );
        assert_eq!(
            resolve_input("/graph\nplan and execute").unwrap(),
            ResolvedInput::Chat {
                text: "/graph\nplan and execute".to_string(),
            }
        );
    }

    #[test]
    fn slash_commands_require_the_first_input_character() {
        assert_eq!(
            resolve_input(" /goal improve test coverage").unwrap(),
            ResolvedInput::Chat {
                text: " /goal improve test coverage".to_string(),
            }
        );
    }

    #[test]
    fn extracts_boundary_and_quoted_mentions() {
        assert_eq!(
            extract_mentions(
                "ask @reviewer and @\"product designer\" but not email@example.com or x@owner"
            ),
            vec!["reviewer".to_string(), "product designer".to_string()]
        );
        assert_eq!(
            extract_mentions(r#"@"role \"with\" quotes""#),
            vec![r#"role "with" quotes"#.to_string()]
        );
        assert_eq!(
            extract_mentions("请 @Socrates，请先发言；然后 @Iris。"),
            vec!["Socrates".to_string(), "Iris".to_string()]
        );
        assert_eq!(
            extract_mentions("**@Socrates**，请 @Iris（主持人）发言。"),
            vec!["Socrates".to_string(), "Iris".to_string()]
        );
        assert_eq!(
            extract_mentions("参考 @草稿/项目/规划/重构.md 和 @README.md。"),
            vec![
                "草稿/项目/规划/重构.md".to_string(),
                "README.md".to_string()
            ]
        );
    }

    #[test]
    fn leaves_plugin_command_without_an_argument_for_plugin_validation() {
        assert_eq!(
            resolve_input("/goal").unwrap(),
            ResolvedInput::Chat {
                text: "/goal".to_string(),
            }
        );
    }

    #[test]
    fn maps_client_commands_without_executing_ui_behavior() {
        assert_eq!(
            resolve_input("/settings").unwrap(),
            ResolvedInput::ClientAction {
                action: ClientAction::OpenSettings,
                original_text: "/settings".to_string(),
            }
        );
        assert_eq!(
            resolve_input("/settings providers").unwrap_err().code,
            InputErrorCode::UnexpectedArgument
        );
    }

    #[test]
    fn maps_compact_to_an_immediate_runtime_command() {
        assert_eq!(
            resolve_input("/compact").unwrap(),
            ResolvedInput::AgentCommand {
                command: AgentCommand::Compact,
                argument: String::new(),
                original_text: "/compact".to_string(),
            }
        );
        assert_eq!(
            resolve_input("/compact now").unwrap_err().code,
            InputErrorCode::UnexpectedArgument
        );
    }

    #[test]
    fn registry_has_unique_command_names_and_routes() {
        let specs = command_specs();
        let mut names = specs
            .iter()
            .map(|spec| spec.name.as_str())
            .collect::<Vec<_>>();
        names.sort_unstable();
        names.dedup();

        assert_eq!(names.len(), specs.len());
        assert!(!specs.iter().any(|spec| spec.name == "goal"));
        assert!(!specs.iter().any(|spec| spec.name == "graph"));
        assert!(specs.iter().any(|spec| {
            spec.name == "compact"
                && spec.owner == CommandOwner::Runtime
                && spec.argument == CommandArgument::None
        }));
        assert!(specs.iter().any(|spec| {
            spec.name == "settings"
                && spec.owner == CommandOwner::Client
                && spec.argument == CommandArgument::None
        }));
    }

    #[test]
    fn serializes_sdk_requests_with_transport_contract_field_names() {
        let request = AgentInputRequest {
            conv_id: "conversation-1".to_string(),
            text: "/goal finish the SDK".to_string(),
            parent_checkpoint_id: Some("checkpoint-1".to_string()),
            branch_id: Some("branch-1".to_string()),
            attachments: vec!["attachment.txt".to_string()],
            contexts: vec![UserMessageContext::Quote {
                text: "selected excerpt".to_string(),
                source_message_id: Some("assistant-0".to_string()),
            }],
            model_binding: Some(ChatModelBinding {
                provider_id: "provider-1".to_string(),
                model: "model-1".to_string(),
            }),
            user_message_id: Some("user-1".to_string()),
            assistant_message_id: Some("assistant-1".to_string()),
        };

        assert_eq!(
            serde_json::to_value(request).unwrap(),
            serde_json::json!({
                "convId": "conversation-1",
                "text": "/goal finish the SDK",
                "parentCheckpointId": "checkpoint-1",
                "branchId": "branch-1",
                "attachments": ["attachment.txt"],
                "contexts": [{
                    "type": "quote",
                    "text": "selected excerpt",
                    "sourceMessageId": "assistant-0"
                }],
                "modelBinding": {
                    "providerId": "provider-1",
                    "model": "model-1"
                },
                "userMessageId": "user-1",
                "assistantMessageId": "assistant-1"
            })
        );
    }

    #[test]
    fn serializes_embedded_conversation_creation_with_transport_names() {
        let request = CreateConversationRequest {
            id: "conversation-1".to_string(),
            title: "Embedded".to_string(),
            workspace: "C:/workspace".to_string(),
            parent_conv_id: Some("parent-1".to_string()),
            role_id: None,
        };

        assert_eq!(
            serde_json::to_value(request).unwrap(),
            serde_json::json!({
                "id": "conversation-1",
                "title": "Embedded",
                "workspace": "C:/workspace",
                "parentConvId": "parent-1",
                "roleId": null
            })
        );
    }
}
