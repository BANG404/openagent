use serde::Serialize;
use std::path::PathBuf;

#[derive(Clone, Debug, Serialize)]
pub struct WslDistribution {
    pub name: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct WslWorkspaceTarget {
    pub path: String,
    pub distribution: String,
    pub linux_path: String,
}

fn linux_path_to_windows(distribution: &str, linux_path: &str) -> Option<PathBuf> {
    if distribution.trim().is_empty() || !linux_path.starts_with('/') {
        return None;
    }
    let mut path = format!(r"\\wsl.localhost\{}", distribution.trim());
    for part in linux_path.split('/').filter(|part| !part.is_empty()) {
        path.push('\\');
        path.push_str(part);
    }
    Some(PathBuf::from(path))
}

#[cfg(any(windows, test))]
fn decode_windows_command_output(bytes: &[u8]) -> String {
    let looks_utf16 =
        bytes.len() >= 2 && bytes.len() % 2 == 0 && bytes.chunks_exact(2).any(|pair| pair[1] == 0);
    if looks_utf16 {
        let words = bytes
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect::<Vec<_>>();
        String::from_utf16_lossy(&words)
            .trim_start_matches('\u{feff}')
            .to_string()
    } else {
        String::from_utf8_lossy(bytes).replace('\0', "")
    }
}

#[cfg(windows)]
fn hidden_command() -> tokio::process::Command {
    use std::os::windows::process::CommandExt;
    let mut command = tokio::process::Command::new("wsl.exe");
    command.creation_flags(0x0800_0000);
    command
}

#[cfg(windows)]
async fn installed_distribution_names() -> Result<Vec<String>, String> {
    let output = hidden_command()
        .args(["--list", "--quiet"])
        .output()
        .await
        .map_err(|error| format!("Failed to start wsl.exe: {error}"))?;
    if !output.status.success() {
        let stderr = decode_windows_command_output(&output.stderr);
        return Err(if stderr.trim().is_empty() {
            "WSL is unavailable or has no installed distributions".to_string()
        } else {
            stderr.trim().to_string()
        });
    }
    let mut names = Vec::new();
    for line in decode_windows_command_output(&output.stdout).lines() {
        let name = line.trim().trim_matches('\0');
        if !name.is_empty() && !names.iter().any(|existing| existing == name) {
            names.push(name.to_string());
        }
    }
    Ok(names)
}

#[cfg(not(windows))]
async fn installed_distribution_names() -> Result<Vec<String>, String> {
    Err("WSL workspaces are available only on Windows".to_string())
}

pub async fn list_distributions() -> Result<Vec<WslDistribution>, String> {
    Ok(installed_distribution_names()
        .await?
        .into_iter()
        .map(|name| WslDistribution { name })
        .collect())
}

#[cfg(windows)]
async fn ensure_distribution_exists(distribution: &str) -> Result<(), String> {
    if installed_distribution_names()
        .await?
        .iter()
        .any(|name| name == distribution)
    {
        Ok(())
    } else {
        Err(format!(
            "WSL distribution '{distribution}' is not installed"
        ))
    }
}

#[cfg(windows)]
async fn canonical_linux_directory(distribution: &str, linux_path: &str) -> Result<String, String> {
    ensure_distribution_exists(distribution).await?;
    if !linux_path.starts_with('/') {
        return Err("WSL workspace path must be an absolute Linux path".to_string());
    }
    let output = hidden_command()
        .args([
            "--distribution",
            distribution,
            "--exec",
            "readlink",
            "-f",
            "--",
            linux_path,
        ])
        .output()
        .await
        .map_err(|error| format!("Failed to start WSL distribution '{distribution}': {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Cannot resolve '{linux_path}' in WSL distribution '{distribution}'"
        ));
    }
    let canonical = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !canonical.starts_with('/') {
        return Err(format!(
            "WSL returned an invalid path for '{linux_path}' in '{distribution}'"
        ));
    }
    let status = hidden_command()
        .args([
            "--distribution",
            distribution,
            "--exec",
            "test",
            "-d",
            &canonical,
        ])
        .status()
        .await
        .map_err(|error| format!("Failed to inspect WSL directory: {error}"))?;
    if !status.success() {
        return Err(format!(
            "WSL path '{canonical}' is not a directory in '{distribution}'"
        ));
    }
    Ok(canonical)
}

#[cfg(not(windows))]
async fn canonical_linux_directory(
    _distribution: &str,
    _linux_path: &str,
) -> Result<String, String> {
    Err("WSL workspaces are available only on Windows".to_string())
}

pub async fn resolve_workspace(
    distribution: &str,
    linux_path: &str,
) -> Result<WslWorkspaceTarget, String> {
    let canonical = canonical_linux_directory(distribution, linux_path).await?;
    let windows_path = linux_path_to_windows(distribution, &canonical)
        .ok_or_else(|| "Failed to map the WSL path to Windows".to_string())?;
    tokio::fs::metadata(&windows_path).await.map_err(|error| {
        format!(
            "Windows cannot access WSL path '{}': {error}",
            windows_path.display()
        )
    })?;
    Ok(WslWorkspaceTarget {
        path: windows_path.to_string_lossy().into_owned(),
        distribution: distribution.to_string(),
        linux_path: canonical,
    })
}

#[cfg(windows)]
pub async fn resolve_home(distribution: &str) -> Result<WslWorkspaceTarget, String> {
    ensure_distribution_exists(distribution).await?;
    let output = hidden_command()
        .args([
            "--distribution",
            distribution,
            "--exec",
            "sh",
            "-lc",
            "printf '%s' \"$HOME\"",
        ])
        .output()
        .await
        .map_err(|error| format!("Failed to start WSL distribution '{distribution}': {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Cannot determine the home directory for WSL distribution '{distribution}'"
        ));
    }
    resolve_workspace(distribution, String::from_utf8_lossy(&output.stdout).trim()).await
}

#[cfg(not(windows))]
pub async fn resolve_home(_distribution: &str) -> Result<WslWorkspaceTarget, String> {
    Err("WSL workspaces are available only on Windows".to_string())
}

#[cfg(test)]
mod tests {
    use super::{decode_windows_command_output, linux_path_to_windows};
    use std::path::PathBuf;

    #[test]
    fn maps_linux_paths_to_wsl_shares() {
        assert_eq!(
            linux_path_to_windows(" Ubuntu ", "/tmp/output.txt"),
            Some(PathBuf::from(r"\\wsl.localhost\Ubuntu\tmp\output.txt"))
        );
    }

    #[test]
    fn decodes_utf16_distribution_names() {
        let bytes = "Ubuntu\r\n"
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect::<Vec<_>>();
        assert_eq!(decode_windows_command_output(&bytes), "Ubuntu\r\n");
    }
}
