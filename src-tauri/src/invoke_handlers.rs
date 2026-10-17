//! IPC registration uses the defining adapter module and preserves command names.
use crate::{
    component_updates, desktop_exit, desktop_windows, diagnostics, native_commands, plugin_daemons,
    runtime_proxy_commands,
};

#[allow(clippy::too_many_lines)]
pub(crate) fn register(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    let builder = builder.invoke_handler(tauri::generate_handler![
        plugin_daemons::agent_plugin_daemon_running,
        crate::desktop_bootstrap::provisioning::prepare_release_resources,
        crate::desktop_bootstrap::provisioning::shell_resource_status,
        crate::desktop_bootstrap::provisioning::set_shell_setup_appearance,
        crate::desktop_bootstrap::provisioning::retry_shell_resources,
        component_updates::versions::get_component_versions,
        component_updates::versions::get_onboarding_resource_status,
        component_updates::runtime::prepare_runtime_resource,
        component_updates::barrier::begin_component_update,
        component_updates::handoff::prepare_shell_handoff,
        component_updates::barrier::end_component_update,
        component_updates::runtime::activate_runtime_resource,
        runtime_proxy_commands::runtime_transport_mode,
        runtime_proxy_commands::proxy_runtime_request,
        runtime_proxy_commands::start_runtime_event_proxy,
        runtime_proxy_commands::stop_runtime_event_proxy,
        component_updates::frontend::prepare_frontend_resource,
        component_updates::frontend::activate_frontend_resource,
        component_updates::frontend::confirm_frontend_activation,
        diagnostics::report_component_update_event,
        diagnostics::report_frontend_diagnostic,
        native_commands::list_wsl_distributions,
        native_commands::get_wsl_home,
        native_commands::resolve_wsl_workspace,
        native_commands::open_workspace_window,
        native_commands::create_workspace_window,
        native_commands::get_system_locale,
        native_commands::open_path,
        native_commands::open_logs_folder,
        native_commands::read_text_file,
        native_commands::save_download_file,
        desktop_exit::restart_app,
        desktop_exit::begin_shell_install,
        desktop_exit::quit_app,
        desktop_exit::desktop_exit_progress,
        desktop_exit::desktop_exit_presented,
        desktop_windows::focus::is_desktop_window_active,
        desktop_windows::reveal_main_window,
        desktop_windows::reveal_onboarding_window,
        desktop_windows::utility::open_role_editor_window,
        desktop_windows::utility::open_settings_window,
    ]);
    builder
}
