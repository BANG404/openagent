//! Generic native lifecycle adapter for installed plugin daemons.
use crate::plugin_daemon_supervisor::{
    PluginDaemonLaunch, PluginDaemonSpec, PluginDaemonSupervisor, PluginDaemonTransport,
};

static PLUGIN_DAEMON_SUPERVISOR: std::sync::OnceLock<PluginDaemonSupervisor> =
    std::sync::OnceLock::new();

pub(crate) fn plugin_daemon_supervisor() -> &'static PluginDaemonSupervisor {
    PLUGIN_DAEMON_SUPERVISOR
        .get_or_init(|| PluginDaemonSupervisor::new(std::time::Duration::from_secs(3)))
}

fn refreshing_daemons() -> &'static std::sync::Mutex<std::collections::BTreeSet<String>> {
    static RELEASED: std::sync::OnceLock<std::sync::Mutex<std::collections::BTreeSet<String>>> =
        std::sync::OnceLock::new();
    RELEASED.get_or_init(Default::default)
}

pub(crate) fn release_refreshing_plugin_daemon(id: &str) -> Result<(), String> {
    if plugin_daemon_supervisor().stop(id)? {
        refreshing_daemons()
            .lock()
            .map_err(|_| "Plugin refresh state is unavailable")?
            .insert(id.into());
    }
    Ok(())
}

pub(crate) fn plugin_daemon_refresh_pending(id: &str) -> bool {
    refreshing_daemons()
        .lock()
        .is_ok_and(|ids| ids.contains(id))
}

pub(crate) fn resume_refreshing_plugin_daemon(
    id: &str,
    launch: Option<PluginDaemonLaunch>,
) -> Result<(), String> {
    if !plugin_daemon_refresh_pending(id) {
        return Ok(());
    }
    if let Some(launch) = launch {
        if launch.plugin_id != id {
            return Err("Plugin refresh launch identity changed".into());
        }
        let mut env = launch.environment;
        let transport = match launch.transport.as_str() {
            "socket" => {
                let endpoint = std::path::PathBuf::from(&launch.data_root)
                    .join("daemon.sock")
                    .to_string_lossy()
                    .into_owned();
                env.push(("OPENAGENT_PLUGIN_ENDPOINT".into(), endpoint.clone()));
                PluginDaemonTransport::Socket {
                    endpoint,
                    startup_timeout: std::time::Duration::from_secs(15),
                }
            }
            "stdio" => PluginDaemonTransport::Stdio,
            _ => return Err("Unsupported plugin daemon refresh transport".into()),
        };
        plugin_daemon_supervisor().start(
            PluginDaemonSpec {
                plugin_id: id.into(),
                label: format!("Agent Plugin {id}"),
                command: launch.command,
                args: launch.args,
                cwd: std::path::PathBuf::from(launch.root),
                env,
                transport,
            },
            None,
        )?;
    }
    refreshing_daemons()
        .lock()
        .map_err(|_| "Plugin refresh state is unavailable")?
        .remove(id);
    Ok(())
}

/// Stop only daemons owned by this desktop process.
pub(crate) fn stop_plugin_daemons() {
    plugin_daemon_supervisor().stop_all();
}

#[tauri::command]
pub(crate) fn agent_plugin_daemon_running(plugin_id: String) -> Result<bool, String> {
    plugin_daemon_supervisor().is_running(&plugin_id)
}
