//! Host-owned component activation: one graceful Runtime barrier coordinates
//! signed resource installation, process replacement, and WebView confirmation.

pub(crate) mod barrier;
pub(crate) mod frontend;
pub(crate) mod handoff;
pub(crate) mod runtime;
pub(crate) mod sources;
pub(crate) mod versions;

use crate::runtime_resource::InstalledRuntimeResource;
pub(crate) use barrier::acquire_component_update_barrier;
pub(crate) use frontend::{
    arm_frontend_confirmation_deadline, external_frontend_url, product_webview_url,
};
pub(crate) use runtime::validate_supervised_runtime_bootstrap;
pub(crate) use sources::{
    frontend_resource_manager, modular_update_channel, runtime_resource_manager,
};

#[derive(serde::Serialize)]
pub(crate) struct PreparedFrontendResource {
    pub(crate) version: String,
    pub(crate) current_version: String,
    pub(crate) update_available: bool,
}

#[derive(serde::Serialize)]
pub(crate) struct PreparedRuntimeResource {
    pub(crate) version: String,
    pub(crate) current_version: Option<String>,
    pub(crate) target: String,
    pub(crate) update_available: bool,
}

#[derive(serde::Serialize)]
pub(crate) struct ActivatedRuntimeResource {
    pub(crate) version: String,
    pub(crate) target: String,
    pub(crate) event_generation: u64,
}

#[derive(serde::Serialize)]
pub(crate) struct ComponentUpdateGate {
    pub(crate) ready: bool,
    pub(crate) active_count: usize,
}

#[derive(serde::Serialize)]
pub(crate) struct ComponentVersions {
    /// The user-facing product release identity.
    pub(crate) release: String,
    /// The packaged desktop shell identity.
    pub(crate) shell: String,
    /// The Runtime release identity, present only while the Runtime runs. The
    /// host never derives a frontend version: the running bundle identifies
    /// itself.
    pub(crate) runtime: Option<String>,
}

#[derive(Default)]
pub(crate) struct RuntimeUpdateState {
    pub(super) pending: tokio::sync::Mutex<Option<InstalledRuntimeResource>>,
    pub(super) lifecycle: tokio::sync::Mutex<()>,
    pub(super) component_update_active: tokio::sync::Mutex<bool>,
}
