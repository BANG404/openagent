//! Tauri resource adapter for public product-owned Runtime supervision.
pub use openagent_app::runtime_process::{
    RuntimeBootstrapInspection, RuntimeConnection, RuntimeLaunchSpec, RuntimeProcessSupervisor,
    DESKTOP_RUNTIME_PROTOCOL_VERSION,
};

pub(crate) fn configure_runtime_command(command: &mut std::process::Command) -> Result<(), String> {
    crate::node_runtime::configure(command)?;
    crate::terminal_tools::configure(command)
}

pub(crate) async fn inspect_runtime_bootstrap(
    binary_path: &std::path::Path,
    openagent_home: &std::path::Path,
) -> Result<RuntimeBootstrapInspection, String> {
    openagent_app::runtime_process::inspect_runtime_bootstrap_with_setup(
        binary_path,
        openagent_home,
        configure_runtime_command,
    )
    .await
}
