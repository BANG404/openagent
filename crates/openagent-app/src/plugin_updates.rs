//! Product subscription synchronization before Runtime execution starts.
use sha2::{Digest, Sha256};
use std::future::Future;
use std::io::Read;
use std::path::Path;
use std::time::Duration;

pub struct PluginUpdateCandidate {
    pub id: String,
    pub available: bool,
    pub stale: bool,
    pub failed: bool,
}

pub struct PluginUpdateReport {
    pub successful: bool,
    pub updates: Vec<PluginUpdateCandidate>,
}

/// The engine implements package operations and retains process leases. The
/// public product chooses when to check, its startup budget and retry policy.
pub trait PluginUpdateBackend: Sync {
    fn check(&self) -> impl Future<Output = PluginUpdateReport> + Send;
    fn update(
        &self,
        id: &str,
        timeout: Duration,
    ) -> impl Future<Output = Result<(), String>> + Send;
}

pub async fn synchronize_plugins_for_runtime(
    version: &str,
    marker: &Path,
    backend: &impl PluginUpdateBackend,
) -> Result<(), String> {
    let digest = tokio::task::spawn_blocking(|| -> Result<String, String> {
        let path = std::env::current_exe().map_err(|error| error.to_string())?;
        let mut file = std::fs::File::open(path).map_err(|error| error.to_string())?;
        let mut hash = Sha256::new();
        let mut buffer = [0_u8; 65536];
        loop {
            let length = file.read(&mut buffer).map_err(|error| error.to_string())?;
            if length == 0 {
                break;
            }
            hash.update(&buffer[..length]);
        }
        Ok(format!("{:x}", hash.finalize()))
    })
    .await
    .map_err(|error| error.to_string())??;
    synchronize_plugins_at(&format!("{version}+{digest}"), marker, backend).await
}

async fn synchronize_plugins_at(
    version: &str,
    marker: &Path,
    backend: &impl PluginUpdateBackend,
) -> Result<(), String> {
    let identity = serde_json::json!({
        "schema_version": 1,
        "runtime_version": version,
        "plugin_protocol": openagent_protocol::PLUGIN_PROTOCOL_VERSION,
    });
    if tokio::fs::read(marker)
        .await
        .ok()
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
        .as_ref()
        == Some(&identity)
    {
        return Ok(());
    }
    // The caller holds the primary process lock; package processes and agent
    // execution have not started. Bound offline startup and retry failures.
    let started = std::time::Instant::now();
    let report = tokio::time::timeout(Duration::from_secs(3), backend.check())
        .await
        .map_err(|_| "plugin update check timed out; retry on next startup".to_string())?;
    let mut failed =
        !report.successful || report.updates.iter().any(|item| item.failed || item.stale);
    for update in report
        .updates
        .iter()
        .filter(|item| item.available && !item.stale && !item.failed)
    {
        let remaining = Duration::from_secs(8).saturating_sub(started.elapsed());
        if remaining < Duration::from_secs(1) {
            failed = true;
            break;
        }
        if let Err(error) = backend
            .update(&update.id, remaining.min(Duration::from_secs(5)))
            .await
        {
            tracing::warn!(plugin = %update.id, %error, "Plugin update deferred");
            failed = true;
        }
    }
    if failed {
        return Err(
            "some plugin updates were deferred; existing packages and data were preserved".into(),
        );
    }
    tokio::fs::create_dir_all(marker.parent().ok_or("plugin update state has no parent")?)
        .await
        .map_err(|error| error.to_string())?;
    // A torn derived marker repeats the check; package state is separate.
    tokio::fs::write(
        marker,
        serde_json::to_vec(&identity).map_err(|error| error.to_string())?,
    )
    .await
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct Backend {
        checks: AtomicUsize,
        updates: AtomicUsize,
        fail_update: bool,
    }
    impl PluginUpdateBackend for Backend {
        async fn check(&self) -> PluginUpdateReport {
            self.checks.fetch_add(1, Ordering::SeqCst);
            PluginUpdateReport {
                successful: true,
                updates: vec![PluginUpdateCandidate {
                    id: "subscription".into(),
                    available: true,
                    stale: false,
                    failed: false,
                }],
            }
        }
        async fn update(&self, _: &str, _: Duration) -> Result<(), String> {
            self.updates.fetch_add(1, Ordering::SeqCst);
            if self.fail_update {
                Err("offline".into())
            } else {
                Ok(())
            }
        }
    }

    #[tokio::test]
    async fn successful_identity_skips_checks_and_failed_replacement_retries() {
        let temp = tempfile::tempdir().unwrap();
        let marker = temp.path().join("plugin-runtime-version.json");
        let mut backend = Backend {
            checks: AtomicUsize::new(0),
            updates: AtomicUsize::new(0),
            fail_update: false,
        };
        synchronize_plugins_at("first", &marker, &backend)
            .await
            .unwrap();
        let successful = tokio::fs::read(&marker).await.unwrap();
        synchronize_plugins_at("first", &marker, &backend)
            .await
            .unwrap();
        assert_eq!(backend.checks.load(Ordering::SeqCst), 1);
        backend.fail_update = true;
        assert!(synchronize_plugins_at("replacement", &marker, &backend)
            .await
            .is_err());
        assert!(synchronize_plugins_at("replacement", &marker, &backend)
            .await
            .is_err());
        assert_eq!(backend.checks.load(Ordering::SeqCst), 3);
        assert_eq!(backend.updates.load(Ordering::SeqCst), 3);
        assert_eq!(tokio::fs::read(&marker).await.unwrap(), successful);
    }
}
