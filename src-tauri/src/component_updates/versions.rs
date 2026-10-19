use super::ComponentVersions;
use crate::frontend_resource::FrontendResourceManager;
use crate::runtime_process::RuntimeProcessSupervisor;
use crate::runtime_resource::RuntimeResourceManager;
use std::sync::Arc;
use tauri::State;

#[derive(serde::Serialize)]
pub(crate) struct OnboardingResourceStatus {
    frontend: &'static str,
    runtime: &'static str,
}

#[tauri::command]
pub(crate) async fn get_onboarding_resource_status(
    manager: State<'_, FrontendResourceManager>,
    runtime_manager: State<'_, RuntimeResourceManager>,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
) -> Result<OnboardingResourceStatus, String> {
    let development = cfg!(debug_assertions)
        && !std::env::var("OPENAGENT_BOOTSTRAP_TEST").is_ok_and(|value| value == "1");
    let frontend = if development {
        "development"
    } else {
        match manager.verify_active_selection() {
            Ok(Some(_)) => "verified",
            Ok(None) => "failed",
            Err(_) => "failed",
        }
    };
    let runtime = match supervisor.verified_status().await {
        Ok(Some(_)) if development => "development",
        Ok(Some(_)) => match runtime_manager.active_resource().await {
            Ok(Some(resource)) => {
                if supervisor
                    .launch_spec()
                    .await
                    .is_some_and(|spec| spec.binary_path == resource.binary_path)
                {
                    "verified"
                } else {
                    "failed"
                }
            }
            Ok(None) => "failed",
            Err(_) => "failed",
        },
        _ => "failed",
    };
    Ok(OnboardingResourceStatus { frontend, runtime })
}

#[tauri::command]
pub(crate) async fn get_component_versions(
    app: tauri::AppHandle,
    manager: State<'_, FrontendResourceManager>,
    runtime_manager: State<'_, RuntimeResourceManager>,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
) -> Result<ComponentVersions, String> {
    let shell_version = env!("CARGO_PKG_VERSION").to_string();
    let frontend_release = manager.active_version();
    let active_runtime = runtime_manager.active_resource().await?;
    let runtime_release = active_runtime
        .as_ref()
        .and_then(|resource| resource.release_version.clone());
    Ok(ComponentVersions {
        release: [
            Some(app.package_info().version.to_string()),
            frontend_release,
            runtime_release,
        ]
        .into_iter()
        .flatten()
        .filter_map(|version| semver::Version::parse(&version).ok())
        .max()
        .map(|version| version.to_string())
        .unwrap_or_else(|| shell_version.clone()),
        shell: shell_version.clone(),
        runtime: supervisor.status().await.map(|status| status.version),
    })
}
