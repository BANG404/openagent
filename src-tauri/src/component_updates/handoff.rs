//! Durable shell-first update continuation; candidates are always reverified by their owners.
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const FILE_NAME: &str = "shell-handoff.json";

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub(crate) struct ShellUpdateHandoff {
    pub(crate) schema_version: u32,
    pub(crate) shell_version: String,
}

fn path(home: &Path) -> PathBuf {
    home.join("resources").join("updates").join(FILE_NAME)
}

pub(crate) fn read(home: &Path) -> Result<Option<ShellUpdateHandoff>, String> {
    let path = path(home);
    let file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Cannot read shell update continuation: {error}")),
    };
    let mut bytes = Vec::new();
    file.take(16 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > 16 * 1024 {
        return Err("Shell update continuation exceeds its size limit".into());
    }
    let handoff: ShellUpdateHandoff = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Invalid shell update continuation: {error}"))?;
    if handoff.schema_version != 1 || semver::Version::parse(&handoff.shell_version).is_err() {
        return Err("Unsupported shell update continuation".into());
    }
    Ok(Some(handoff))
}

pub(crate) fn write(
    home: &Path,
    handoff: &ShellUpdateHandoff,
    current_shell_version: &str,
) -> Result<(), String> {
    let previous = read(home)?;
    if let Some(previous) = &previous {
        if previous == handoff {
            return Ok(());
        }
        let current =
            semver::Version::parse(current_shell_version).map_err(|error| error.to_string())?;
        let pending =
            semver::Version::parse(&previous.shell_version).map_err(|error| error.to_string())?;
        let candidate =
            semver::Version::parse(&handoff.shell_version).map_err(|error| error.to_string())?;
        // An installer that left this older shell running never reached resource
        // activation. A verified newer plan may replace that interrupted attempt.
        // Preserve reached-but-unconfirmed plans and refuse target downgrades.
        if current >= pending || candidate <= pending {
            return Err("A different shell update continuation is already pending".into());
        }
    }
    let path = path(home);
    let directory = path.parent().expect("handoff path has a parent");
    std::fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let staging = directory.join(format!(".handoff-{}.tmp", uuid::Uuid::new_v4()));
    let bytes = serde_json::to_vec(handoff).map_err(|error| error.to_string())?;
    // The lifecycle owner serializes preparation. Commit the complete record
    // atomically so a failed write leaves the previous continuation retryable.
    let result = (|| {
        let mut file = std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&staging)
            .map_err(|error| error.to_string())?;
        file.write_all(&bytes).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        drop(file);
        if previous.is_some() {
            std::fs::rename(&staging, &path).map_err(|error| error.to_string())
        } else {
            std::fs::hard_link(&staging, &path).map_err(|error| error.to_string())
        }
    })();
    let _ = std::fs::remove_file(staging);
    if result.is_ok() {
        if let Some(previous) = previous {
            tracing::info!(
                target: "openagent::component_update",
                component = "shell",
                stage = "handoff_superseded",
                current_version = current_shell_version,
                previous_version = previous.shell_version,
                candidate_version = handoff.shell_version,
                "newer verified shell plan replaced an interrupted installer continuation"
            );
        }
    }
    result
}

pub(crate) fn clear(home: &Path) -> Result<(), String> {
    match std::fs::remove_file(path(home)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Cannot clear shell update continuation: {error}")),
    }
}

/// The old process only verifies staged bytes and records identities. It does
/// not replace its Runtime or navigate to a frontend that requires the new shell.
#[tauri::command]
pub(crate) async fn prepare_shell_handoff(
    home: tauri::State<'_, crate::DesktopDataDir>,
    updates: tauri::State<'_, super::RuntimeUpdateState>,
    shell_version: String,
) -> Result<(), String> {
    if semver::Version::parse(&shell_version).is_err() {
        return Err("Invalid shell update version".into());
    }
    let _lifecycle = updates.lifecycle.lock().await;
    if !*updates.component_update_active.lock().await {
        return Err("Shell handoff requires an active component update barrier".into());
    }
    crate::desktop_bootstrap::provisioning::verify_prepared_release(&home.0, &shell_version)?;
    // New-shell resources are staged as a complete signed distribution. The
    // running shell neither executes them nor selects future protocol versions.

    write(
        &home.0,
        &ShellUpdateHandoff {
            schema_version: 1,
            shell_version,
        },
        env!("CARGO_PKG_VERSION"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn continuation_survives_process_reconstruction_and_refuses_overwrite() {
        let home = std::env::temp_dir().join(format!("openagent-handoff-{}", uuid::Uuid::new_v4()));
        let handoff = ShellUpdateHandoff {
            schema_version: 1,
            shell_version: "1.0.0".into(),
        };
        write(&home, &handoff, "0.9.0").unwrap();
        assert_eq!(read(&home).unwrap().unwrap().shell_version, "1.0.0");
        write(&home, &handoff, "0.9.0").unwrap();
        let mut different = handoff;
        different.shell_version = "2.0.0".into();
        assert!(write(&home, &different, "1.0.0").is_err());
        clear(&home).unwrap();
        assert!(read(&home).unwrap().is_none());
        std::fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn interrupted_installer_can_retry_a_newer_verified_plan() {
        let home = tempfile::tempdir().unwrap();
        let mut handoff = ShellUpdateHandoff {
            schema_version: 1,
            shell_version: "0.78.1-beta.1".into(),
        };
        write(home.path(), &handoff, "0.78.0-beta.1").unwrap();
        handoff.shell_version = "0.78.2-beta.1".into();
        write(home.path(), &handoff, "0.78.0-beta.1").unwrap();
        assert_eq!(read(home.path()).unwrap(), Some(handoff.clone()));
        write(home.path(), &handoff, "0.78.0-beta.1").unwrap();
        assert_eq!(
            std::fs::read_dir(path(home.path()).parent().unwrap())
                .unwrap()
                .count(),
            1
        );
    }

    #[test]
    fn pending_plan_refuses_downgrades_and_reached_but_unconfirmed_replacement() {
        let home = tempfile::tempdir().unwrap();
        let pending = ShellUpdateHandoff {
            schema_version: 1,
            shell_version: "0.78.2-beta.1".into(),
        };
        write(home.path(), &pending, "0.78.0-beta.1").unwrap();
        for (current, candidate) in [
            ("0.78.0-beta.1", "0.78.1-beta.1"),
            ("0.78.2-beta.1", "0.78.3-beta.1"),
            ("0.78.3-beta.1", "0.78.4-beta.1"),
        ] {
            let replacement = ShellUpdateHandoff {
                shell_version: candidate.into(),
                ..pending.clone()
            };
            assert!(write(home.path(), &replacement, current).is_err());
            assert_eq!(read(home.path()).unwrap(), Some(pending.clone()));
        }
    }

    #[test]
    fn malformed_continuation_is_preserved_for_diagnosis() {
        let home = tempfile::tempdir().unwrap();
        let handoff = ShellUpdateHandoff {
            schema_version: 1,
            shell_version: "0.78.2-beta.1".into(),
        };
        write(home.path(), &handoff, "0.78.0-beta.1").unwrap();
        std::fs::write(path(home.path()), b"interrupted JSON").unwrap();
        assert!(write(home.path(), &handoff, "0.78.0-beta.1").is_err());
        assert_eq!(
            std::fs::read(path(home.path())).unwrap(),
            b"interrupted JSON"
        );
    }

    #[test]
    fn unsupported_and_oversized_records_never_admit_a_replacement() {
        let home = tempfile::tempdir().unwrap();
        let handoff = ShellUpdateHandoff {
            schema_version: 1,
            shell_version: "0.78.2-beta.1".into(),
        };
        write(home.path(), &handoff, "0.78.0-beta.1").unwrap();
        for bytes in [
            br#"{"schema_version":2,"shell_version":"0.78.1-beta.1"}"#.to_vec(),
            br#"{"schema_version":1,"shell_version":"invalid"}"#.to_vec(),
            vec![b' '; 16 * 1024 + 1],
        ] {
            std::fs::write(path(home.path()), &bytes).unwrap();
            assert!(write(home.path(), &handoff, "0.78.0-beta.1").is_err());
            assert_eq!(std::fs::read(path(home.path())).unwrap(), bytes);
        }
    }

    #[test]
    fn retry_orders_prereleases_and_recovers_after_confirmation_clears_the_plan() {
        let home = tempfile::tempdir().unwrap();
        let mut handoff = ShellUpdateHandoff {
            schema_version: 1,
            shell_version: "1.0.0-beta.2".into(),
        };
        write(home.path(), &handoff, "0.9.0").unwrap();
        for target in ["1.0.0-beta.10", "1.0.0-rc.1", "1.0.0"] {
            handoff.shell_version = target.into();
            write(home.path(), &handoff, "0.9.0").unwrap();
            assert_eq!(read(home.path()).unwrap(), Some(handoff.clone()));
        }
        // Once the installed frontend confirms, the next ordinary release can
        // create a fresh plan, even though replacement before confirmation failed.
        let next = ShellUpdateHandoff {
            shell_version: "1.1.0".into(),
            ..handoff
        };
        assert!(write(home.path(), &next, "1.0.0").is_err());
        clear(home.path()).unwrap();
        clear(home.path()).unwrap();
        write(home.path(), &next, "1.0.0").unwrap();
        assert_eq!(read(home.path()).unwrap(), Some(next));
    }

    #[cfg(windows)]
    #[test]
    fn locked_record_preserves_the_old_plan_and_retries_after_unlock() {
        use std::os::windows::fs::OpenOptionsExt;
        let home = tempfile::tempdir().unwrap();
        let pending = ShellUpdateHandoff {
            schema_version: 1,
            shell_version: "0.78.1-beta.1".into(),
        };
        write(home.path(), &pending, "0.78.0-beta.1").unwrap();
        let lock = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(1) // Allow readers, but refuse replacement/deletion.
            .open(path(home.path()))
            .unwrap();
        let next = ShellUpdateHandoff {
            shell_version: "0.78.2-beta.1".into(),
            ..pending.clone()
        };
        assert!(write(home.path(), &next, "0.78.0-beta.1").is_err());
        assert_eq!(read(home.path()).unwrap(), Some(pending));
        assert_eq!(
            std::fs::read_dir(path(home.path()).parent().unwrap())
                .unwrap()
                .count(),
            1
        );
        drop(lock);
        write(home.path(), &next, "0.78.0-beta.1").unwrap();
        assert_eq!(read(home.path()).unwrap(), Some(next));
    }
}
