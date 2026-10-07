//! Packaged seed discovery and explicit embedded resource commands.
#[cfg(feature = "embedded-runtime")]
use openagent_runtime::state::{EmbeddingResourceStatus, OpenAgentRuntime};
#[cfg(feature = "embedded-runtime")]
use std::sync::Arc;
#[cfg(feature = "embedded-runtime")]
use tauri::State;
use tauri::{path::BaseDirectory, Manager};

#[cfg(feature = "embedded-runtime")]
pub(crate) struct EmbeddedRuntimeState(pub(crate) Option<Arc<OpenAgentRuntime>>);

const EMBEDDING_MODEL_RESOURCE_PATH: &str = "models/all-MiniLM-L6-v2-q";
pub(crate) fn bundled_embedding_seed(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    if let Some(state) =
        app.try_state::<crate::desktop_bootstrap::provisioning::ProvisioningState>()
    {
        if let Ok(seed) = state.embedding_seed.lock() {
            if let Some(seed) = seed.as_ref() {
                return Some(seed.clone());
            }
        }
    }
    #[cfg(debug_assertions)]
    {
        let source = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(EMBEDDING_MODEL_RESOURCE_PATH);
        if source.is_dir() {
            return Some(source);
        }
    }

    app.path()
        .resolve(EMBEDDING_MODEL_RESOURCE_PATH, BaseDirectory::Resource)
        .ok()
        .filter(|path| path.is_dir())
}

#[tauri::command]
#[cfg(feature = "embedded-runtime")]
pub(crate) async fn get_embedding_resource_status(
    runtime: State<'_, EmbeddedRuntimeState>,
) -> Result<EmbeddingResourceStatus, String> {
    runtime
        .0
        .as_ref()
        .ok_or_else(|| "Embedding resources are owned by the external Runtime".to_string())?
        .embedding_resource_status()
        .await
}

#[tauri::command]
#[cfg(feature = "embedded-runtime")]
pub(crate) async fn prepare_embedding_resource(
    runtime: State<'_, EmbeddedRuntimeState>,
) -> Result<EmbeddingResourceStatus, String> {
    runtime
        .0
        .as_ref()
        .ok_or_else(|| "Embedding resources are owned by the external Runtime".to_string())?
        .prepare_embedding_resource()
        .await
}

#[cfg(all(test, feature = "embedded-runtime"))]
mod tests {
    use super::*;
    use openagent_app::EmbeddingResourceManager;
    use std::path::Path;
    #[cfg(feature = "embedded-runtime")]
    #[test]
    fn bundled_embedding_model_runs_offline() {
        let model_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(EMBEDDING_MODEL_RESOURCE_PATH);
        let model = openagent_runtime::embedding::load_bundled_model(model_dir)
            .expect("bundled model should load");
        let embeddings = model
            .embed(
                vec![
                    "A desktop agent remembers useful context.",
                    "桌面智能体会记住有用的上下文。",
                ],
                None,
            )
            .expect("bundled model should produce embeddings");

        assert_eq!(embeddings.len(), 2);
        assert!(embeddings.iter().all(|embedding| embedding.len() == 384));
        assert!(embeddings
            .iter()
            .flatten()
            .all(|component| component.is_finite()));
    }

    #[cfg(feature = "embedded-runtime")]
    #[test]
    fn bundled_embedding_seed_installs_the_persistent_resource() {
        let seed = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(EMBEDDING_MODEL_RESOURCE_PATH);
        let fixture = std::env::temp_dir().join(format!(
            "openagent-embedding-install-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let manager = EmbeddingResourceManager::new(fixture.clone());
        let installed = tauri::async_runtime::block_on(manager.prepare(Some(seed), |_| {}))
            .expect("bundled seed should install");

        assert!(installed.ready());
        openagent_runtime::embedding::load_bundled_model(manager.model_dir().to_path_buf())
            .expect("installed resource should load offline");
        std::fs::remove_dir_all(fixture).expect("embedding fixture should be removable");
    }

    #[cfg(feature = "embedded-runtime")]
    #[test]
    #[ignore = "requires GitHub access and downloads the 23.7 MB embedding resource"]
    fn embedding_resource_downloads_and_loads_from_github() {
        let fixture = std::env::temp_dir().join(format!(
            "openagent-embedding-download-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let manager = EmbeddingResourceManager::new(fixture.clone());
        let installed = tauri::async_runtime::block_on(manager.prepare(None, |_| {}))
            .expect("GitHub embedding resource should install");

        assert!(installed.ready());
        openagent_runtime::embedding::load_bundled_model(manager.model_dir().to_path_buf())
            .expect("downloaded resource should load offline");
        std::fs::remove_dir_all(fixture).expect("embedding fixture should be removable");
    }
}
