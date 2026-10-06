//! Development inspector creation stays outside the first-paint path.
#[cfg(feature = "embedded-runtime")]
use openagent_runtime::{commands::start_dev_api, state::OpenAgentRuntime};
#[cfg(feature = "embedded-runtime")]
use std::sync::Arc;

pub(crate) fn initialize(
    app: &tauri::App,
    agent_server: bool,
    is_workspace_window: bool,
    #[cfg(feature = "embedded-runtime")] runtime: Option<&Arc<OpenAgentRuntime>>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Keep diagnostics alongside the application without shipping an
    // inspector surface in release builds. The frontend route is also
    // guarded by import.meta.env.DEV.

    if !is_workspace_window {
        #[cfg(feature = "embedded-runtime")]
        if let Some(runtime) = runtime {
            let result = tauri::async_runtime::block_on(async { start_dev_api(runtime.clone()) });
            if let Err(error) = result {
                tracing::warn!(%error, "OpenAgent dev API did not start");
            }
        }
        if !agent_server {
            // The inspector is a development-only utility and is not
            // part of the first-paint path. Queue its WebView after
            // setup so WebView initialization cannot delay the main
            // shell becoming visible.
            let inspector_app = app.handle().clone();
            let inspector_builder_app = inspector_app.clone();
            inspector_app
                .run_on_main_thread(move || {
                    if let Err(error) = tauri::WebviewWindowBuilder::new(
                        &inspector_builder_app,
                        "debug",
                        tauri::WebviewUrl::App("/?dev-inspector=1".into()),
                    )
                    .title("OpenAgent Dev Inspector")
                    .inner_size(980.0, 760.0)
                    .min_inner_size(720.0, 520.0)
                    .build()
                    {
                        tracing::warn!(%error, "failed to create OpenAgent dev inspector");
                    }
                })
                .map_err(std::io::Error::other)?;
        }
    }
    Ok(())
}
