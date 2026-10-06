#[cfg(feature = "embedded-runtime")]
use super::policy::{cua_driver_serve_args, CUA_DRIVER_HOST_BUNDLE_ID};
#[cfg(feature = "embedded-runtime")]
use super::*;
/// The reserved daemon launch, as the kernel resolves it for the Cua Driver
/// package: an interpreter, the package's own launcher, and the `serve
/// --embedded` the package declares.
#[cfg(feature = "embedded-runtime")]
fn cua_driver_launch_fixture(data_root: &str) -> PluginDaemonLaunch {
    let launcher = "/packages/cua-driver/bin/cua-driver.mjs".to_string();
    PluginDaemonLaunch {
        plugin_id: "cua-driver".to_string(),
        root: "/packages/cua-driver".to_string(),
        command: "node".to_string(),
        launcher_args: vec![launcher.clone()],
        args: vec![launcher, "serve".to_string(), "--embedded".to_string()],
        data_root: data_root.to_string(),
        environment: vec![
            (
                "PLUGIN_ROOT".to_string(),
                "/packages/cua-driver".to_string(),
            ),
            ("PLUGIN_DATA".to_string(), data_root.to_string()),
        ],
        authorization_reason: "explicit test host access".to_string(),
    }
}

#[cfg(feature = "embedded-runtime")]
#[test]
fn cua_driver_serve_uses_fixed_unrestricted_flags_and_private_endpoint() {
    let endpoint = cua_driver_endpoint_path();
    assert_eq!(
        cua_driver_serve_args(),
        vec![
            "--permission-mode",
            "unrestricted",
            "--dangerously-bypass-approvals",
            "--parent-liveness-stdio",
            "--socket",
            endpoint.as_str(),
        ]
    );
    #[cfg(windows)]
    assert_eq!(endpoint, r"\\.\pipe\openagent-cua-driver");
    #[cfg(unix)]
    {
        assert!(
            endpoint.starts_with('/'),
            "endpoint must be absolute: {endpoint}"
        );
        assert!(
            endpoint.ends_with("/openagent/cua-driver.sock"),
            "endpoint must stay private to OpenAgent: {endpoint}"
        );
    }
}

/// The daemon's command line is the package's declaration followed by the
/// host's policy. Neither side re-derives the other: the subcommand and the
/// embedding identity come from the manifest, and the program the host starts
/// is the one the kernel resolved — never `node` interpreted a second time.
#[cfg(feature = "embedded-runtime")]
#[test]
fn cua_driver_launch_arguments_extend_the_package_declaration() {
    let launch = cua_driver_launch_fixture("C:/plugin-data/cua-driver");
    let args = cua_driver_launch_args(&launch);

    assert_eq!(args[0], launch.launcher_args[0]);
    assert_eq!(
        args,
        vec![
            launch.launcher_args[0].clone(),
            "serve".to_string(),
            "--embedded".to_string(),
            "--permission-mode".to_string(),
            "unrestricted".to_string(),
            "--dangerously-bypass-approvals".to_string(),
            "--parent-liveness-stdio".to_string(),
            "--socket".to_string(),
            cua_driver_endpoint_path(),
        ]
    );
}

/// Provisioning is the same launch with one more argument, because the
/// launcher that fetches the driver is the launcher that runs it.
#[cfg(feature = "embedded-runtime")]
#[test]
fn cua_driver_prepare_requests_the_same_launch() {
    let launch = cua_driver_launch_fixture("C:/plugin-data/cua-driver");
    assert_eq!(
        cua_driver_prepare_args(&launch),
        cua_driver_launch_args(&launch)
            .into_iter()
            .chain([CUA_DRIVER_PREPARE_ARG.to_string()])
            .collect::<Vec<_>>()
    );
}

/// The daemon has to be told twice that it is embedded and unrestricted: the
/// command line carries the flags the host starts it with, and the
/// environment carries the same values for the driver's two-part embedding
/// contract, which refuses contradictory values. `PLUGIN_DATA` is the one
/// variable the package's launcher cannot run without.
#[cfg(feature = "embedded-runtime")]
#[test]
fn cua_driver_serve_environment_matches_the_embedded_contract() {
    let launch = cua_driver_launch_fixture("C:/plugin-data/cua-driver");
    assert_eq!(
        cua_driver_serve_environment(&launch),
        vec![
            (
                "PLUGIN_ROOT".to_string(),
                "/packages/cua-driver".to_string()
            ),
            ("CUA_DRIVER_EMBEDDED".to_string(), "1".to_string()),
            (
                "CUA_DRIVER_PERMISSION_MODE".to_string(),
                "unrestricted".to_string(),
            ),
            (
                "CUA_DRIVER_DANGEROUSLY_BYPASS_APPROVALS".to_string(),
                "1".to_string(),
            ),
            (
                "CUA_DRIVER_PARENT_LIVENESS_STDIN".to_string(),
                "1".to_string(),
            ),
            (
                "CUA_DRIVER_HOST_BUNDLE_ID".to_string(),
                CUA_DRIVER_HOST_BUNDLE_ID.to_string(),
            ),
            (
                "PLUGIN_DATA".to_string(),
                "C:/plugin-data/cua-driver".to_string(),
            ),
        ]
    );
}

/// Every cell of the ownership rule. The two cells that decide safety are the
/// peer's: a live owner's daemon is never reclaimed — only a lock this
/// process took, beside a daemon that still answers, may be stopped — and a
/// peer that has not finished starting is waited on rather than raced.
#[cfg(feature = "embedded-runtime")]
#[test]
fn cua_driver_launch_plan_never_replaces_a_live_peers_daemon() {
    let owned = CuaDriverOwnership::Owned(tempfile::tempfile().expect("owner lock stand-in"));
    let held = CuaDriverOwnership::Held;
    let untracked = CuaDriverOwnership::Untracked;

    assert_eq!(
        plan_cua_driver_launch(&owned, true),
        CuaDriverPlan::ReclaimThenServe
    );
    assert_eq!(plan_cua_driver_launch(&owned, false), CuaDriverPlan::Serve);
    assert_eq!(plan_cua_driver_launch(&held, true), CuaDriverPlan::Adopt);
    assert_eq!(
        plan_cua_driver_launch(&held, false),
        CuaDriverPlan::AwaitPeer
    );
    assert_eq!(
        plan_cua_driver_launch(&untracked, true),
        CuaDriverPlan::Adopt
    );
    assert_eq!(
        plan_cua_driver_launch(&untracked, false),
        CuaDriverPlan::Serve
    );
}

/// The bundle identifier is an advisory label the driver compares with the
/// bundle identity macOS resolves for the host, so it has to be the installed
/// app's identifier rather than a development instance's rewritten one.
#[cfg(feature = "embedded-runtime")]
#[test]
fn cua_driver_host_bundle_id_matches_the_tauri_identifier() {
    let configuration = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json"),
    )
    .expect("read tauri.conf.json");
    let configuration: serde_json::Value =
        serde_json::from_str(&configuration).expect("parse tauri.conf.json");
    assert_eq!(
        configuration
            .get("identifier")
            .and_then(|value| value.as_str()),
        Some(CUA_DRIVER_HOST_BUNDLE_ID)
    );
}

/// The owner lock is what tells a live peer's daemon apart from one whose
/// owner is gone, so it has to disappear with the process that holds it.
#[test]
fn cua_driver_ownership_is_exclusive_per_process_and_released_on_drop() {
    use std::fs::TryLockError;

    let path = std::env::temp_dir().join(format!(
        "openagent-cua-owner-test-{}/daemon.lock",
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(path.parent().expect("owner lock parent"))
        .expect("create owner lock directory");

    let owner = std::fs::OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(&path)
        .expect("open owner lock");
    owner.try_lock().expect("first lock succeeds");

    // A second handle stands in for the next OpenAgent process.
    let contender = std::fs::OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(&path)
        .expect("open owner lock again");
    assert!(matches!(
        contender.try_lock(),
        Err(TryLockError::WouldBlock)
    ));

    drop(owner);
    contender
        .try_lock()
        .expect("the lock is free once its owner is gone");

    drop(contender);
    std::fs::remove_dir_all(path.parent().expect("owner lock parent"))
        .expect("remove owner lock fixture");
}
