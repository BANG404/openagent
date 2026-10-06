//! Tauri plugin composition preserves native initialization order.
use crate::desktop_bootstrap::instances::{
    should_enforce_single_instance, should_install_desktop_integrations,
    should_install_desktop_tray,
};
use crate::desktop_windows::{
    handle_desktop_menu_event, single_instance_window_label, DESKTOP_WINDOW_ACTIVATED_EVENT,
};
use tauri::{Emitter, Manager};

pub(crate) fn register_base(
    builder: tauri::Builder<tauri::Wry>,
    agent_server: bool,
    is_workspace_window: bool,
    development_multi_instance: bool,
) -> tauri::Builder<tauri::Wry> {
    // This must remain the first registered plugin for ordinary desktop
    // launches. Explicit debug multi-instance runs skip it so each named
    // automation fixture can own an independent process.
    #[cfg(desktop)]
    let builder = if should_enforce_single_instance(
        agent_server,
        is_workspace_window,
        development_multi_instance,
    ) {
        builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let onboarding_visible = app
                .get_webview_window("onboarding")
                .and_then(|window| window.is_visible().ok())
                .unwrap_or(false);
            if let Some(window) =
                app.get_webview_window(single_instance_window_label(onboarding_visible))
            {
                let _ = window.unminimize();
                let _ = window.show();
                if window.set_focus().is_ok() {
                    let _ = window.emit(DESKTOP_WINDOW_ACTIVATED_EVENT, ());
                }
            }
        }))
    } else {
        builder
    };

    let builder = register_window_state(
        builder,
        agent_server,
        is_workspace_window,
        development_multi_instance,
    );
    // Pilot exposes its named-pipe automation bridge only in debug builds and
    // becomes a no-op plugin in release builds.
    let builder = builder.plugin(tauri_plugin_pilot::init());

    #[cfg(desktop)]
    let builder = if should_install_desktop_tray(
        agent_server,
        is_workspace_window,
        development_multi_instance,
    ) {
        builder.on_menu_event(|app, event| handle_desktop_menu_event(app, &event))
    } else {
        builder
    };

    builder
}

fn register_window_state(
    builder: tauri::Builder<tauri::Wry>,
    agent_server: bool,
    is_workspace_window: bool,
    development_multi_instance: bool,
) -> tauri::Builder<tauri::Wry> {
    // Persist the primary process's desktop geometry. On-demand utility
    // windows opt out of the automatic ready-hook restore so their first-open
    // placement remains relative to the requesting workspace; they explicitly
    // restore saved state after that fallback has been calculated.
    #[cfg(desktop)]
    let builder = if should_enforce_single_instance(
        agent_server,
        is_workspace_window,
        development_multi_instance,
    ) {
        builder.plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .with_denylist(&["onboarding", "quick-chat", "debug"])
                .skip_initial_state("role-editor")
                .skip_initial_state("settings-general")
                .skip_initial_state("settings-models")
                .skip_initial_state("settings-agent")
                .skip_initial_state("settings-integrations")
                .skip_initial_state("settings-memory")
                .skip_initial_state("settings-about")
                .build(),
        )
    } else {
        builder
    };

    builder
}

pub(crate) fn register_integrations(
    builder: tauri::Builder<tauri::Wry>,
    agent_server: bool,
    development_multi_instance: bool,
) -> tauri::Builder<tauri::Wry> {
    #[cfg(desktop)]
    let builder = if should_install_desktop_integrations(agent_server, development_multi_instance) {
        builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
    } else {
        builder
    };

    #[cfg(desktop)]
    let builder = if should_install_desktop_integrations(agent_server, development_multi_instance) {
        builder.plugin(tauri_plugin_updater::Builder::new().build())
    } else {
        builder
    };

    #[cfg(desktop)]
    let builder = if should_install_desktop_integrations(agent_server, development_multi_instance) {
        builder.plugin(tauri_plugin_global_shortcut::Builder::new().build())
    } else {
        builder
    };

    builder
}
