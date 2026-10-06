//! Runtime host bridge available only in explicit embedded diagnostics.
use crate::desktop_windows::DESKTOP_WINDOW_ACTIVATED_EVENT;
use openagent_app::{load_embedding_model, EmbeddingResourceManager};
use openagent_runtime::state::{
    EmbeddingResourceStatus, OpenAgentRuntime, RuntimeAsset, RuntimeHost,
};
use std::sync::Arc;
use tauri::{Emitter, Manager};

#[cfg(feature = "embedded-runtime")]
pub(crate) struct TauriRuntimeHost {
    pub(crate) app: tauri::AppHandle,
    pub(crate) embedding_resource: EmbeddingResourceManager,
    pub(crate) embedding_seed: Option<std::path::PathBuf>,
}

#[cfg(feature = "embedded-runtime")]
#[async_trait::async_trait]
impl RuntimeHost for TauriRuntimeHost {
    fn translate(&self, key: &str, fallback: &str) -> String {
        use tauri_plugin_i18n::PluginI18nExt;

        self.app
            .i18n()
            .translate(key)
            .filter(|translated| *translated != key)
            .unwrap_or(fallback)
            .to_string()
    }

    fn open_path(&self, path: &std::path::Path) -> Result<(), String> {
        use tauri_plugin_opener::OpenerExt;

        self.app
            .opener()
            .open_path(path.to_string_lossy().into_owned(), None::<&str>)
            .map_err(|error| error.to_string())
    }

    fn activate_workspace_window(&self, context: serde_json::Value) -> Result<(), String> {
        let window = self
            .app
            .get_webview_window("main")
            .ok_or_else(|| "Main window is unavailable".to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        self.app
            .emit_to("main", "workspace-window-open-request", context)
            .map_err(|error| error.to_string())?;
        window
            .emit(DESKTOP_WINDOW_ACTIVATED_EVENT, ())
            .map_err(|error| error.to_string())
    }

    fn frontend_asset(&self, path: &str) -> Option<RuntimeAsset> {
        self.app
            .asset_resolver()
            .get(path.to_string())
            .map(|asset| RuntimeAsset {
                bytes: asset.bytes,
                mime_type: asset.mime_type,
            })
    }

    async fn embedding_resource_status(
        &self,
        runtime: Arc<OpenAgentRuntime>,
    ) -> Result<EmbeddingResourceStatus, String> {
        let resource = self.embedding_resource.status().await;
        if resource.ready() && runtime.state().embedding_model.lock().await.is_none() {
            load_embedding_model(runtime, self.embedding_resource.model_dir().to_path_buf())
                .await?;
        }
        Ok(resource)
    }

    async fn prepare_embedding_resource(
        &self,
        runtime: Arc<OpenAgentRuntime>,
    ) -> Result<EmbeddingResourceStatus, String> {
        let events = runtime.state().events.clone();
        let installed = self
            .embedding_resource
            .prepare(self.embedding_seed.clone(), move |progress| {
                if let Err(error) = events.emit("embedding-resource-progress", progress) {
                    tracing::warn!(%error, "failed to emit embedding resource progress");
                }
            })
            .await?;
        load_embedding_model(runtime, self.embedding_resource.model_dir().to_path_buf()).await?;
        Ok(installed)
    }
}

use crate::cua_driver::{ensure_cua_driver_serve, ensure_declared_plugin_daemons};
use crate::embedding_adapter::bundled_embedding_seed;
use openagent_runtime::commands::start_remote_gateway;
use openagent_runtime::{mcp, tools};

/// Connect native facilities and schedule embedded diagnostic startup work.
pub(crate) fn install(
    app: &tauri::AppHandle,
    runtime: &Arc<OpenAgentRuntime>,
    agent_server: bool,
    is_workspace_window: bool,
    startup_started_at: std::time::Instant,
) {
    let _ = runtime.set_host(Arc::new(TauriRuntimeHost {
        app: app.clone(),
        embedding_resource: EmbeddingResourceManager::default(),
        embedding_seed: bundled_embedding_seed(app),
    }));
    tauri::async_runtime::spawn(openagent_runtime::commands::watch_config(runtime.clone()));
    let mut runtime_events = runtime.subscribe();
    let event_app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            match runtime_events.recv().await {
                Ok(event) => {
                    if let Err(error) = event_app.emit(&event.name, event.payload) {
                        tracing::warn!(
                            event = %event.name,
                            %error,
                            "failed to project runtime event to Tauri"
                        );
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                    tracing::warn!(skipped, "Tauri runtime-event adapter lagged behind");
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });
    if !is_workspace_window {
        tauri::async_runtime::block_on(async {
            openagent_runtime::channels::start_channel_supervisor(
                runtime.clone(),
                openagent_runtime::config::config_dir(),
            );
        });
        let gateway_runtime = runtime.clone();
        let result =
            tauri::async_runtime::block_on(async { start_remote_gateway(gateway_runtime) });
        if let Err(error) = result {
            tracing::warn!(%error, "OpenAgent remote gateway did not start");
        }
    }
    if !agent_server && !is_workspace_window {
        let restore_runtime = runtime.clone();
        tauri::async_runtime::spawn(async move {
            match tools::restore_scheduled_chat_hooks(restore_runtime).await {
                Ok(count) if count > 0 => {
                    tracing::info!(target: "openagent::app", count, "restored scheduled chat hooks");
                }
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(target: "openagent::app", error = %e, "scheduled chat hook restoration failed")
                }
            }
        });
    }
    schedule_mcp_connections(runtime.clone(), startup_started_at);
}

fn schedule_mcp_connections(
    startup_runtime: Arc<OpenAgentRuntime>,
    startup_started_at: std::time::Instant,
) {
    // MCP transports may spawn subprocesses or establish network
    // connections. Keep all of that work off Tauri's main-thread setup
    // path so the webview can begin bootstrapping immediately.
    tauri::async_runtime::spawn(async move {
        let state = startup_runtime.state();
        let config = state.config.lock().await.clone();
        let servers = openagent_runtime::commands::effective_mcp_servers(state, &config).await;
        ensure_declared_plugin_daemons(startup_runtime.clone()).await;
        if servers
            .iter()
            .any(|server| server.id == "cua-driver" && server.enabled)
        {
            if let Err(error) = ensure_cua_driver_serve(startup_runtime.clone()).await {
                tracing::error!(target: "openagent::cua", %error, "failed to start configured Cua Driver serve daemon");
            }
        }
        let launch = state.plugin_process_launch().await;
        let mcp_handles = mcp::connect_mcp_servers(&servers, Some(&launch));
        *state.mcp_join_handles.lock().await = mcp_handles;
        tracing::info!(
            target: "openagent::startup",
            elapsed_ms = startup_started_at.elapsed().as_millis() as u64,
            "MCP connections scheduled"
        );
    });
}
