use super::ExternalRuntimeLaunch;
use crate::component_updates::validate_supervised_runtime_bootstrap;
use crate::embedding_adapter::bundled_embedding_seed;
use crate::runtime_process::{RuntimeLaunchSpec, RuntimeProcessSupervisor};
use crate::runtime_resource::RuntimeResourceManager;
use crate::runtime_transport::RuntimeEventProxy;
use std::sync::Arc;
use tauri::Manager;

pub(crate) fn packaged_runtime_binary() -> Result<std::path::PathBuf, String> {
    let executable = std::env::current_exe()
        .map_err(|error| format!("Failed to resolve desktop executable path: {error}"))?;
    let directory = executable
        .parent()
        .ok_or_else(|| "Desktop executable has no parent directory".to_string())?;
    #[cfg(windows)]
    let name = "openagent-server.exe";
    #[cfg(not(windows))]
    let name = "openagent-server";
    let binary = directory.join(name);
    if !binary.is_file() {
        return Err(format!(
            "Packaged Runtime fallback is missing: {}",
            binary.display()
        ));
    }
    Ok(binary)
}

async fn start_runtime_spec(
    supervisor: &RuntimeProcessSupervisor,
    spec: RuntimeLaunchSpec,
) -> Result<(), String> {
    supervisor.start(spec).await?;
    if let Err(error) = validate_supervised_runtime_bootstrap(supervisor).await {
        let _ = supervisor.stop().await;
        return Err(error);
    }
    Ok(())
}

pub(crate) async fn start_external_desktop_runtime(
    app: &tauri::AppHandle,
    supervisor: Arc<RuntimeProcessSupervisor>,
    manager: &RuntimeResourceManager,
    launch: ExternalRuntimeLaunch,
    primary_desktop_services: bool,
) -> Result<(), String> {
    let spec_for = |binary_path| RuntimeLaunchSpec {
        binary_path,
        workspace: launch.workspace.clone(),
        openagent_home: launch.openagent_home.clone(),
        embedding_seed: bundled_embedding_seed(app),
        conversation_id: launch.conversation_id.clone(),
        message_id: launch.message_id.clone(),
        new_conversation: launch.new_conversation,
        primary_desktop_services,
    };
    let mut failures = Vec::new();
    if let Some(active) = manager.active_resource().await? {
        match start_runtime_spec(&supervisor, spec_for(active.binary_path.clone())).await {
            Ok(()) => {
                app.state::<RuntimeEventProxy>()
                    .start(app.clone(), supervisor)
                    .await?;
                return Ok(());
            }
            Err(error) => {
                failures.push(format!("active Runtime {} failed: {error}", active.version))
            }
        }
        if let Some(previous) = manager.rollback_active().await? {
            match start_runtime_spec(&supervisor, spec_for(previous.binary_path.clone())).await {
                Ok(()) => {
                    app.state::<RuntimeEventProxy>()
                        .start(app.clone(), supervisor)
                        .await?;
                    return Ok(());
                }
                Err(error) => failures.push(format!(
                    "previous Runtime {} failed: {error}",
                    previous.version
                )),
            }
        }
    }
    let packaged = packaged_runtime_binary()?;
    start_runtime_spec(&supervisor, spec_for(packaged))
        .await
        .map_err(|error| {
            failures.push(format!("packaged Runtime failed: {error}"));
            failures.join("; ")
        })?;
    app.state::<RuntimeEventProxy>()
        .start(app.clone(), supervisor)
        .await?;
    Ok(())
}
