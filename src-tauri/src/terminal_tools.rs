//! Shell-owned portable command resources inherited by the supervised Runtime.

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Manager;

static DIRECTORY: OnceLock<PathBuf> = OnceLock::new();
const TOOLS: [&str; 3] = ["rg", "fd", "bat"];

fn executable_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_owned()
    }
}

pub(crate) fn initialize(app: &tauri::AppHandle) -> Result<(), String> {
    let directory = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?
        .join("terminal-tools");
    #[cfg(debug_assertions)]
    let directory = if directory.is_dir() {
        directory
    } else {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/terminal-tools")
    };
    require_tools(&directory)?;
    DIRECTORY
        .set(directory)
        .map_err(|_| "Bundled terminal tools were already initialized".into())
}

fn require_tools(directory: &Path) -> Result<(), String> {
    for name in TOOLS {
        let binary = directory.join(executable_name(name));
        if !binary.is_file() {
            return Err(format!(
                "OpenAgent's bundled {name} is missing at {}. Repair or reinstall OpenAgent; source development requires bun scripts/prepare-terminal-tools.mjs.",
                binary.display()
            ));
        }
    }
    Ok(())
}

fn child_path(directory: &Path, inherited: Option<&OsStr>) -> Result<OsString, String> {
    require_tools(directory)?;
    let mut entries = vec![directory.to_path_buf()];
    if let Some(inherited) = inherited {
        entries.extend(std::env::split_paths(inherited).filter(|entry| entry != directory));
    }
    std::env::join_paths(entries)
        .map_err(|error| format!("Cannot prepare the terminal tools PATH: {error}"))
}

/// Scope PATH to each Runtime child, including inspection, replacement and rollback.
pub(crate) fn configure(command: &mut std::process::Command) -> Result<(), String> {
    let Some(directory) = DIRECTORY.get() else {
        return Ok(());
    };
    configure_with_directory(command, directory)
}

fn configure_with_directory(
    command: &mut std::process::Command,
    directory: &Path,
) -> Result<(), String> {
    let inherited = command
        .get_envs()
        .find(|(key, _)| key.to_string_lossy().eq_ignore_ascii_case("PATH"))
        .map(|(_, value)| value.map(OsStr::to_owned))
        .unwrap_or_else(|| std::env::var_os("PATH"));
    command.env("PATH", child_path(directory, inherited.as_deref())?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_path_and_reports_an_incomplete_tool_set() {
        let directory = tempfile::tempdir().unwrap();
        let other = directory.path().join("other");
        for name in TOOLS {
            let error = child_path(directory.path(), None).unwrap_err();
            assert!(error.contains(&format!("bundled {name} is missing")));
            assert!(error.contains("Repair or reinstall"));
            std::fs::write(directory.path().join(executable_name(name)), []).unwrap();
        }
        let inherited = std::env::join_paths([other.as_path(), directory.path()]).unwrap();
        let path = child_path(directory.path(), Some(&inherited)).unwrap();
        assert_eq!(
            std::env::split_paths(&path).collect::<Vec<_>>(),
            vec![directory.path().to_path_buf(), other]
        );
    }

    #[test]
    fn bundled_tools_search_and_read_without_system_installations() {
        let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/terminal-tools");
        let workspace = tempfile::tempdir().unwrap();
        let sample = workspace.path().join("sample.txt");
        std::fs::write(&sample, "before\n").unwrap();
        #[cfg(windows)]
        let mut command = {
            let shell = PathBuf::from(std::env::var_os("SystemRoot").unwrap())
                .join("System32/WindowsPowerShell/v1.0/powershell.exe");
            let mut command = std::process::Command::new(shell);
            command.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]);
            command
        };
        #[cfg(not(windows))]
        let mut command = {
            let mut command = std::process::Command::new("/bin/sh");
            command.arg("-c");
            command
        };
        command.env("PATH", "");
        configure_with_directory(&mut command, &directory)
            .expect("prepare terminal tools before native tests");
        let output = command
            .arg("rg --color never before sample.txt; fd --color never sample; bat --color never --paging never --style plain sample.txt")
            .current_dir(workspace.path())
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            output.stderr.is_empty(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(stdout.contains("sample.txt"), "{stdout}");
        assert_eq!(stdout.matches("before").count(), 2, "{stdout}");
        assert_eq!(std::fs::read_to_string(sample).unwrap(), "before\n");
    }
}
