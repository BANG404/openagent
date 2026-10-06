use super::ComponentVersions;
use crate::frontend_resource::FrontendResourceManager;
use crate::runtime_process::RuntimeProcessSupervisor;
use crate::runtime_resource::{InstalledRuntimeResource, RuntimeResourceManager};
use std::sync::Arc;
use tauri::State;

/// Resolve the Runtime release identity reported as component detail.
///
/// The supervised process only reports the crate version of the binary it runs,
/// and that is not a release identity: the packaged sidecar is built from an
/// unstamped SDK checkout, so every product release ships a Runtime that reports
/// the same crate version. The signed Runtime resource that delivers modular
/// Runtime updates publishes the product release version instead, so this
/// prefers that identity, then the resource's own version, and finally the
/// packaged shell release that the bundled sidecar ships inside.
fn runtime_release_identity(
    active: Option<&InstalledRuntimeResource>,
    shell_version: &str,
) -> String {
    let Some(resource) = active else {
        return shell_version.to_string();
    };
    resource
        .release_version
        .clone()
        .unwrap_or_else(|| resource.version.clone())
}

#[tauri::command]
pub(crate) async fn get_component_versions(
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
        // Frontend resource releases carry the product release version. This
        // lets a frontend-only release update the user-facing identity while
        // keeping the packaged shell version independent.
        release: frontend_release
            .or(runtime_release)
            .unwrap_or_else(|| shell_version.clone()),
        shell: shell_version.clone(),
        runtime: supervisor
            .status()
            .await
            .map(|_| runtime_release_identity(active_runtime.as_ref(), &shell_version)),
    })
}

#[cfg(test)]
mod runtime_identity_tests {
    use super::{runtime_release_identity, InstalledRuntimeResource};
    use std::path::PathBuf;

    fn resource(version: &str, release_version: Option<&str>) -> InstalledRuntimeResource {
        InstalledRuntimeResource {
            version: version.to_string(),
            release_version: release_version.map(str::to_string),
            target: "test-target".to_string(),
            binary_path: PathBuf::from("openagent-server"),
            manifest_path: PathBuf::from("openagent-sdk-manifest.json"),
            signature_path: PathBuf::from("openagent-sdk-manifest.json.sig"),
            protocol_min: 1,
            protocol_max: 1,
            size: 0,
            sha256: String::new(),
        }
    }

    #[test]
    fn identity_prefers_the_product_release_of_the_active_resource() {
        let installed = resource("1.4.0", Some("0.66.0"));
        assert_eq!(
            runtime_release_identity(Some(&installed), "0.65.1-beta.1"),
            "0.66.0"
        );
    }

    #[test]
    fn identity_falls_back_to_the_resource_version() {
        let installed = resource("1.4.0", None);
        assert_eq!(
            runtime_release_identity(Some(&installed), "0.65.1-beta.1"),
            "1.4.0"
        );
    }

    #[test]
    fn identity_falls_back_to_the_packaged_shell_release() {
        assert_eq!(
            runtime_release_identity(None, "0.65.1-beta.1"),
            "0.65.1-beta.1"
        );
    }
}
