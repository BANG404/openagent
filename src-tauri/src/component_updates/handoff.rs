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

pub(crate) fn write(home: &Path, handoff: &ShellUpdateHandoff) -> Result<(), String> {
    let path = path(home);
    let directory = path.parent().expect("handoff path has a parent");
    std::fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let staging = directory.join(format!(".handoff-{}.tmp", uuid::Uuid::new_v4()));
    let bytes = serde_json::to_vec(handoff).map_err(|error| error.to_string())?;
    let mut file = std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&staging)
        .map_err(|error| error.to_string())?;
    file.write_all(&bytes).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    drop(file);
    // This owner serializes writes before a shell handoff; a prior transaction is
    // never silently overwritten by another update plan.
    if let Some(previous) = read(home)? {
        std::fs::remove_file(&staging).map_err(|error| error.to_string())?;
        return if previous == *handoff {
            Ok(())
        } else {
            Err("A different shell update continuation is already pending".into())
        };
    }
    let result = std::fs::hard_link(&staging, &path).map_err(|error| error.to_string());
    let _ = std::fs::remove_file(staging);
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
        write(&home, &handoff).unwrap();
        assert_eq!(read(&home).unwrap().unwrap().shell_version, "1.0.0");
        write(&home, &handoff).unwrap();
        let mut different = handoff;
        different.shell_version = "2.0.0".into();
        assert!(write(&home, &different).is_err());
        clear(&home).unwrap();
        assert!(read(&home).unwrap().is_none());
        std::fs::remove_dir_all(home).unwrap();
    }
}
