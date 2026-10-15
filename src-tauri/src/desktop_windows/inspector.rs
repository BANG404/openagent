//! Development inspector creation stays outside the first-paint path.

pub(crate) fn initialize(
    app: &tauri::App,
    is_workspace_window: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    // Keep diagnostics alongside the application without shipping an
    // inspector surface in release builds. The frontend route is also
    // guarded by import.meta.env.DEV.

    if !is_workspace_window {
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
    Ok(())
}
