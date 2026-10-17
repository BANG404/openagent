use std::sync::Arc;
use tauri::Manager;

mod embedding_adapter;
mod resource_download;

mod desktop_bootstrap;
mod desktop_plugins;

mod invoke_handlers;
mod native_commands;
mod node_runtime;
mod runtime_proxy_commands;
mod terminal_tools;
use desktop_bootstrap::instances::*;
use desktop_bootstrap::{
    prepare_host_runtime, prepare_interactive_persistence, start_external_desktop_runtime,
    HostRuntimeBootstrap,
};
mod component_updates;
use component_updates::{
    arm_frontend_confirmation_deadline, frontend_resource_manager, modular_update_channel,
    runtime_resource_manager, RuntimeUpdateState,
};
mod plugin_daemons;
use plugin_daemons::stop_plugin_daemons;
mod desktop_windows;
#[cfg(desktop)]
use desktop_windows::install_desktop_tray;
#[cfg(target_os = "macos")]
use desktop_windows::show_desktop_window;
mod desktop_exit;
mod diagnostics;
use desktop_exit::{
    install_dev_parent_shutdown_monitor, install_parent_shutdown_monitor, DesktopWindowState,
};
use diagnostics::init_host_tracing;

pub mod frontend_resource;
pub mod local_capabilities;
mod plugin_daemon_supervisor;
pub mod process_lifetime;
pub mod runtime_asset_protocol;
pub mod runtime_process;
pub mod runtime_resource;
pub mod runtime_transport;
pub mod workspace_process;
pub mod wsl;

use runtime_process::{RuntimeProcessSupervisor, DESKTOP_RUNTIME_PROTOCOL_VERSION};
use runtime_transport::RuntimeEventProxy;
use workspace_process::{
    is_parent_controlled_workspace_window_process, is_workspace_window_process,
};

#[derive(Clone)]
pub(crate) struct DesktopDataDir(std::path::PathBuf);

#[cfg(all(test, windows))]
unsafe extern "C" {
    fn openagent_link_windows_test_manifest();
}

#[cfg(all(test, windows))]
#[test]
fn windows_test_harness_uses_common_controls_v6() {
    unsafe { openagent_link_windows_test_manifest() };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(clippy::too_many_lines)]
pub fn run() {
    // NOSONAR: this protocol or state boundary is intentionally kept together for auditability.
    let shell_provisioning = !cfg!(debug_assertions)
        || std::env::var("OPENAGENT_BOOTSTRAP_TEST").is_ok_and(|value| value == "1");
    let external_launch = if !shell_provisioning {
        match prepare_interactive_persistence() {
            Ok(Some(launch)) => Some(launch),
            Ok(None) => return,
            Err(error) => {
                rfd::MessageDialog::new()
                    .set_level(rfd::MessageLevel::Error)
                    .set_title("OpenAgent 升级失败 / Upgrade failed")
                    .set_description(format!(
                        "未修改无法安全备份的数据。请手动备份应用数据目录后重试。\n\nNo data that could not be safely backed up was replaced. Back up the application data directory manually, then try again.\n\n{error:#}"
                    ))
                    .set_buttons(rfd::MessageButtons::Ok)
                    .show();
                panic!("Failed to prepare OpenAgent persistence transition: {error:#}");
            }
        }
    } else {
        None
    };
    let startup_started_at = std::time::Instant::now();
    let is_workspace_window = is_workspace_window_process();
    let development_multi_instance = is_development_multi_instance();
    let HostRuntimeBootstrap {
        initial_locale,
        data_dir,
        external_launch,
    } = prepare_host_runtime(external_launch)
        .unwrap_or_else(|error| panic!("Failed to initialize OpenAgent runtime: {error:#}"));

    init_host_tracing(&data_dir);
    tracing::info!(
        target: "openagent::component_update",
        component = "shell",
        current_version = env!("CARGO_PKG_VERSION"),
        channel = modular_update_channel(),
        "desktop component identity initialized"
    );

    let frontend_manager = frontend_resource_manager(data_dir.clone())
        .unwrap_or_else(|error| panic!("Failed to initialize frontend resources: {error}"));
    let frontend_protocol_root = frontend_manager.asset_root();
    let startup_frontend_manager = frontend_manager.clone();
    let desktop_data_dir = DesktopDataDir(data_dir.clone());
    let runtime_supervisor = Arc::new(
        RuntimeProcessSupervisor::new(
            DESKTOP_RUNTIME_PROTOCOL_VERSION,
            crate::runtime_process::configure_runtime_command,
        )
        .unwrap_or_else(|error| panic!("Failed to initialize Runtime supervisor: {error}")),
    );
    let startup_runtime_supervisor = runtime_supervisor.clone();
    let protocol_runtime_supervisor = runtime_supervisor.clone();
    let runtime_manager = runtime_resource_manager(data_dir);
    let startup_runtime_manager = runtime_manager.clone();
    let builder = tauri::Builder::default()
        .manage(desktop_data_dir)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<DesktopWindowState>().exit_in_progress() {
                    api.prevent_close();
                }
            }
        });

    let builder =
        desktop_plugins::register_base(builder, is_workspace_window, development_multi_instance);

    let builder = builder
        .register_asynchronous_uri_scheme_protocol(
            frontend_resource::FRONTEND_SCHEME,
            move |_context, request, responder| {
                let root = frontend_protocol_root.clone();
                tauri::async_runtime::spawn(async move {
                    responder.respond(frontend_resource::serve(request, root).await);
                });
            },
        )
        .register_asynchronous_uri_scheme_protocol(
            runtime_asset_protocol::SCHEME,
            move |_context, request, responder| {
                let supervisor = protocol_runtime_supervisor.clone();
                tauri::async_runtime::spawn(async move {
                    responder.respond(runtime_asset_protocol::serve(request, &supervisor).await);
                });
            },
        )
        .plugin(tauri_plugin_i18n::init(Some(initial_locale)));

    let builder = desktop_plugins::register_integrations(builder, development_multi_instance);

    let mut context = tauri::generate_context!();
    desktop_bootstrap::provisioning::configure_packaged_release(&mut context)
        .unwrap_or_else(|error| panic!("Invalid packaged release identity: {error}"));
    if development_multi_instance {
        let instance_name = std::env::var("OPENAGENT_DEV_INSTANCE").ok();
        context.config_mut().identifier = development_instance_identifier(instance_name.as_deref());
    }
    #[cfg(debug_assertions)]
    if shell_provisioning {
        if let Some(window) = context
            .config_mut()
            .app
            .windows
            .iter_mut()
            .find(|window| window.label == "main")
        {
            window.url = tauri::WebviewUrl::App("bootstrap".into());
        }
    }
    if shell_provisioning {
        if let Some(window) = context
            .config_mut()
            .app
            .windows
            .iter_mut()
            .find(|window| window.label == "main")
        {
            // Installed resources start behind this window. Only first-use
            // preparation or an actionable failure may reveal the bootstrap.
            window.visible = false;
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(main_window) = context
            .config_mut()
            .app
            .windows
            .iter_mut()
            .find(|window| window.label == "main")
        {
            main_window.decorations = true;
            main_window.transparent = false;
        }
    }

    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init());

    let builder = builder
        .manage(runtime_supervisor)
        .manage(RuntimeEventProxy::default())
        .manage(desktop_bootstrap::provisioning::ProvisioningState::default())
        .manage(RuntimeUpdateState::default())
        .manage(DesktopWindowState::default())
        .manage(runtime_manager)
        .manage(frontend_manager)
        .setup(move |app| {
            node_runtime::initialize(app.handle()).map_err(std::io::Error::other)?;
            terminal_tools::initialize(app.handle()).map_err(std::io::Error::other)?;
            if is_parent_controlled_workspace_window_process() {
                install_parent_shutdown_monitor(app.handle().clone());
            } else if cfg!(debug_assertions)
                && std::env::var_os("OPENAGENT_DEV_PARENT_LIFETIME")
                    .is_some_and(|value| !value.is_empty())
            {
                install_dev_parent_shutdown_monitor(app.handle().clone());
            }

            tracing::info!(
                target: "openagent::startup",
                elapsed_ms = startup_started_at.elapsed().as_millis() as u64,
                "Tauri setup started"
            );

            if let Some(launch) = external_launch.clone() {
                tauri::async_runtime::block_on(start_external_desktop_runtime(
                    app.handle(),
                    startup_runtime_supervisor.clone(),
                    &startup_runtime_manager,
                    launch,
                    should_start_primary_desktop_services(
                        is_workspace_window,
                        development_multi_instance,
                    ),
                ))
                .map_err(std::io::Error::other)?;
            }

            #[cfg(desktop)]
            if should_install_desktop_tray(is_workspace_window, development_multi_instance) {
                install_desktop_tray(app)?;
            }

            desktop_windows::startup::initialize_main_window(
                app.handle(),
                is_workspace_window,
                development_multi_instance,
            );

            if !shell_provisioning {
                desktop_windows::startup::initialize(
                    app.handle(),
                    &startup_frontend_manager,
                    is_workspace_window,
                    development_multi_instance,
                )?;
            } else if app.get_webview_window("main").is_some() {
                // The embedded frontend starts with a neutral loading shell.
                // Show it before resource validation, persistence inspection or
                // Runtime readiness; none of those may strand a tray-only app.
                desktop_windows::reveal_main_window(
                    app.handle().clone(),
                    app.state::<DesktopWindowState>(),
                )
                .map_err(std::io::Error::other)?;
                tracing::info!(
                    target: "openagent::startup",
                    elapsed_ms = startup_started_at.elapsed().as_millis() as u64,
                    "startup loading window revealed"
                );
                let provisioning_app = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) =
                        desktop_bootstrap::provisioning::provision(provisioning_app, None).await
                    {
                        tracing::warn!(%error, "shell resource preparation needs retry");
                    }
                });
            }
            #[cfg(debug_assertions)]
            if !shell_provisioning {
                desktop_windows::inspector::initialize(app, is_workspace_window)?;
            }

            // A previous process that ended with a frontend activation pending —
            // the shell installer replacing it is the ordinary case — did not
            // disprove that candidate, so this process serves it. Give it the
            // same deadline an in-process activation gets, now that the windows
            // that will confirm it exist.
            if !cfg!(debug_assertions) && !shell_provisioning {
                if let Some(pending) = startup_frontend_manager.pending_confirmation_version() {
                    arm_frontend_confirmation_deadline(
                        app.handle().clone(),
                        startup_frontend_manager.clone(),
                        pending,
                        "startup_confirmation_timed_out",
                    );
                }
            }

            if !shell_provisioning {
                if let Some(window) = app.get_webview_window("main") {
                    window.show()?;
                    window.set_focus()?;
                    app.state::<DesktopWindowState>()
                        .startup_window_revealed
                        .store(true, std::sync::atomic::Ordering::Release);
                    tracing::info!(
                        target: "openagent::startup",
                        elapsed_ms = startup_started_at.elapsed().as_millis() as u64,
                        "workspace window shell revealed"
                    );
                }
            }

            if !shell_provisioning {
                let startup_app = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                    if !startup_app
                        .state::<DesktopWindowState>()
                        .startup_window_revealed
                        .load(std::sync::atomic::Ordering::Acquire)
                    {
                        let _ = desktop_windows::reveal_main_window(
                            startup_app.clone(),
                            startup_app.state::<DesktopWindowState>(),
                        );
                    }
                });
            }

            Ok(())
        });
    let builder = invoke_handlers::register(builder);
    builder
        .build(context)
        .expect("error while building tauri application")
        .run(|app, event| {
            match event {
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { .. } => {
                    // macOS sends Reopen when the Dock icon is clicked after the
                    // frameless window was hidden with its close control.
                    show_desktop_window(app);
                }
                // Every process that is not the primary one leaves through
                // Tauri's default exit path, which never reaches the product quit
                // path: this is the only cleanup a workspace window, quick chat,
                // onboarding, settings, or development instance process runs, and
                // the daemon it started must not outlive it.
                tauri::RunEvent::Exit => stop_plugin_daemons(),
                _ => {}
            }
            #[cfg(not(target_os = "macos"))]
            let _ = app;
        });
}
