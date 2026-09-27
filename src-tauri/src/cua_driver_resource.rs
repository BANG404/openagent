//! External Cua Driver resource installation and update discovery.
//!
//! The desktop shell owns the driver binary, while the Runtime only receives a
//! PATH entry. Releases are fetched from the upstream GitHub repository,
//! verified against GitHub's published asset digest, and installed atomically
//! under the selected OpenAgent home.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Cursor;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

const RELEASES_URL: &str = "https://api.github.com/repos/trycua/cua/releases?per_page=100";
const RELEASE_PREFIX: &str = "cua-driver-rs-v";
const RESOURCE_MARKER: &str = "openagent-resource.json";
const ACTIVE_FILE: &str = "active.json";
const MAX_RELEASES_BYTES: usize = 8 * 1024 * 1024;
const MAX_ARCHIVE_BYTES: usize = 256 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
pub struct CuaDriverResourceStatus {
    pub current_version: Option<String>,
    pub latest_version: String,
    pub target: String,
    pub update_available: bool,
    pub release_url: String,
}

#[derive(Clone, Debug)]
struct CuaDriverRelease {
    version: semver::Version,
    version_text: String,
    release_url: String,
    asset_name: String,
    asset_url: String,
    asset_sha256: String,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    digest: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct InstalledMarker {
    repository: String,
    version: String,
    target: String,
    asset: String,
    sha256: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct ActiveSelection {
    schema_version: u32,
    version: String,
    target: String,
}

#[derive(Clone)]
pub struct CuaDriverResourceManager {
    resources_dir: PathBuf,
    client: Client,
    operation: Arc<Mutex<()>>,
}

impl CuaDriverResourceManager {
    pub fn new(openagent_home: PathBuf) -> Self {
        Self {
            resources_dir: openagent_home.join("resources").join("cua-driver"),
            client: Client::builder()
                .user_agent("OpenAgent Cua Driver updater")
                .timeout(Duration::from_secs(30))
                .build()
                .expect("Cua Driver HTTP client must be constructible"),
            operation: Arc::new(Mutex::new(())),
        }
    }

    pub fn resources_dir(&self) -> &Path {
        &self.resources_dir
    }

    pub async fn active_resource(&self) -> Result<Option<(String, PathBuf)>, String> {
        let _guard = self.operation.lock().await;
        self.active_resource_locked()
    }

    /// Ensure the first usable driver is installed and return its executable.
    /// Existing installations remain active until the user accepts an update.
    pub async fn ensure_installed(&self) -> Result<PathBuf, String> {
        let _guard = self.operation.lock().await;
        if let Some((_, path)) = self.active_resource_locked()? {
            return Ok(path);
        }
        let release = self.fetch_latest().await?;
        let path = self.install_release(&release).await?;
        self.write_active(&release.version_text, &current_target())?;
        Ok(path)
    }

    /// Download and verify the latest upstream release without activating it.
    /// This lets the UI remind the user while the running daemon keeps serving
    /// the currently active executable.
    pub async fn prepare_latest(&self) -> Result<CuaDriverResourceStatus, String> {
        let _guard = self.operation.lock().await;
        let target = current_target();
        let release = self.fetch_latest().await?;
        let current = self.active_resource_locked()?.map(|(version, _)| version);
        let update_available = current
            .as_deref()
            .map(|value| {
                semver::Version::parse(value)
                    .map(|installed| release.version > installed)
                    .map_err(|error| format!("installed Cua Driver version is invalid: {error}"))
            })
            .transpose()?
            .unwrap_or(false);
        if current.is_none() {
            self.install_release(&release).await?;
            self.write_active(&release.version_text, &target)?;
        } else if update_available {
            self.install_release(&release).await?;
        }
        Ok(CuaDriverResourceStatus {
            current_version: current,
            latest_version: release.version_text,
            target,
            update_available,
            release_url: release.release_url,
        })
    }

    pub async fn activate(&self, version: &str, target: &str) -> Result<(), String> {
        let _guard = self.operation.lock().await;
        validate_version(version)?;
        if target != current_target() {
            return Err("Cua Driver candidate target does not match this desktop".to_string());
        }
        let directory = self.version_dir(version, target);
        if !is_valid_driver_directory(&directory) {
            return Err("Cua Driver candidate is not installed or is incomplete".to_string());
        }
        self.write_active(version, target)
    }

    async fn fetch_latest(&self) -> Result<CuaDriverRelease, String> {
        let response = self
            .client
            .get(RELEASES_URL)
            .send()
            .await
            .map_err(|error| format!("failed to query Cua Driver releases: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Cua Driver release query returned HTTP {}",
                response.status()
            ));
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|error| format!("failed to read Cua Driver release metadata: {error}"))?;
        if bytes.len() > MAX_RELEASES_BYTES {
            return Err("Cua Driver release metadata exceeds the size limit".to_string());
        }
        let releases: Vec<GitHubRelease> = serde_json::from_slice(&bytes)
            .map_err(|error| format!("Cua Driver release metadata is invalid JSON: {error}"))?;
        let target = current_target();
        releases
            .into_iter()
            .filter(|release| !release.draft && !release.prerelease)
            .filter_map(|release| release_for_target(release, &target))
            .max_by(|left, right| left.version.cmp(&right.version))
            .ok_or_else(|| format!("no Cua Driver asset is available for {target}"))
    }

    async fn install_release(&self, release: &CuaDriverRelease) -> Result<PathBuf, String> {
        let target = current_target();
        let version_dir = self.version_dir(&release.version_text, &target);
        let binary = version_dir.join(binary_name());
        if is_valid_driver_directory(&version_dir) {
            return Ok(binary);
        }
        let response = self
            .client
            .get(&release.asset_url)
            .send()
            .await
            .map_err(|error| format!("failed to download Cua Driver: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Cua Driver download returned HTTP {}",
                response.status()
            ));
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|error| format!("failed to read Cua Driver archive: {error}"))?;
        if bytes.len() > MAX_ARCHIVE_BYTES {
            return Err("Cua Driver archive exceeds the size limit".to_string());
        }
        let expected = release.asset_sha256.as_str();
        let actual = hex_digest(&bytes);
        if actual != expected {
            return Err(format!(
                "Cua Driver checksum mismatch: expected {expected}, received {actual}"
            ));
        }
        let root = self.resources_dir.clone();
        let version = release.version_text.clone();
        let target = target.clone();
        let asset_name = release.asset_name.clone();
        let digest = release.asset_sha256.clone();
        let archive_name = release.asset_name.clone();
        tokio::task::spawn_blocking(move || {
            install_archive(
                &root,
                &version,
                &target,
                &asset_name,
                &digest,
                &archive_name,
                &bytes,
            )
        })
        .await
        .map_err(|error| format!("Cua Driver installation task failed: {error}"))??;
        Ok(version_dir.join(binary_name()))
    }

    fn active_resource_locked(&self) -> Result<Option<(String, PathBuf)>, String> {
        let active_path = self.resources_dir.join(ACTIVE_FILE);
        let bytes = match std::fs::read(&active_path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(format!(
                    "failed to read Cua Driver active selection: {error}"
                ))
            }
        };
        let active: ActiveSelection = serde_json::from_slice(&bytes)
            .map_err(|error| format!("Cua Driver active selection is invalid: {error}"))?;
        if active.schema_version != 1
            || active.target != current_target()
            || validate_version(&active.version).is_err()
        {
            return Ok(None);
        }
        let directory = self.version_dir(&active.version, &active.target);
        if !is_valid_driver_directory(&directory) {
            return Ok(None);
        }
        Ok(Some((active.version, directory.join(binary_name()))))
    }

    fn version_dir(&self, version: &str, target: &str) -> PathBuf {
        self.resources_dir.join(version).join(target)
    }

    fn write_active(&self, version: &str, target: &str) -> Result<(), String> {
        std::fs::create_dir_all(&self.resources_dir)
            .map_err(|error| format!("failed to create Cua Driver resource directory: {error}"))?;
        let selection = serde_json::to_vec(&ActiveSelection {
            schema_version: 1,
            version: version.to_string(),
            target: target.to_string(),
        })
        .map_err(|error| format!("failed to encode Cua Driver active selection: {error}"))?;
        let temporary = self
            .resources_dir
            .join(format!(".{ACTIVE_FILE}.{}", std::process::id()));
        std::fs::write(&temporary, selection)
            .map_err(|error| format!("failed to write Cua Driver active selection: {error}"))?;
        replace_file(&temporary, &self.resources_dir.join(ACTIVE_FILE))
            .map_err(|error| format!("failed to activate Cua Driver: {error}"))
    }
}

fn release_for_target(release: GitHubRelease, target: &str) -> Option<CuaDriverRelease> {
    let version_text = release.tag_name.strip_prefix(RELEASE_PREFIX)?.to_string();
    let version = semver::Version::parse(&version_text).ok()?;
    let suffix = asset_suffix(target)?;
    let asset = release
        .assets
        .into_iter()
        .find(|asset| asset.name == format!("cua-driver-rs-{version_text}-{suffix}"))?;
    let digest = asset.digest?.strip_prefix("sha256:")?.to_ascii_lowercase();
    if digest.len() != 64 || !digest.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    Some(CuaDriverRelease {
        version,
        version_text,
        release_url: release.html_url,
        asset_name: asset.name,
        asset_url: asset.browser_download_url,
        asset_sha256: digest,
    })
}

fn asset_suffix(target: &str) -> Option<&'static str> {
    Some(match target {
        "aarch64-apple-darwin" => "darwin-arm64.tar.gz",
        "x86_64-apple-darwin" => "darwin-x86_64.tar.gz",
        "aarch64-unknown-linux-gnu" => "linux-arm64-binary.tar.gz",
        "x86_64-unknown-linux-gnu" => "linux-x86_64-binary.tar.gz",
        "aarch64-pc-windows-msvc" => "windows-arm64-binary.zip",
        "x86_64-pc-windows-msvc" => "windows-x86_64-binary.zip",
        _ => return None,
    })
}

fn current_target() -> String {
    if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "aarch64-pc-windows-msvc".to_string()
    } else if cfg!(target_os = "windows") {
        "x86_64-pc-windows-msvc".to_string()
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin".to_string()
    } else if cfg!(target_os = "macos") {
        "x86_64-apple-darwin".to_string()
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "aarch64-unknown-linux-gnu".to_string()
    } else {
        "x86_64-unknown-linux-gnu".to_string()
    }
}

fn binary_name() -> &'static str {
    if cfg!(windows) {
        "cua-driver.exe"
    } else {
        "cua-driver"
    }
}

fn is_valid_driver_directory(directory: &Path) -> bool {
    directory.is_dir()
        && directory.join(binary_name()).is_file()
        && directory.join(RESOURCE_MARKER).is_file()
}

fn validate_version(version: &str) -> Result<(), String> {
    semver::Version::parse(version)
        .map(|_| ())
        .map_err(|error| format!("Cua Driver version is invalid: {error}"))
}

fn hex_digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn safe_relative(path: &Path) -> Result<PathBuf, String> {
    if path.is_absolute() {
        return Err("Cua Driver archive contains an absolute path".to_string());
    }
    for component in path.components() {
        if matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        ) {
            return Err("Cua Driver archive contains a path traversal entry".to_string());
        }
    }
    Ok(path.to_path_buf())
}

fn install_archive(
    root: &Path,
    version: &str,
    target: &str,
    asset_name: &str,
    digest: &str,
    archive_name: &str,
    bytes: &[u8],
) -> Result<(), String> {
    let temporary = root.join(format!(".{version}-{target}-{}", std::process::id()));
    let destination = root.join(version).join(target);
    let _ = std::fs::remove_dir_all(&temporary);
    std::fs::create_dir_all(&temporary)
        .map_err(|error| format!("failed to create Cua Driver staging directory: {error}"))?;
    let result = if archive_name.ends_with(".zip") {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
            .map_err(|error| format!("Cua Driver zip archive is invalid: {error}"))?;
        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|error| format!("failed to read Cua Driver zip entry: {error}"))?;
            let relative = safe_relative(
                &entry
                    .enclosed_name()
                    .ok_or_else(|| "Cua Driver zip entry escapes the archive root".to_string())?,
            )?;
            let path = temporary.join(relative);
            if entry.is_dir() {
                std::fs::create_dir_all(&path).map_err(|error| error.to_string())?;
            } else {
                if let Some(parent) = path.parent() {
                    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                }
                let mut output = std::fs::File::create(&path).map_err(|error| error.to_string())?;
                std::io::copy(&mut entry, &mut output).map_err(|error| error.to_string())?;
            }
        }
        Ok(())
    } else {
        let decoder = flate2::read::GzDecoder::new(Cursor::new(bytes));
        let mut archive = tar::Archive::new(decoder);
        for entry in archive
            .entries()
            .map_err(|error| format!("Cua Driver tar archive is invalid: {error}"))?
        {
            let entry =
                entry.map_err(|error| format!("failed to read Cua Driver tar entry: {error}"))?;
            if entry.header().entry_type().is_symlink()
                || entry.header().entry_type().is_hard_link()
            {
                return Err("Cua Driver archive contains a link entry".to_string());
            }
            safe_relative(&entry.path().map_err(|error| error.to_string())?)?;
        }
        let decoder = flate2::read::GzDecoder::new(Cursor::new(bytes));
        tar::Archive::new(decoder)
            .unpack(&temporary)
            .map_err(|error| format!("failed to extract Cua Driver archive: {error}"))
    };
    result?;
    let binary = find_file(&temporary, binary_name())
        .ok_or_else(|| "Cua Driver archive does not contain its executable".to_string())?;
    let bundle_root = binary
        .parent()
        .ok_or_else(|| "Cua Driver archive has no executable directory".to_string())?;
    std::fs::create_dir_all(destination.parent().unwrap_or(root))
        .map_err(|error| error.to_string())?;
    let _ = std::fs::remove_dir_all(&destination);
    copy_directory_tree(bundle_root, &destination)
        .map_err(|error| format!("failed to install Cua Driver files: {error}"))?;
    #[cfg(unix)]
    {
        let permissions = std::os::unix::fs::PermissionsExt::from_mode(0o755);
        std::fs::set_permissions(destination.join(binary_name()), permissions)
            .map_err(|error| format!("failed to make Cua Driver executable: {error}"))?;
    }
    std::fs::write(
        destination.join(RESOURCE_MARKER),
        serde_json::to_vec_pretty(&InstalledMarker {
            repository: "https://github.com/trycua/cua".to_string(),
            version: version.to_string(),
            target: target.to_string(),
            asset: asset_name.to_string(),
            sha256: digest.to_string(),
        })
        .map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("failed to write Cua Driver marker: {error}"))?;
    let _ = std::fs::remove_dir_all(&temporary);
    Ok(())
}

fn find_file(directory: &Path, filename: &str) -> Option<PathBuf> {
    let entries = std::fs::read_dir(directory).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.file_name().is_some_and(|name| name == filename) {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_file(&path, filename) {
                return Some(found);
            }
        }
    }
    None
}

fn copy_directory_tree(source: &Path, destination: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(destination)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let target = destination.join(entry.file_name());
        if entry.path().is_dir() {
            copy_directory_tree(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        let _ = std::fs::remove_file(destination);
    }
    std::fs::rename(source, destination)
}

#[cfg(test)]
mod tests {
    use super::{asset_suffix, binary_name, hex_digest, install_archive, safe_relative};
    use flate2::{write::GzEncoder, Compression};
    use std::path::Path;

    #[test]
    fn maps_every_supported_target_to_the_upstream_asset() {
        assert_eq!(
            asset_suffix("x86_64-pc-windows-msvc"),
            Some("windows-x86_64-binary.zip")
        );
        assert_eq!(
            asset_suffix("aarch64-unknown-linux-gnu"),
            Some("linux-arm64-binary.tar.gz")
        );
        assert_eq!(asset_suffix("riscv64-unknown-linux-gnu"), None);
    }

    #[test]
    fn rejects_archive_path_traversal() {
        assert!(safe_relative(Path::new("../cua-driver")).is_err());
        assert!(safe_relative(Path::new("cua-driver")).is_ok());
    }

    #[test]
    fn computes_sha256_digest() {
        assert_eq!(
            hex_digest(b"openagent"),
            "ac56ac1145af54f552c74f3cbc160b6546d1e8a99342dc32afb6f519a77643f8"
        );
    }

    #[test]
    fn installs_a_verified_tar_archive_into_a_version_directory() {
        let fixture = tempfile::tempdir().expect("create Cua Driver fixture");
        let archive = Vec::new();
        let encoder = GzEncoder::new(archive, Compression::default());
        let mut builder = tar::Builder::new(encoder);
        let binary = b"driver";
        let mut header = tar::Header::new_gnu();
        header
            .set_path(format!("bundle/{}", binary_name()))
            .unwrap();
        header.set_size(binary.len() as u64);
        header.set_mode(0o755);
        header.set_cksum();
        builder.append(&header, &binary[..]).unwrap();
        let encoder = builder.into_inner().unwrap();
        let archive = encoder.finish().unwrap();
        let digest = hex_digest(&archive);

        install_archive(
            fixture.path(),
            "0.30.1",
            "test-target",
            "driver.tar.gz",
            &digest,
            "driver.tar.gz",
            &archive,
        )
        .unwrap();

        let destination = fixture.path().join("0.30.1").join("test-target");
        assert_eq!(
            std::fs::read(destination.join(binary_name())).unwrap(),
            binary
        );
        assert!(destination.join(super::RESOURCE_MARKER).is_file());
    }
}
