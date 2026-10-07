//! Construct initial native surfaces before arming frontend confirmation.
use super::apply_native_window_material;
use crate::component_updates::product_webview_url;
use crate::desktop_bootstrap::instances::should_install_desktop_tray;
use crate::frontend_resource::FrontendResourceManager;
use tauri::Manager;

pub(crate) fn initialize(
    app: &tauri::AppHandle,
    startup_frontend_manager: &FrontendResourceManager,
    agent_server: bool,
    is_workspace_window: bool,
    development_multi_instance: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(window) = app.get_webview_window("main") {
        apply_native_window_material(&window);
        if should_install_desktop_tray(
            agent_server,
            is_workspace_window,
            development_multi_instance,
        ) {
            let close_window = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = close_window.hide();
                }
            });
        }
    }

    if !agent_server && !is_workspace_window {
        if app.get_webview_window("onboarding").is_none() {
            let onboarding_window = tauri::WebviewWindowBuilder::new(
                app,
                "onboarding",
                product_webview_url(startup_frontend_manager, "?onboarding-window=1")
                    .map_err(std::io::Error::other)?,
            )
            .title("OpenAgent Setup")
            .inner_size(840.0, 560.0)
            .decorations(false)
            .transparent(true)
            .resizable(false)
            .maximizable(false)
            .center()
            .visible(false)
            .build()?;
            apply_native_window_material(&onboarding_window);
        }

        let quick_chat_app = app.clone();
        let quick_chat_url = product_webview_url(startup_frontend_manager, "?quick-chat-window=1")
            .map_err(std::io::Error::other)?;
        let quick_chat_builder_app = quick_chat_app.clone();
        quick_chat_app
            .run_on_main_thread(move || {
                if quick_chat_builder_app
                    .get_webview_window("quick-chat")
                    .is_some()
                {
                    return;
                }
                if let Err(error) = tauri::WebviewWindowBuilder::new(
                    &quick_chat_builder_app,
                    "quick-chat",
                    quick_chat_url,
                )
                .title("OpenAgent Quick Chat")
                .inner_size(856.0, 246.0)
                .min_inner_size(760.0, 246.0)
                .decorations(false)
                .transparent(true)
                .resizable(false)
                .always_on_top(true)
                .shadow(false)
                .visible(false)
                .build()
                {
                    tracing::warn!(%error, "failed to create OpenAgent quick chat window");
                }
            })
            .map_err(std::io::Error::other)?;
    }

    Ok(())
}
