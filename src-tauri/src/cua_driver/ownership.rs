use super::policy::{cua_driver_endpoint_path, CUA_DRIVER_HOST_BUNDLE_ID};

/// Whether a daemon is accepting connections on the reserved endpoint.
///
/// Readiness is a connection attempt rather than a filesystem check: the
/// reserved MCP client attaches immediately after this returns, and the driver
/// binds its listener after it has created the socket path.
#[cfg(unix)]
pub(super) fn cua_driver_endpoint_is_ready(endpoint: &str) -> bool {
    std::os::unix::net::UnixStream::connect(endpoint).is_ok()
}

#[cfg(windows)]
pub(super) fn cua_driver_endpoint_is_ready(endpoint: &str) -> bool {
    std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(endpoint)
        .is_ok()
}

#[cfg(not(any(unix, windows)))]
pub(super) fn cua_driver_endpoint_is_ready(endpoint: &str) -> bool {
    std::path::Path::new(endpoint).exists()
}

/// Remove a Unix socket path left behind after an unclean daemon shutdown.
///
/// The driver refuses to replace an existing endpoint path even when no
/// process is listening on it. The host only calls this after taking the
/// endpoint ownership lock and confirming that the path is not accepting
/// connections, so a live peer can never be unlinked here.
#[cfg(unix)]
pub(super) fn remove_stale_cua_driver_endpoint(endpoint: &str) -> Result<(), String> {
    match std::fs::remove_file(endpoint) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Failed to remove stale Cua Driver endpoint {endpoint}: {error}"
        )),
    }
}

#[cfg(not(unix))]
pub(super) fn remove_stale_cua_driver_endpoint(_endpoint: &str) -> Result<(), String> {
    Ok(())
}

/// Path of the advisory lock that records which process owns the reserved
/// endpoint. It lives in the per-user cache because ownership is a property of
/// this machine's desktop host rather than of the driver the installed package
/// supplies.
pub(super) fn cua_driver_owner_lock_path() -> Option<std::path::PathBuf> {
    cua_driver_staging_root().map(|root| root.join("owner").join("daemon.lock"))
}

/// Who owns the reserved endpoint, as far as this process can tell.
pub(super) enum CuaDriverOwnership {
    /// This process owns the endpoint and may start or stop its daemon.
    Owned(std::fs::File),
    /// A live process owns the endpoint; its daemon is never this one's to stop.
    Held,
    /// The per-user cache is unavailable, so ownership cannot be recorded.
    Untracked,
}

/// Take ownership of the reserved endpoint, or report who else holds it.
///
/// The lock is an OS file lock rather than a written-down process id, so it
/// disappears with the process that holds it: a lock that can be taken while the
/// endpoint still answers is proof that the daemon behind it outlived its owner.
/// Binding a second listener is never an option — the driver unlinks the live
/// socket when it binds — so this lock is also what serializes concurrent
/// window processes that start at the same time.
pub(super) fn acquire_cua_driver_ownership() -> Result<CuaDriverOwnership, String> {
    use std::io::{Seek, SeekFrom, Write};

    let Some(path) = cua_driver_owner_lock_path() else {
        tracing::debug!(
            "per-user cache directory is unavailable; the Cua Driver daemon cannot be tracked"
        );
        return Ok(CuaDriverOwnership::Untracked);
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }
    let mut lock = std::fs::OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .truncate(false)
        .open(&path)
        .map_err(|error| format!("Failed to open {}: {error}", path.display()))?;
    match lock.try_lock() {
        Ok(()) => {}
        Err(std::fs::TryLockError::WouldBlock) => return Ok(CuaDriverOwnership::Held),
        Err(std::fs::TryLockError::Error(error)) => {
            return Err(format!("Failed to lock {}: {error}", path.display()));
        }
    }
    // The record is diagnostics; the lock is the authority. A stale record from
    // an earlier owner must not fail the launch.
    let record = serde_json::json!({
        "pid": std::process::id(),
        "endpoint": cua_driver_endpoint_path(),
        "bundle_id": CUA_DRIVER_HOST_BUNDLE_ID,
        "started_at": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_secs())
            .unwrap_or_default(),
    });
    let _ = lock
        .seek(SeekFrom::Start(0))
        .and_then(|_| lock.set_len(0))
        .and_then(|()| write!(lock, "{record}"))
        .and_then(|()| lock.flush());
    Ok(CuaDriverOwnership::Owned(lock))
}

/// What this process must do about the reserved endpoint.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum CuaDriverPlan {
    /// Stop the daemon that outlived its owner, then start a fresh one.
    ReclaimThenServe,
    /// Nothing answers on the endpoint: start a daemon and own it.
    Serve,
    /// A daemon already answers and it is not this process's to replace.
    Adopt,
    /// Another live process owns the endpoint and is still starting its daemon.
    AwaitPeer,
}

/// The ownership rule, as one decision. Replacing a live peer's daemon would
/// take the endpoint away from a process that is still using it, and leaving an
/// orphan in place would serve a superseded release forever, so every cell is
/// deliberate.
pub(super) fn plan_cua_driver_launch(
    ownership: &CuaDriverOwnership,
    endpoint_ready: bool,
) -> CuaDriverPlan {
    match (ownership, endpoint_ready) {
        // Whatever answers here outlived its owner: the lock was free.
        (CuaDriverOwnership::Owned(_), true) => CuaDriverPlan::ReclaimThenServe,
        (CuaDriverOwnership::Owned(_), false) => CuaDriverPlan::Serve,
        // A live process holds the lock, so its daemon is never stopped; only a
        // peer that has not finished starting needs waiting on.
        (CuaDriverOwnership::Held, true) => CuaDriverPlan::Adopt,
        (CuaDriverOwnership::Held, false) => CuaDriverPlan::AwaitPeer,
        // Without a cache directory there is nowhere to record ownership, and a
        // daemon that cannot be told apart from a peer's is never stopped.
        (CuaDriverOwnership::Untracked, true) => CuaDriverPlan::Adopt,
        (CuaDriverOwnership::Untracked, false) => CuaDriverPlan::Serve,
    }
}

/// Per-user directory whose only remaining content is the reserved endpoint's
/// owner lock.
///
/// The name is older than what it holds: the host used to stage the driver
/// release it bundled here, and the lock lives beside that history so one cache
/// directory answers "who is serving the reserved endpoint". A package now owns
/// the driver and caches it under its own `PLUGIN_DATA`, so nothing stages
/// releases here, and the directory is deliberately not cleaned up: the lock is
/// per-user state that has to survive a rebuild.
fn cua_driver_staging_root() -> Option<std::path::PathBuf> {
    dirs::cache_dir().map(|directory| directory.join("openagent").join("cua-driver"))
}
