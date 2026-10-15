use std::path::{Path, PathBuf};

/// Select the product root before starting a Runtime. An explicit fixture or
/// user override always wins; the Runtime receives the resulting path.
pub fn select_data_root(
    explicit: Option<&Path>,
    user_home: Option<&Path>,
    product_version: &str,
    development: bool,
) -> Result<PathBuf, String> {
    if let Some(path) = explicit.filter(|path| !path.as_os_str().is_empty()) {
        return Ok(path.to_path_buf());
    }
    let home = user_home.ok_or("Cannot resolve application data directory")?;
    Ok(home.join(default_home_name(product_version, development)))
}

pub fn default_home_name(product_version: &str, development: bool) -> &'static str {
    if development {
        ".openagent-dev"
    } else if product_version.contains("-alpha.") {
        ".openagent-alpha"
    } else {
        ".openagent"
    }
}

/// A removed workspace must never become a Runtime's execution directory.
pub fn select_workspace(
    requested: Option<&Path>,
    configured: Option<&Path>,
    user_home: Option<&Path>,
) -> Result<PathBuf, String> {
    [requested, configured, user_home]
        .into_iter()
        .flatten()
        .find(|path| path.is_dir())
        .map(Path::to_path_buf)
        .ok_or_else(|| "No existing workspace directory is available".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_roots_override_release_and_development_policy() {
        let selected = Path::new("fixture");
        assert_eq!(
            select_data_root(Some(selected), None, "1.0.0", true).unwrap(),
            selected
        );
        assert_eq!(
            default_home_name("1.0.0-alpha.2", false),
            ".openagent-alpha"
        );
        assert_eq!(default_home_name("1.0.0-beta.2", false), ".openagent");
        assert_eq!(default_home_name("1.0.0-alpha.2", true), ".openagent-dev");
        assert!(select_data_root(None, None, "1.0.0", false).is_err());
    }

    #[test]
    fn missing_requested_workspace_falls_back_without_creating_it() {
        let configured = tempfile::tempdir().unwrap();
        let home = tempfile::tempdir().unwrap();
        let missing = configured.path().join("removed");
        assert_eq!(
            select_workspace(Some(&missing), Some(configured.path()), Some(home.path())).unwrap(),
            configured.path()
        );
        assert!(!missing.exists());
        assert!(select_workspace(Some(&missing), None, None).is_err());
    }
}
