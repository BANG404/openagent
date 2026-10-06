//! Native process adapter for installed plugin daemons and Cua endpoint ownership.
mod ownership;
mod policy;
use crate::plugin_daemon_supervisor::{
    PluginDaemonLaunch, PluginDaemonSpec, PluginDaemonStop, PluginDaemonSupervisor,
    PluginDaemonTransport,
};
#[cfg(not(feature = "embedded-runtime"))]
use crate::runtime_process::RuntimeProcessSupervisor;
#[cfg(not(feature = "embedded-runtime"))]
use crate::runtime_transport::{self, RuntimeProxyRequest};
#[cfg(feature = "embedded-runtime")]
use openagent_runtime::state::OpenAgentRuntime;
use ownership::{
    acquire_cua_driver_ownership, cua_driver_endpoint_is_ready, plan_cua_driver_launch,
    remove_stale_cua_driver_endpoint, CuaDriverOwnership, CuaDriverPlan,
};
use policy::{cua_driver_endpoint_path, cua_driver_launch_args, cua_driver_serve_environment};
use std::sync::Arc;
use tauri::State;

/// How long the host waits for a freshly spawned daemon to accept connections.
const CUA_DRIVER_STARTUP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);

/// Argument the reserved launcher accepts to provision the driver it runs and
/// exit without starting it.
const CUA_DRIVER_PREPARE_ARG: &str = "--openagent-prepare";

/// How long the package's launcher may spend provisioning the driver it runs.
///
/// The launcher fetches tens of megabytes and verifies a digest, with its own
/// two-minute budget for the transfer alone; this is the budget for the whole
/// step, and it is deliberately not the daemon's startup timeout, which is the
/// wait that must never pay for a download.
const CUA_DRIVER_PREPARE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(600);

/// How long the host waits for a daemon to act on a shutdown request.
const CUA_DRIVER_STOP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

/// How long the host waits for its own daemon to exit before it kills it.
const CUA_DRIVER_SHUTDOWN_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);

/// Ask the daemon behind `endpoint` to shut down.
///
/// The request goes to the endpoint rather than to a process id, so a daemon
/// this product does not own — the standalone installation on its own endpoint —
/// can never be hit by it.
fn cua_driver_stop_daemon(
    endpoint: &str,
    launch: &PluginDaemonLaunch,
) -> Result<std::process::ExitStatus, String> {
    use std::process::Stdio;

    // The stop client is the same package launcher, told a different subcommand:
    // the descriptor's own arguments first, then the product's stop topology.
    let mut args = launch.launcher_args.clone();
    args.extend([
        "stop".to_string(),
        "--socket".to_string(),
        endpoint.to_string(),
    ]);
    let mut stopping = cua_driver_launcher_process(launch, args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to stop the Cua Driver daemon: {error}"))?;
    let deadline = std::time::Instant::now() + CUA_DRIVER_STOP_TIMEOUT;
    loop {
        match stopping.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) if std::time::Instant::now() < deadline => {
                std::thread::sleep(std::time::Duration::from_millis(25));
            }
            Ok(None) => {
                let _ = stopping.kill();
                let _ = stopping.wait();
                return Err(format!(
                    "Cua Driver stop on {endpoint} did not finish within {}s",
                    CUA_DRIVER_STOP_TIMEOUT.as_secs()
                ));
            }
            Err(error) => return Err(format!("Cua Driver stop status failed: {error}")),
        }
    }
}

/// Whether the endpoint still accepts connections after a shutdown request.
fn wait_for_cua_driver_endpoint_release(endpoint: &str) -> Result<(), String> {
    let deadline = std::time::Instant::now() + CUA_DRIVER_STOP_TIMEOUT;
    while cua_driver_endpoint_is_ready(endpoint) {
        if std::time::Instant::now() >= deadline {
            return Err(format!(
                "a Cua Driver daemon still answers on {endpoint} after {}s",
                CUA_DRIVER_STOP_TIMEOUT.as_secs()
            ));
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    Ok(())
}

/// Stop the daemon that answers on an endpoint no live process owns, and wait for
/// the endpoint to go quiet.
///
/// Reclaiming matters because such a daemon serves whatever release started it:
/// left alone it would keep serving an older driver, and it is exactly the
/// process a previous crash or force-kill leaves behind.
fn reclaim_orphaned_cua_driver_daemon(
    endpoint: &str,
    launch: &PluginDaemonLaunch,
) -> Result<(), String> {
    tracing::info!(
        %endpoint,
        "reclaiming a Cua Driver daemon whose owning process is gone"
    );
    let status = cua_driver_stop_daemon(endpoint, launch)?;
    tracing::debug!(%endpoint, %status, "asked the orphaned Cua Driver daemon to exit");
    wait_for_cua_driver_endpoint_release(endpoint).map_err(|error| {
        format!("{error}; refusing to bind a second listener to the live endpoint")
    })
}

/// Shared process registry for installed plugin daemons, including Cua Driver.
static PLUGIN_DAEMON_SUPERVISOR: std::sync::OnceLock<PluginDaemonSupervisor> =
    std::sync::OnceLock::new();

pub(crate) fn plugin_daemon_supervisor() -> &'static PluginDaemonSupervisor {
    PLUGIN_DAEMON_SUPERVISOR
        .get_or_init(|| PluginDaemonSupervisor::new(CUA_DRIVER_SHUTDOWN_TIMEOUT))
}

/// The reserved launcher, started the way this run resolved it.
///
/// Every invocation of the package's launcher — provisioning it, serving it,
/// stopping it — goes through this one shape, so the program, the working
/// directory, and the stop window cannot diverge. The environment is the
/// caller's: the embedded contract belongs to the daemon, and the launcher needs
/// only `PLUGIN_DATA` to find the driver it runs.
fn cua_driver_launcher_process(
    launch: &PluginDaemonLaunch,
    args: Vec<String>,
) -> std::process::Command {
    let mut command = std::process::Command::new(&launch.command);
    command
        .args(args)
        .envs(launch.environment.iter().cloned())
        .current_dir(&launch.root);
    // The release host is a `windows`-subsystem process without a console, so a
    // console-subsystem child created without CREATE_NO_WINDOW allocates its own
    // visible terminal window beside the product window. Startup starts this
    // daemon whenever the reserved entry is enabled and the package's launcher is
    // a console program too, so the flag keeps every one of those starts out of
    // the user's taskbar.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command
}

/// The launcher invocation that provisions or starts the daemon, which is the
/// only one that carries the embedded contract's environment.
fn cua_driver_launcher_command(
    launch: &PluginDaemonLaunch,
    args: Vec<String>,
) -> std::process::Command {
    let mut command = cua_driver_launcher_process(launch, args);
    command.envs(cua_driver_serve_environment(launch));
    command
}

/// The daemon's own command line, asking the launcher to provision the driver it
/// runs and exit instead of starting it.
fn cua_driver_prepare_args(launch: &PluginDaemonLaunch) -> Vec<String> {
    cua_driver_launch_args(launch)
        .into_iter()
        .chain([CUA_DRIVER_PREPARE_ARG.to_string()])
        .collect()
}

/// Put the driver the package's launcher runs on disk before anything supervises
/// it as a daemon.
///
/// The package ships a launcher, not a driver, so the first launch fetches the
/// pinned release and verifies its digest; `--openagent-prepare` makes that the
/// whole job and exits. Leaving it to the daemon's start would spend the daemon's
/// startup budget on a network download and then kill the daemon for being slow,
/// which is a failure the user cannot act on. The download gets a budget that is
/// about the network instead, and the daemon's own start stays a spawn.
fn prepare_cua_driver(launch: &PluginDaemonLaunch) -> Result<(), String> {
    use std::io::Read;
    use std::process::Stdio;

    let mut child = cua_driver_launcher_command(launch, cua_driver_prepare_args(launch))
        .stdin(Stdio::null())
        // The launcher promises nothing on stdout — for the client subcommand
        // that pipe is the MCP transport — so the host reads only its stderr.
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to provision the Cua Driver: {error}"))?;
    let diagnostics = child.stderr.take().map(|stderr| {
        std::thread::spawn(move || {
            let mut text = String::new();
            let _ = std::io::BufReader::new(stderr).read_to_string(&mut text);
            text
        })
    });
    let deadline = std::time::Instant::now() + CUA_DRIVER_PREPARE_TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if std::time::Instant::now() < deadline => {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "the Cua Driver package did not finish provisioning within {}s",
                    CUA_DRIVER_PREPARE_TIMEOUT.as_secs()
                ));
            }
            Err(error) => return Err(format!("Cua Driver provisioning status failed: {error}")),
        }
    };
    if status.success() {
        return Ok(());
    }
    let diagnostics = diagnostics
        .and_then(|reader| reader.join().ok())
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty());
    Err(match diagnostics {
        Some(diagnostics) => {
            format!("the Cua Driver package could not prepare its driver: {diagnostics}")
        }
        None => {
            format!("the Cua Driver package could not prepare its driver (exit status {status})")
        }
    })
}

/// Build the standard supervisor specification for the reserved Cua daemon.
fn cua_driver_daemon_spec(
    endpoint: &str,
    launch: &PluginDaemonLaunch,
) -> Result<(PluginDaemonSpec, PluginDaemonStop), String> {
    if launch.authorization_reason.trim().is_empty() {
        return Err("Cua Driver launch is missing Runtime host-access authorization".to_string());
    }
    tracing::info!(plugin = %launch.plugin_id, exemption = %launch.authorization_reason,
        "Cua Driver daemon starts with Runtime-authorized host access");

    prepare_cua_driver(launch)?;
    let env = cua_driver_serve_environment(launch);
    let stop_args = launch
        .launcher_args
        .iter()
        .cloned()
        .chain([
            "stop".to_string(),
            "--socket".to_string(),
            endpoint.to_string(),
        ])
        .collect();
    Ok((
        PluginDaemonSpec {
            plugin_id: launch.plugin_id.clone(),
            label: "Cua Driver".to_string(),
            command: launch.command.clone(),
            args: cua_driver_launch_args(launch),
            cwd: std::path::PathBuf::from(&launch.root),
            env: env.clone(),
            transport: PluginDaemonTransport::Socket {
                endpoint: endpoint.to_string(),
                startup_timeout: CUA_DRIVER_STARTUP_TIMEOUT,
            },
        },
        PluginDaemonStop {
            command: launch.command.clone(),
            args: stop_args,
            cwd: std::path::PathBuf::from(&launch.root),
            env,
            timeout: CUA_DRIVER_STOP_TIMEOUT,
        },
    ))
}

/// Start the plugin-owned Cua Driver daemon unless one is already listening
/// on the reserved endpoint, and wait until it accepts connections.
///
/// The daemon owns the unrestricted desktop runtime; the reserved MCP entry is
/// only a client that attaches to the same endpoint. Returns whether the
/// endpoint is newly available to the caller, which tells a Runtime that already
/// connected its persisted MCP list before this call that it has to reconnect.
///
/// The ordinary desktop architecture connects MCP servers in the supervised
/// Runtime process, so the host cannot rely on the embedded-runtime bootstrap to
/// start this daemon; the frontend asks the host while the entry is enabled.
///
/// Endpoint ownership decides what this process may do, and every window process
/// reaches the same endpoint; `plan_cua_driver_launch` is that rule.
fn ensure_cua_driver_serve_with_launch(launch: PluginDaemonLaunch) -> Result<bool, String> {
    static START: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _starting = START
        .lock()
        .map_err(|_| "Cua Driver startup state is unavailable".to_string())?;
    let endpoint = cua_driver_endpoint_path();
    if plugin_daemon_supervisor().is_running("cua-driver")? {
        return Ok(false);
    }
    // A daemon that exited on its own still retains the owner lock until its
    // supervisor entry is reaped.
    let _ = plugin_daemon_supervisor().stop("cua-driver");
    let ownership = acquire_cua_driver_ownership()?;
    let plan = plan_cua_driver_launch(&ownership, cua_driver_endpoint_is_ready(&endpoint));
    let owner = match ownership {
        CuaDriverOwnership::Owned(owner) => Some(owner),
        CuaDriverOwnership::Held | CuaDriverOwnership::Untracked => None,
    };
    match plan {
        CuaDriverPlan::ReclaimThenServe => {
            reclaim_orphaned_cua_driver_daemon(&endpoint, &launch)?;
            remove_stale_cua_driver_endpoint(&endpoint)?;
            let (spec, stop) = cua_driver_daemon_spec(&endpoint, &launch)?;
            plugin_daemon_supervisor().start_with_resources(
                spec,
                Some(stop),
                owner
                    .into_iter()
                    .map(|lock| Box::new(lock) as Box<dyn Send>)
                    .collect(),
            )
        }
        CuaDriverPlan::Serve => {
            remove_stale_cua_driver_endpoint(&endpoint)?;
            let (spec, stop) = cua_driver_daemon_spec(&endpoint, &launch)?;
            plugin_daemon_supervisor().start_with_resources(
                spec,
                Some(stop),
                owner
                    .into_iter()
                    .map(|lock| Box::new(lock) as Box<dyn Send>)
                    .collect(),
            )
        }
        CuaDriverPlan::AwaitPeer => {
            // Wait for the peer's daemon instead of racing it with a second
            // listener; the endpoint is new to the caller either way.
            wait_for_cua_driver_endpoint_ready(&endpoint)?;
            Ok(true)
        }
        CuaDriverPlan::Adopt => Ok(false),
    }
}

/// Resolve and supervise a plugin-owned daemon through the standard package
/// contract. The host never downloads or bundles a Cua executable.
#[cfg(feature = "embedded-runtime")]
pub(crate) async fn ensure_cua_driver_serve(
    runtime: Arc<OpenAgentRuntime>,
) -> Result<bool, String> {
    let descriptor = openagent_runtime::commands::resolve_host_plugin_daemon(
        runtime.state(),
        "cua-driver".to_string(),
    )
    .await?;
    let launch: PluginDaemonLaunch = serde_json::from_value(descriptor)
        .map_err(|error| format!("Runtime returned an invalid daemon launch: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || ensure_cua_driver_serve_with_launch(launch))
        .await
        .map_err(|error| format!("Cua Driver startup task failed: {error}"))?
}

#[cfg(feature = "embedded-runtime")]
async fn ensure_declared_plugin_daemon(
    runtime: Arc<OpenAgentRuntime>,
    plugin_id: &str,
) -> Result<bool, String> {
    if plugin_id == openagent_runtime::agent_plugins::CUA_DRIVER_ID {
        return Ok(false);
    }
    let state = runtime.state();
    let roots = state
        .agent_plugin_roots
        .clone()
        .ok_or_else(|| "Agent Plugin support is not configured".to_string())?;
    let enabled = state.config.lock().await.agent_plugins_enabled.clone();
    let process_launch = state.plugin_process_launch().await;
    let launch = openagent_runtime::agent_plugins::resolve_installed_plugin_daemon(
        &roots.packages,
        &roots.data,
        &enabled,
        &process_launch,
        plugin_id,
    )
    .await?;
    if launch.process_policy.managed().is_some() {
        return Err(format!(
            "Agent Plugin '{plugin_id}' daemon requires a managed process adapter"
        ));
    }
    let endpoint = (launch.transport == "socket")
        .then(|| std::path::PathBuf::from(&launch.data_root).join("daemon.sock"))
        .map(|path| path.to_string_lossy().into_owned());
    let mut env = launch.environment.clone();
    if let Some(endpoint) = &endpoint {
        env.push(("OPENAGENT_PLUGIN_ENDPOINT".to_string(), endpoint.clone()));
    }
    let transport = match endpoint {
        Some(endpoint) => PluginDaemonTransport::Socket {
            endpoint,
            startup_timeout: std::time::Duration::from_secs(15),
        },
        None => PluginDaemonTransport::Stdio,
    };
    plugin_daemon_supervisor().start(
        PluginDaemonSpec {
            plugin_id: launch.plugin_id.clone(),
            label: format!("Agent Plugin {plugin_id}"),
            command: launch.command,
            args: launch.args,
            cwd: std::path::PathBuf::from(launch.root),
            env,
            transport,
        },
        None,
    )
}

#[cfg(feature = "embedded-runtime")]
pub(crate) async fn ensure_declared_plugin_daemons(runtime: Arc<OpenAgentRuntime>) {
    let state = runtime.state();
    let Some(roots) = state.agent_plugin_roots.clone() else {
        return;
    };
    let enabled = state.config.lock().await.agent_plugins_enabled.clone();
    let plugins =
        openagent_runtime::agent_plugins::load_installed_plugins(&roots.packages, &roots.data)
            .await;
    for plugin in plugins {
        if plugin.summary.daemon.is_none()
            || !enabled.get(&plugin.summary.id).copied().unwrap_or(true)
        {
            continue;
        }
        if let Err(error) = ensure_declared_plugin_daemon(runtime.clone(), &plugin.summary.id).await
        {
            tracing::warn!(plugin = %plugin.summary.id, %error, "plugin daemon was not started");
        }
    }
}

#[cfg(not(feature = "embedded-runtime"))]
pub(crate) async fn ensure_cua_driver_serve(
    supervisor: &RuntimeProcessSupervisor,
) -> Result<bool, String> {
    let response = runtime_transport::proxy_runtime_request(
        supervisor,
        RuntimeProxyRequest {
            method: "POST".to_string(),
            path: "/api/desktop/plugin-daemon-launch".to_string(),
            body: Some(serde_json::json!({ "id": "cua-driver" }).to_string()),
        },
    )
    .await?;
    if response.status != 200 {
        return Err(format!(
            "Cua Driver launch was rejected by Runtime: {}",
            response.body
        ));
    }
    let launch: PluginDaemonLaunch = serde_json::from_str(&response.body)
        .map_err(|error| format!("Runtime returned an invalid daemon launch: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || ensure_cua_driver_serve_with_launch(launch))
        .await
        .map_err(|error| format!("Cua Driver startup task failed: {error}"))?
}

/// Stop the daemon this process started.
///
/// The reserved endpoint must not outlive the product that owns it: a daemon
/// left behind would keep answering the next launch with the release it was
/// started from. Every product exit path stops it, including the quit watchdog
/// that force-exits a hung shutdown and Tauri's own exit event, which is the only
/// cleanup a non-primary window process reaches.
///
/// A daemon another process owns is never this process's to stop.
pub(crate) fn stop_cua_driver_serve() {
    plugin_daemon_supervisor().stop_all();
}

/// Wait for another process's daemon to start listening on `endpoint`.
fn wait_for_cua_driver_endpoint_ready(endpoint: &str) -> Result<(), String> {
    let deadline = std::time::Instant::now() + CUA_DRIVER_STARTUP_TIMEOUT;
    while !cua_driver_endpoint_is_ready(endpoint) {
        if std::time::Instant::now() >= deadline {
            return Err(format!(
                "another process did not start a Cua Driver daemon on {endpoint} within {}s",
                CUA_DRIVER_STARTUP_TIMEOUT.as_secs()
            ));
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    Ok(())
}

/// Report the private endpoint the reserved MCP entry must attach to. The
/// frontend persists it into the reserved entry, so both the daemon and its
/// client always agree on one host-owned value.
#[tauri::command]
pub(crate) fn cua_driver_endpoint() -> String {
    cua_driver_endpoint_path()
}

/// Ask the desktop host to start the installed Cua Driver plugin daemon for the reserved
/// entry and wait until it is accepting connections. Returns whether this call
/// spawned the daemon.
#[cfg(feature = "embedded-runtime")]
#[tauri::command]
pub(crate) async fn start_cua_driver_serve(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<bool, String> {
    ensure_cua_driver_serve(runtime.inner().clone()).await
}

#[tauri::command]
pub(crate) fn agent_plugin_daemon_running(plugin_id: String) -> Result<bool, String> {
    plugin_daemon_supervisor().is_running(&plugin_id)
}

#[cfg(feature = "embedded-runtime")]
#[tauri::command]
pub(crate) fn stop_agent_plugin_daemon(plugin_id: String) -> Result<bool, String> {
    plugin_daemon_supervisor().stop(&plugin_id)
}

#[cfg(not(feature = "embedded-runtime"))]
#[tauri::command]
pub(crate) async fn start_cua_driver_serve(
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
) -> Result<bool, String> {
    ensure_cua_driver_serve(supervisor.inner()).await
}

#[cfg(test)]
mod tests;
