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
        Some(selected_development_runtime(&staged, target)?)
    };
    #[cfg(not(debug_assertions))]
    let prepared: Option<std::path::PathBuf> = None;
    select_packaged_runtime_binary(binary, prepared.as_deref())
}

#[cfg(debug_assertions)]
fn selected_development_runtime(
    staged: &std::path::Path,
    target: &str,
) -> Result<std::path::PathBuf, String> {
    use sha2::{Digest, Sha256};
    let selection = std::path::PathBuf::from(format!("{}.selection.json", staged.display()));
    let bytes = match std::fs::read(&selection) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(staged.into()),
        Err(error) => {
            return Err(format!(
                "Cannot read development Runtime selection: {error}"
            ))
        }
    };
    let value: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Invalid development Runtime selection: {error}"))?;
    let digest = value["sha256"].as_str().unwrap_or_default();
    if value["schema_version"] != 1
        || digest.len() != 64
        || !digest
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err("Invalid development Runtime selection identity".into());
    }
    let root = staged
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .ok_or("Development Runtime has no repository root")?;
    let binary = root
        .join(".cache/development-runtime")
        .join(target)
        .join(digest)
        .join(if target.contains("windows") {
            "openagent-server.exe"
        } else {
            "openagent-server"
        });
    let candidate = std::fs::read(&binary)
        .map_err(|error| format!("Development Runtime candidate is unavailable: {error}"))?;
    if format!("{:x}", Sha256::digest(candidate)) != digest {
        return Err("Development Runtime candidate checksum mismatch".into());
    }
    Ok(binary)
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
    resource: Option<&crate::runtime_resource::InstalledRuntimeResource>,
) -> Result<(), String> {
    let inspection =
        crate::runtime_process::inspect_runtime_bootstrap(&spec.binary_path, &spec.openagent_home)
            .await?;
    if inspection.requires_persistence_transition() {
        return Err("Runtime startup refused incompatible persisted data; preserve its migration backup and complete the explicit startup transition".into());
    }
    supervisor.start(spec).await?;
    if let Some(resource) = resource.filter(|_| inspection.plugin_contract.is_some()) {
        if !supervisor
            .status()
            .await
            .is_some_and(|status| resource.matches_process_version(&status.version))
        {
            supervisor.stop().await?;
            return Err("Runtime binary version differs from its verified release identity".into());
        }
    }
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
    if primary_desktop_services {
        manager
            .recover_plugin_update(&launch.openagent_home)
            .await?;
    }
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
        match start_runtime_spec(
            &supervisor,
            spec_for(active.binary_path.clone()),
            Some(&active),
        )
        .await
        {
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
        let inspection = crate::runtime_process::inspect_runtime_bootstrap(
            &active.binary_path,
            &launch.openagent_home,
        )
        .await?;
        if inspection.plugin_contract.is_some() {
            // Startup already recovered any pending transaction. A completed
            // plugin migration cannot be undone by selecting an older binary.
            return Err(format!(
                "{}; automatic Runtime fallback is blocked after plugin transaction support; preserve the selected Runtime and plugin data for recovery",
                failures.join("; ")
            ));
        }
        if let Some(previous) = manager.rollback_active().await? {
            match start_runtime_spec(
                &supervisor,
                spec_for(previous.binary_path.clone()),
                Some(&previous),
            )
            .await
            {
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
    start_runtime_spec(&supervisor, spec_for(packaged), None)
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

    #[cfg(debug_assertions)]
    #[test]
    fn development_selection_requires_a_complete_verified_immutable_candidate() {
        use sha2::{Digest, Sha256};
        let root = tempfile::tempdir().unwrap();
        let staged = root.path().join("src-tauri/binaries/runtime.exe");
        std::fs::create_dir_all(staged.parent().unwrap()).unwrap();
        let digest = format!("{:x}", Sha256::digest(b"new Runtime"));
        let binary = root
            .path()
            .join(".cache/development-runtime/x86_64-pc-windows-msvc")
            .join(&digest)
            .join("openagent-server.exe");
        let selection = format!("{}.selection.json", staged.display());
        std::fs::write(
            &selection,
            serde_json::json!({"schema_version":1,"sha256":digest}).to_string(),
        )
        .unwrap();
        assert!(super::selected_development_runtime(&staged, "x86_64-pc-windows-msvc").is_err());
        std::fs::create_dir_all(binary.parent().unwrap()).unwrap();
        std::fs::write(&binary, b"new Runtime").unwrap();
        assert_eq!(
            super::selected_development_runtime(&staged, "x86_64-pc-windows-msvc").unwrap(),
            binary
        );
        std::fs::write(&binary, b"tampered").unwrap();
        assert!(super::selected_development_runtime(&staged, "x86_64-pc-windows-msvc").is_err());
        std::fs::write(
            &selection,
            r#"{"schema_version":1,"sha256":"../../outside"}"#,
        )
        .unwrap();
        assert!(super::selected_development_runtime(&staged, "x86_64-pc-windows-msvc").is_err());
    }

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
