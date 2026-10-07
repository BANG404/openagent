//! Native startup adapters. Runtime owns compatibility inspection and durable data.
mod external;
pub(crate) mod instances;
mod mode;
mod persistence;
pub(crate) mod provisioning;
pub(crate) use external::start_external_desktop_runtime;
pub(crate) use mode::prepare_host_runtime;
#[cfg(feature = "embedded-runtime")]
use openagent_runtime::state::OpenAgentRuntime;
pub(crate) use persistence::prepare_interactive_persistence;
#[cfg(feature = "embedded-runtime")]
use std::sync::Arc;

pub(crate) struct HostRuntimeBootstrap {
    pub(crate) initial_locale: String,
    pub(crate) data_dir: std::path::PathBuf,
    #[cfg(feature = "embedded-runtime")]
    pub(crate) runtime: Option<Arc<OpenAgentRuntime>>,
    pub(crate) external_launch: Option<ExternalRuntimeLaunch>,
}

#[derive(Clone, Debug, serde::Deserialize)]
pub(crate) struct ExternalRuntimeLaunch {
    pub(crate) openagent_home: std::path::PathBuf,
    pub(crate) workspace: std::path::PathBuf,
    pub(crate) conversation_id: Option<String>,
    pub(crate) message_id: Option<String>,
    pub(crate) new_conversation: bool,
    pub(crate) initial_locale: String,
}

#[derive(Debug, serde::Deserialize)]
pub(super) struct PersistenceTransitionPlan {
    pub(crate) data_dir: std::path::PathBuf,
    pub(super) backup_dir: std::path::PathBuf,
    pub(super) reset_config: bool,
    pub(super) reset_conversations: bool,
}

#[derive(Debug, serde::Deserialize)]
pub(super) struct DesktopBootstrapResponse {
    pub(super) schema_version: u32,
    pub(super) status: String,
    pub(super) launch: Option<ExternalRuntimeLaunch>,
    pub(super) transition: Option<PersistenceTransitionPlan>,
    pub(super) backup_dir: Option<std::path::PathBuf>,
}

pub(super) enum DesktopBootstrapStatus {
    Ready(ExternalRuntimeLaunch),
    TransitionRequired(PersistenceTransitionPlan),
    TransitionApplied(std::path::PathBuf),
    NoTransition,
}
