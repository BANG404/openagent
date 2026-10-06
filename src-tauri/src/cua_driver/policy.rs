use crate::plugin_daemon_supervisor::PluginDaemonLaunch;

/// Private endpoint shared by the plugin-owned Cua Driver daemon and its
/// reserved MCP client entry, in the shape each platform expects: a named pipe
/// on Windows and a filesystem path elsewhere.
///
/// It is deliberately not the driver's own default endpoint. A standalone
/// `cua-driver` installation owns that one, and attaching the reserved entry to
/// a standard-mode daemon would silently replace the unrestricted contract of
/// this plugin. It is product policy rather than a user setting, so the host
/// reports the same value to both the daemon and the persisted MCP entry.
pub(super) fn cua_driver_endpoint_path() -> String {
    #[cfg(windows)]
    {
        r"\\.\pipe\openagent-cua-driver".to_owned()
    }
    #[cfg(not(windows))]
    {
        let home = std::env::var_os("HOME")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| std::path::PathBuf::from("/tmp"));
        #[cfg(target_os = "macos")]
        let directory = home.join("Library").join("Caches").join("openagent");
        #[cfg(not(target_os = "macos"))]
        let directory = home.join(".cache").join("openagent");
        directory
            .join("cua-driver.sock")
            .to_string_lossy()
            .into_owned()
    }
}

/// The product-policy arguments of the reserved daemon's command line.
///
/// The subcommand and the embedding identity come from the installed package,
/// which declares what it publishes (`serve --embedded`); everything here is
/// policy the host owns rather than something a package decides. Permission
/// mode, socket, grants, and capability manifests are product policy: the daemon
/// always runs unrestricted on the product's private endpoint, so no per-user
/// input is involved.
///
/// `--parent-liveness-stdio` is the driver's liveness contract. It makes the
/// daemon treat EOF on its own stdin as loss of the desktop host, which is the
/// same control-pipe contract the supervised Runtime speaks, and the only one
/// that also works on macOS and Linux.
pub(super) fn cua_driver_serve_args() -> Vec<String> {
    [
        "--permission-mode",
        "unrestricted",
        "--dangerously-bypass-approvals",
        "--parent-liveness-stdio",
        "--socket",
    ]
    .into_iter()
    .map(str::to_owned)
    .chain(std::iter::once(cua_driver_endpoint_path()))
    .collect()
}

/// The complete command line of the reserved daemon.
///
/// The kernel resolved the program and its leading arguments when it resolved
/// the daemon — an interpreter and the package's own file, for a JavaScript
/// launcher — so this appends the policy tail to that descriptor instead of
/// interpreting the launch a second time. A host that re-derived the rule here is
/// how `node` ends up being started as if it were the script.
pub(super) fn cua_driver_launch_args(launch: &PluginDaemonLaunch) -> Vec<String> {
    launch
        .args
        .iter()
        .cloned()
        .chain(cua_driver_serve_args())
        .collect()
}

/// Bundle identifier of the installed app that owns the daemon, as pinned in
/// `tauri.conf.json`. The driver echoes it in `check_permissions` and compares it
/// with the bundle identity macOS resolves for the daemon's parent, so it has to
/// be the installed app's identifier rather than a development instance's
/// rewritten one.
pub(super) const CUA_DRIVER_HOST_BUNDLE_ID: &str = "com.iumm.openagent";

/// Environment of the embedded daemon launch.
///
/// The permission values repeat the command line because the driver documents an
/// explicit two-part environment contract for unrestricted embedding and refuses
/// contradictory values; repeating the same value is not a contradiction.
///
/// The package environment includes `PLUGIN_ROOT`, `PLUGIN_DATA`, and the
/// authenticated Host Bridge variables. The package ships a launcher rather
/// than a driver, and a launcher that has to fetch the program it runs must not
/// write into the immutable package it was loaded from.
pub(super) fn cua_driver_serve_environment(launch: &PluginDaemonLaunch) -> Vec<(String, String)> {
    let mut environment = launch.environment.clone();
    for (key, value) in [
        ("CUA_DRIVER_EMBEDDED", "1".to_string()),
        ("CUA_DRIVER_PERMISSION_MODE", "unrestricted".to_string()),
        ("CUA_DRIVER_DANGEROUSLY_BYPASS_APPROVALS", "1".to_string()),
        ("CUA_DRIVER_PARENT_LIVENESS_STDIN", "1".to_string()),
        (
            "CUA_DRIVER_HOST_BUNDLE_ID",
            CUA_DRIVER_HOST_BUNDLE_ID.to_string(),
        ),
        ("PLUGIN_DATA", launch.data_root.clone()),
    ] {
        environment.retain(|(existing, _)| existing != key);
        environment.push((key.to_string(), value));
    }
    environment
}
