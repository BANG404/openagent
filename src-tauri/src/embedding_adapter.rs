//! Packaged seed discovery for the supervised Runtime.

use tauri::{path::BaseDirectory, Manager};

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
