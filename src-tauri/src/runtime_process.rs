//! Tauri resource adapter for public product-owned Runtime supervision.
pub use openagent_app::runtime_process::{
    RuntimeBootstrapInspection, RuntimeConnection, RuntimeLaunchSpec, RuntimeProcessSupervisor,
    DESKTOP_RUNTIME_PROTOCOL_VERSION,
};

pub(crate) fn configure_runtime_policy_context(command: &mut std::process::Command) {
    command.env("OPENAGENT_POLICY_SHELL_VERSION", env!("CARGO_PKG_VERSION"));
    command.env_remove("OPENAGENT_POLICY_PREVIOUS_RUNTIME");
    command.env("OPENAGENT_POLICY_OPERATION", "startup");
}

pub(crate) fn configure_runtime_command(command: &mut std::process::Command) -> Result<(), String> {
    configure_runtime_policy_context(command);
    crate::node_runtime::configure(command)?;
    crate::terminal_tools::configure(command)
}

pub(crate) async fn inspect_runtime_update_bootstrap(
    binary_path: &std::path::Path,
    openagent_home: &std::path::Path,
    previous_runtime: &str,
) -> Result<RuntimeBootstrapInspection, String> {
    openagent_app::runtime_process::inspect_runtime_bootstrap_with_policy_context(
        binary_path,
        openagent_home,
        Some(previous_runtime),
        configure_runtime_command,
    )
    .await
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
