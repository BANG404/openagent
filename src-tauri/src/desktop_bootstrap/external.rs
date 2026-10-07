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
    #[cfg(debug_assertions)]
    let prepared = {
        let target = match crate::runtime_resource::current_runtime_resource_target()? {
            "windows-x64" => "x86_64-pc-windows-msvc",
            "linux-x64" => "x86_64-unknown-linux-gnu",
            "macos-x64" => "x86_64-apple-darwin",
            "macos-arm64" => "aarch64-apple-darwin",
            _ => return Err("Unsupported development Runtime platform".into()),
        };
        let extension = if cfg!(windows) { ".exe" } else { "" };
        let staged = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!("openagent-server-{target}{extension}"));
        Some(staged)
    };
    #[cfg(not(debug_assertions))]
    let prepared: Option<std::path::PathBuf> = None;
    select_packaged_runtime_binary(binary, prepared.as_deref())
}

fn select_packaged_runtime_binary(
    packaged: std::path::PathBuf,
    prepared: Option<&std::path::Path>,
) -> Result<std::path::PathBuf, String> {
    if let Some(prepared) = prepared.filter(|path| path.is_file()) {
        return Ok(prepared.to_path_buf());
    }
    if !packaged.is_file() {
        return Err(format!(
            "Packaged Runtime fallback is missing: {}",
            packaged.display()
        ));
    }
    Ok(packaged)
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

#[cfg(test)]
mod tests {
    use super::select_packaged_runtime_binary;

    #[test]
    fn prepared_development_runtime_wins_over_an_existing_packaged_copy() {
        let directory = tempfile::tempdir().unwrap();
        let packaged = directory.path().join("packaged-server");
        let prepared = directory.path().join("prepared-server");
        std::fs::write(&packaged, "older Runtime").unwrap();
        std::fs::write(&prepared, "current Runtime").unwrap();

        assert_eq!(
            select_packaged_runtime_binary(packaged.clone(), Some(&prepared)).unwrap(),
            prepared
        );
        assert_eq!(
            select_packaged_runtime_binary(packaged.clone(), None).unwrap(),
            packaged
        );
    }

    #[test]
    fn missing_prepared_runtime_uses_the_packaged_copy_or_reports_its_absence() {
        let directory = tempfile::tempdir().unwrap();
        let packaged = directory.path().join("packaged-server");
        let prepared = directory.path().join("missing-prepared-server");
        std::fs::write(&packaged, "packaged Runtime").unwrap();
        assert_eq!(
            select_packaged_runtime_binary(packaged.clone(), Some(&prepared)).unwrap(),
            packaged
        );
        std::fs::remove_file(&packaged).unwrap();
        assert!(select_packaged_runtime_binary(packaged, Some(&prepared)).is_err());
    }
}
