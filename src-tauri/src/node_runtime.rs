//! Shell-owned JavaScript interpreter resource and child-process environment.
//! The Runtime retains plugin resolution and process-policy ownership.

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Manager;

static NODE: OnceLock<PathBuf> = OnceLock::new();

fn executable_name() -> &'static str {
    if cfg!(windows) {
        "node.exe"
    } else {
        "node"
    }
}

pub(crate) fn initialize(app: &tauri::AppHandle) -> Result<(), String> {
    let directory = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    let binary = directory.join("node-runtime").join(executable_name());
    #[cfg(debug_assertions)]
    let binary = if binary.is_file() {
        binary
    } else {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/node-runtime")
            .join(executable_name())
    };
    require_binary(&binary)?;
    NODE.set(binary)
        .map_err(|_| "Bundled Node.js was already initialized".to_string())
}

fn require_binary(binary: &Path) -> Result<(), String> {
    if binary.is_file() {
        Ok(())
    } else {
        Err(format!(
            "OpenAgent's bundled Node.js is missing at {}. Repair or reinstall OpenAgent; source development requires bun scripts/prepare-node-runtime.mjs.",
            binary.display()
        ))
    }
}

/// Resolve a host-supervised node launcher without depending on the user's PATH.
pub(crate) fn program(command: &str) -> OsString {
    match NODE
        .get()
        .filter(|_| command == "node" || command == "node.exe")
    {
        Some(binary) => binary.as_os_str().to_owned(),
        None => command.into(),
    }
}

fn child_path(binary: &Path, inherited: Option<&OsStr>) -> Result<OsString, String> {
    require_binary(binary)?;
    let directory = binary
        .parent()
        .ok_or_else(|| "Bundled Node.js has no directory".to_string())?;
    let mut entries = vec![directory.to_path_buf()];
    if let Some(inherited) = inherited {
        entries.extend(std::env::split_paths(inherited).filter(|entry| entry != directory));
    }
    std::env::join_paths(entries)
        .map_err(|error| format!("Cannot prepare the plugin Node.js PATH: {error}"))
}

/// Applies only to children; never changes the OS or the multithreaded host environment.
pub(crate) fn configure(command: &mut std::process::Command) -> Result<(), String> {
    let Some(binary) = NODE.get() else {
        return Ok(());
    };
    let inherited = command
        .get_envs()
        .find(|(key, _)| key.to_string_lossy().eq_ignore_ascii_case("PATH"))
        .map(|(_, value)| value.map(OsStr::to_owned))
        .unwrap_or_else(|| std::env::var_os("PATH"));
    command.env("PATH", child_path(binary, inherited.as_deref())?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_node_runs_without_system_node_and_is_inherited_by_children() {
        let binary = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/node-runtime")
            .join(executable_name());
        let path =
            child_path(&binary, None).expect("prepare the bundled Node.js before native tests");
        let output = std::process::Command::new(&binary)
            .env("PATH", path)
            .args(["-e", "const {execFileSync}=require('node:child_process'); process.stdout.write(execFileSync('node',['-p','process.execPath']));"])
            .output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(
            Path::new(String::from_utf8_lossy(&output.stdout).trim())
                .canonicalize()
                .unwrap(),
            binary.canonicalize().unwrap()
        );
    }

    #[test]
    fn preserves_existing_path_and_reports_missing_resource() {
        let directory = tempfile::tempdir().unwrap();
        let binary = directory.path().join(executable_name());
        assert!(child_path(&binary, None)
            .unwrap_err()
            .contains("Repair or reinstall OpenAgent"));
        std::fs::write(&binary, []).unwrap();
        let other = directory.path().join("other");
        let inherited = std::env::join_paths([other.as_path(), directory.path()]).unwrap();
        let path = child_path(&binary, Some(&inherited)).unwrap();
        assert_eq!(
            std::env::split_paths(&path).collect::<Vec<_>>(),
            vec![directory.path().to_path_buf(), other]
        );
    }
}
