//! Product startup policy independent of execution and conversation storage.
use crate::persistence::{pending_persistence_transition, ConversationStorageMaintenance};
use anyhow::Context;
use openagent_config::{self as config, Config};
use std::path::PathBuf;

#[derive(Clone, Debug, Default, serde::Deserialize, serde::Serialize)]
pub struct LaunchContext {
    pub workspace: Option<String>,
    pub conversation_id: Option<String>,
    pub message_id: Option<String>,
    pub new_conversation: bool,
}

impl LaunchContext {
    pub fn from_arguments(arguments: impl IntoIterator<Item = String>) -> Self {
        let arguments: Vec<String> = arguments.into_iter().collect();
        let value = |name: &str| {
            arguments
                .iter()
                .position(|argument| argument == name)
                .and_then(|index| arguments.get(index + 1))
                .cloned()
        };
        Self {
            workspace: value("--openagent-workspace"),
            conversation_id: value("--openagent-conversation"),
            message_id: value("--openagent-message"),
            new_conversation: arguments
                .iter()
                .any(|argument| argument == "--openagent-new-conversation"),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ExternalRuntimeLaunch {
    pub openagent_home: PathBuf,
    pub workspace: PathBuf,
    pub conversation_id: Option<String>,
    pub message_id: Option<String>,
    pub new_conversation: bool,
    pub initial_locale: String,
}

pub fn require_compatible_persistence(
    storage: &impl ConversationStorageMaintenance,
) -> anyhow::Result<()> {
    if let Some(plan) = pending_persistence_transition(storage)? {
        anyhow::bail!("A confirmed persistence transition is required for {} before startup; back up data under {}", plan.scope_label(), plan.backup_dir.display());
    }
    Ok(())
}

pub fn prepare_external_runtime_launch(
    launch: LaunchContext,
    storage: &impl ConversationStorageMaintenance,
) -> anyhow::Result<ExternalRuntimeLaunch> {
    require_compatible_persistence(storage)?;
    let config =
        config::load_config().context("Failed to load persisted OpenAgent configuration")?;
    let workspace = crate::paths::select_workspace(
        launch.workspace.as_deref().map(std::path::Path::new),
        (!config.workspace.is_empty()).then(|| std::path::Path::new(&config.workspace)),
        dirs::home_dir().as_deref(),
    )
    .map_err(anyhow::Error::msg)?;
    Ok(ExternalRuntimeLaunch {
        openagent_home: config::config_dir(),
        workspace,
        conversation_id: launch.conversation_id,
        message_id: launch.message_id,
        new_conversation: launch.new_conversation,
        initial_locale: config.language,
    })
}

/// This runs before execution services start. A malformed or future config is
/// user data and must never become a writable default recovery snapshot.
pub fn prepare_product_configuration(
    storage: &impl ConversationStorageMaintenance,
) -> anyhow::Result<Config> {
    require_compatible_persistence(storage)?;
    config::migrate_legacy_config()
        .context("Failed to migrate persisted OpenAgent configuration")?;
    let mut config =
        config::load_config().context("Failed to load persisted OpenAgent configuration")?;
    if !config::config_path().exists() {
        config = config::update_config(config, |_| Ok(()))
            .map_err(anyhow::Error::msg)?
            .0;
    }
    if let Err(error) = config::ensure_global_memory() {
        tracing::warn!(%error, "Failed to prepare global memory");
    }
    if let Some(home) = dirs::home_dir() {
        if let Err(error) = crate::defaults::ensure_default_skills_in(&home.join(".agents/skills"))
        {
            tracing::warn!(%error, "Failed to install default skills");
        }
    }
    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_context_preserves_navigation_targets_and_first_argument_precedence() {
        let launch = LaunchContext::from_arguments(
            [
                "app",
                "--openagent-workspace",
                "first",
                "--openagent-workspace",
                "second",
                "--openagent-conversation",
                "conversation",
                "--openagent-message",
                "message",
                "--openagent-new-conversation",
            ]
            .map(String::from),
        );
        assert_eq!(launch.workspace.as_deref(), Some("first"));
        assert_eq!(launch.conversation_id.as_deref(), Some("conversation"));
        assert_eq!(launch.message_id.as_deref(), Some("message"));
        assert!(launch.new_conversation);
        assert!(
            LaunchContext::from_arguments(["app".into(), "--openagent-message".into()])
                .message_id
                .is_none()
        );
    }
}
