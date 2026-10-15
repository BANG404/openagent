//! Native startup adapters. Runtime owns compatibility inspection and durable data.
mod external;
pub(crate) mod instances;
mod mode;
mod persistence;
pub(crate) mod provisioning;
pub(crate) use external::start_external_desktop_runtime;
pub(crate) use mode::prepare_host_runtime;

pub(crate) use persistence::prepare_interactive_persistence;

pub(crate) struct HostRuntimeBootstrap {
    pub(crate) initial_locale: String,
    pub(crate) data_dir: std::path::PathBuf,
    pub(crate) external_launch: Option<ExternalRuntimeLaunch>,
}

pub(crate) use openagent_app::bootstrap::ExternalRuntimeLaunch;

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
