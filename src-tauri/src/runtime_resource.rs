use base64::{engine::general_purpose::STANDARD, Engine as _};
use minisign_verify::{PublicKey, Signature};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

const MANIFEST_FILE: &str = "openagent-sdk-manifest.json";
const SIGNATURE_FILE: &str = "openagent-sdk-manifest.json.sig";
const ACTIVE_FILE: &str = "active.json";
const MAX_MANIFEST_BYTES: usize = 1024 * 1024;
const MAX_SIGNATURE_BYTES: usize = 16 * 1024;

#[derive(Clone, Debug)]
pub struct RuntimeResourceSource {
    pub manifest_url: String,
    pub signature_url: String,
    /// Minisign public key text, including its untrusted-comment line.
    pub public_key: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RuntimeResourceArtifact {
    pub file: String,
    pub sha256: String,
    pub size: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RuntimeResourceProtocolRange {
    pub min: u32,
    pub max: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RuntimeResourceManifest {
    pub schema_version: u32,
    pub version: String,
    pub protocol: RuntimeResourceProtocolRange,
    pub artifacts: BTreeMap<String, RuntimeResourceArtifact>,
}

#[derive(Clone, Debug, Serialize)]
pub struct RuntimeResourceProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct InstalledRuntimeResource {
    pub version: String,
    pub target: String,
    pub binary_path: PathBuf,
    pub manifest_path: PathBuf,
    pub signature_path: PathBuf,
    pub protocol_min: u32,
    pub protocol_max: u32,
    pub size: u64,
    pub sha256: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
struct RuntimeResourceSelectionEntry {
    version: String,
    target: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
struct RuntimeResourceSelection {
    schema_version: u32,
    active: RuntimeResourceSelectionEntry,
    previous: Option<RuntimeResourceSelectionEntry>,
}

#[derive(Clone)]
pub struct RuntimeResourceManager {
    resources_dir: PathBuf,
    source: RuntimeResourceSource,
    protocol_version: u32,
    client: Client,
    operation: Arc<Mutex<()>>,
}

impl RuntimeResourceManager {
    pub fn new(
        openagent_home: PathBuf,
        source: RuntimeResourceSource,
        protocol_version: u32,
    ) -> Self {
        Self {
            resources_dir: openagent_home.join("resources").join("runtime"),
            source,
            protocol_version,
            client: Client::new(),
            operation: Arc::new(Mutex::new(())),
        }
    }

    pub fn resources_dir(&self) -> &Path {
        &self.resources_dir
    }

    pub async fn active_resource(&self) -> Result<Option<InstalledRuntimeResource>, String> {
        let _guard = self.operation.lock().await;
        self.active_resource_locked().await
    }

    pub async fn activate(&self, candidate: &InstalledRuntimeResource) -> Result<(), String> {
        let _guard = self.operation.lock().await;
        let verified = self
            .load_installed(&candidate.version, &candidate.target)
            .await?;
        if verified.binary_path != candidate.binary_path
            || verified.size != candidate.size
            || verified.sha256 != candidate.sha256
        {
            return Err("Runtime candidate does not match its verified installation".to_string());
        }
        let active = self.active_resource_locked().await?;
        let active_entry = selection_entry(&verified);
        let previous = active
            .as_ref()
            .filter(|active| selection_entry(active) != active_entry)
            .map(selection_entry);
        write_active(
            &self.resources_dir,
            &RuntimeResourceSelection {
                schema_version: 1,
                active: active_entry,
                previous,
            },
        )
    }

    pub async fn rollback_active(&self) -> Result<Option<InstalledRuntimeResource>, String> {
        let _guard = self.operation.lock().await;
        let Some(selection) = read_active(&self.resources_dir)? else {
            return Ok(None);
        };
        let Some(previous) = selection.previous else {
            remove_active(&self.resources_dir)?;
            return Ok(None);
        };
        let resource = match self
            .load_installed(&previous.version, &previous.target)
            .await
        {
            Ok(resource) => resource,
            Err(_) => {
                remove_active(&self.resources_dir)?;
                return Ok(None);
            }
        };
        write_active(
            &self.resources_dir,
            &RuntimeResourceSelection {
                schema_version: 1,
                active: selection_entry(&resource),
                previous: None,
            },
        )?;
        Ok(Some(resource))
    }

    pub async fn install_latest<F>(
        &self,
        mut on_progress: F,
    ) -> Result<InstalledRuntimeResource, String>
    where
        F: FnMut(RuntimeResourceProgress) + Send,
    {
        let _guard = self.operation.lock().await;
        let manifest_bytes = self
            .download_bounded(
                &self.source.manifest_url,
                MAX_MANIFEST_BYTES,
                "runtime manifest",
            )
            .await?;
        let signature_bytes = self
            .download_bounded(
                &self.source.signature_url,
                MAX_SIGNATURE_BYTES,
                "runtime manifest signature",
            )
            .await?;
        let manifest = verify_and_parse_manifest(
            &manifest_bytes,
            &signature_bytes,
            &self.source.public_key,
            self.protocol_version,
        )?;
        let target = current_runtime_resource_target()?.to_string();
        let artifact = manifest
            .artifacts
            .get(&target)
            .ok_or_else(|| format!("runtime manifest has no artifact for {target}"))?
            .clone();
        validate_artifact(&artifact)?;

        let version_dir = self.resources_dir.join(&manifest.version).join(&target);
        let installed = installed_resource(&version_dir, &manifest, &target, &artifact);
        if verify_installed(&installed, &artifact).await {
            return Ok(installed);
        }

        let staging = self.create_staging_dir(&manifest.version, &target).await?;
        let result = async {
            let artifact_url = Url::parse(&self.source.manifest_url)
                .map_err(|error| format!("runtime manifest URL is invalid: {error}"))?
                .join(&artifact.file)
                .map_err(|error| format!("runtime artifact URL is invalid: {error}"))?;
            let binary_path = staging.join(&artifact.file);
            self.download_artifact(artifact_url, &binary_path, &artifact, &mut on_progress)
                .await?;
            tokio::fs::write(staging.join(MANIFEST_FILE), &manifest_bytes)
                .await
                .map_err(|error| format!("failed to stage runtime manifest: {error}"))?;
            tokio::fs::write(staging.join(SIGNATURE_FILE), &signature_bytes)
                .await
                .map_err(|error| format!("failed to stage runtime signature: {error}"))?;
            self.commit_staging(&staging, &version_dir, &installed, &artifact)
                .await
        }
        .await;
        if result.is_err() {
            let _ = tokio::fs::remove_dir_all(&staging).await;
        }
        result?;
        if !verify_installed(&installed, &artifact).await {
            return Err("installed runtime resource failed verification".to_string());
        }
        Ok(installed)
    }

    async fn download_bounded(
        &self,
        url: &str,
        maximum: usize,
        label: &str,
    ) -> Result<Vec<u8>, String> {
        let mut response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|error| format!("failed to download {label}: {error}"))?
            .error_for_status()
            .map_err(|error| format!("failed to download {label}: {error}"))?;
        if response
            .content_length()
            .is_some_and(|length| length > maximum as u64)
        {
            return Err(format!("{label} exceeds the maximum allowed size"));
        }
        let mut bytes = Vec::with_capacity(
            response
                .content_length()
                .map(|length| length as usize)
                .unwrap_or_default(),
        );
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("failed to read {label}: {error}"))?
        {
            if bytes.len().saturating_add(chunk.len()) > maximum {
                return Err(format!("{label} exceeds the maximum allowed size"));
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }

    async fn active_resource_locked(&self) -> Result<Option<InstalledRuntimeResource>, String> {
        let Some(selection) = read_active(&self.resources_dir)? else {
            return Ok(None);
        };
        if selection.schema_version != 1
            || !safe_version(&selection.active.version)
            || selection.active.target != current_runtime_resource_target()?
        {
            remove_active(&self.resources_dir)?;
            return Ok(None);
        }
        match self
            .load_installed(&selection.active.version, &selection.active.target)
            .await
        {
            Ok(resource) => Ok(Some(resource)),
            Err(active_error) => {
                let Some(previous) = selection.previous else {
                    remove_active(&self.resources_dir)?;
                    return Err(format!(
                        "active Runtime resource failed verification: {active_error}"
                    ));
                };
                match self
                    .load_installed(&previous.version, &previous.target)
                    .await
                {
                    Ok(resource) => {
                        write_active(
                            &self.resources_dir,
                            &RuntimeResourceSelection {
                                schema_version: 1,
                                active: selection_entry(&resource),
                                previous: None,
                            },
                        )?;
                        Ok(Some(resource))
                    }
                    Err(previous_error) => {
                        remove_active(&self.resources_dir)?;
                        Err(format!(
                            "active Runtime resource failed verification ({active_error}); previous Runtime also failed verification ({previous_error})"
                        ))
                    }
                }
            }
        }
    }

    async fn load_installed(
        &self,
        version: &str,
        target: &str,
    ) -> Result<InstalledRuntimeResource, String> {
        if !safe_version(version) || target != current_runtime_resource_target()? {
            return Err("Runtime activation selection is unsafe or incompatible".to_string());
        }
        let version_dir = self.resources_dir.join(version).join(target);
        let manifest_path = version_dir.join(MANIFEST_FILE);
        let signature_path = version_dir.join(SIGNATURE_FILE);
        let manifest_bytes =
            read_bounded_file(&manifest_path, MAX_MANIFEST_BYTES, "runtime manifest").await?;
        let signature_bytes = read_bounded_file(
            &signature_path,
            MAX_SIGNATURE_BYTES,
            "runtime manifest signature",
        )
        .await?;
        let manifest = verify_and_parse_manifest(
            &manifest_bytes,
            &signature_bytes,
            &self.source.public_key,
            self.protocol_version,
        )?;
        if manifest.version != version {
            return Err(
                "Runtime manifest version does not match its installation directory".to_string(),
            );
        }
        let artifact = manifest
            .artifacts
            .get(target)
            .ok_or_else(|| format!("runtime manifest has no artifact for {target}"))?;
        let installed = installed_resource(&version_dir, &manifest, target, artifact);
        if !verify_installed(&installed, artifact).await {
            return Err("installed Runtime resource failed verification".to_string());
        }
        Ok(installed)
    }

    async fn download_artifact<F>(
        &self,
        url: Url,
        destination: &Path,
        artifact: &RuntimeResourceArtifact,
        on_progress: &mut F,
    ) -> Result<(), String>
    where
        F: FnMut(RuntimeResourceProgress),
    {
        let mut response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|error| format!("failed to download runtime binary: {error}"))?
            .error_for_status()
            .map_err(|error| format!("failed to download runtime binary: {error}"))?;
        if response
            .content_length()
            .is_some_and(|length| length != artifact.size)
        {
            return Err("runtime binary size does not match its manifest".to_string());
        }
        let mut output = tokio::fs::File::create(destination)
            .await
            .map_err(|error| format!("failed to create runtime binary: {error}"))?;
        let mut digest = Sha256::new();
        let mut downloaded = 0_u64;
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("failed to download runtime binary: {error}"))?
        {
            downloaded = downloaded
                .checked_add(chunk.len() as u64)
                .ok_or_else(|| "runtime binary size overflowed".to_string())?;
            if downloaded > artifact.size {
                return Err("runtime binary exceeds its declared size".to_string());
            }
            digest.update(&chunk);
            output
                .write_all(&chunk)
                .await
                .map_err(|error| format!("failed to write runtime binary: {error}"))?;
            on_progress(RuntimeResourceProgress {
                downloaded_bytes: downloaded,
                total_bytes: artifact.size,
            });
        }
        output
            .flush()
            .await
            .map_err(|error| format!("failed to flush runtime binary: {error}"))?;
        if downloaded != artifact.size {
            return Err("runtime binary size does not match its manifest".to_string());
        }
        if format!("{:x}", digest.finalize()) != artifact.sha256 {
            return Err("runtime binary checksum does not match its manifest".to_string());
        }
        set_executable(destination).await?;
        Ok(())
    }

    async fn create_staging_dir(&self, version: &str, target: &str) -> Result<PathBuf, String> {
        tokio::fs::create_dir_all(&self.resources_dir)
            .await
            .map_err(|error| format!("failed to create runtime resource directory: {error}"))?;
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| {
                format!("system clock cannot name runtime staging directory: {error}")
            })?
            .as_nanos();
        let staging = self
            .resources_dir
            .join(format!(".{version}-{target}-{nonce}.partial"));
        tokio::fs::create_dir(&staging)
            .await
            .map_err(|error| format!("failed to create runtime staging directory: {error}"))?;
        Ok(staging)
    }

    async fn commit_staging(
        &self,
        staging: &Path,
        version_dir: &Path,
        installed: &InstalledRuntimeResource,
        artifact: &RuntimeResourceArtifact,
    ) -> Result<(), String> {
        let parent = version_dir
            .parent()
            .ok_or_else(|| "runtime version directory has no parent".to_string())?;
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("failed to create runtime version directory: {error}"))?;
        if verify_installed(installed, artifact).await {
            let _ = tokio::fs::remove_dir_all(staging).await;
            return Ok(());
        }
        let backup = version_dir.with_extension(format!("replaced-{}", std::process::id()));
        if tokio::fs::try_exists(&backup).await.unwrap_or(false) {
            tokio::fs::remove_dir_all(&backup)
                .await
                .map_err(|error| format!("failed to clear corrupt runtime backup: {error}"))?;
        }
        let had_existing = tokio::fs::try_exists(version_dir).await.unwrap_or(false);
        if had_existing {
            tokio::fs::rename(version_dir, &backup)
                .await
                .map_err(|error| {
                    format!("failed to quarantine corrupt runtime resource: {error}")
                })?;
        }
        if let Err(error) = tokio::fs::rename(staging, version_dir).await {
            if verify_installed(installed, artifact).await {
                let _ = tokio::fs::remove_dir_all(staging).await;
                if had_existing {
                    let _ = tokio::fs::remove_dir_all(&backup).await;
                }
                return Ok(());
            }
            if had_existing {
                let _ = tokio::fs::rename(&backup, version_dir).await;
            }
            return Err(format!("failed to activate runtime resource: {error}"));
        }
        if had_existing {
            let _ = tokio::fs::remove_dir_all(backup).await;
        }
        Ok(())
    }
}

pub fn current_runtime_resource_target() -> Result<&'static str, String> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Ok("windows-x64"),
        ("linux", "x86_64") => Ok("linux-x64"),
        ("macos", "aarch64") => Ok("macos-arm64"),
        ("macos", "x86_64") => Ok("macos-x64"),
        (os, architecture) => Err(format!(
            "OpenAgent has no runtime resource for {os}/{architecture}"
        )),
    }
}

fn verify_and_parse_manifest(
    manifest_bytes: &[u8],
    signature_bytes: &[u8],
    public_key_text: &str,
    protocol_version: u32,
) -> Result<RuntimeResourceManifest, String> {
    let public_key = PublicKey::decode(public_key_text)
        .map_err(|error| format!("runtime signing public key is invalid: {error}"))?;
    let signature_text = decode_signature_text(signature_bytes, "runtime manifest signature")?;
    let signature = Signature::decode(&signature_text)
        .map_err(|error| format!("runtime manifest signature is invalid: {error}"))?;
    public_key
        .verify(manifest_bytes, &signature, false)
        .map_err(|error| format!("runtime manifest signature verification failed: {error}"))?;

    let manifest: RuntimeResourceManifest = serde_json::from_slice(manifest_bytes)
        .map_err(|error| format!("runtime manifest is invalid JSON: {error}"))?;
    validate_manifest(&manifest, protocol_version)?;
    Ok(manifest)
}

fn decode_signature_text(bytes: &[u8], label: &str) -> Result<String, String> {
    let text = std::str::from_utf8(bytes)
        .map_err(|_| format!("{label} is not UTF-8"))?
        .trim();
    if text.starts_with("untrusted comment:") {
        return Ok(text.to_string());
    }
    let decoded = STANDARD
        .decode(text)
        .map_err(|error| format!("{label} is neither minisign text nor Tauri Base64: {error}"))?;
    String::from_utf8(decoded).map_err(|_| format!("decoded {label} is not UTF-8"))
}

fn validate_manifest(
    manifest: &RuntimeResourceManifest,
    protocol_version: u32,
) -> Result<(), String> {
    if manifest.schema_version != 1 {
        return Err(format!(
            "unsupported runtime manifest schema {}",
            manifest.schema_version
        ));
    }
    if !safe_version(&manifest.version) {
        return Err("runtime manifest version is unsafe".to_string());
    }
    if manifest.protocol.min > manifest.protocol.max
        || protocol_version < manifest.protocol.min
        || protocol_version > manifest.protocol.max
    {
        return Err(format!(
            "runtime protocol {protocol_version} is incompatible with manifest range {}-{}",
            manifest.protocol.min, manifest.protocol.max
        ));
    }
    for artifact in manifest.artifacts.values() {
        validate_artifact(artifact)?;
    }
    Ok(())
}

fn validate_artifact(artifact: &RuntimeResourceArtifact) -> Result<(), String> {
    if artifact.file.is_empty()
        || Path::new(&artifact.file)
            .file_name()
            .and_then(|name| name.to_str())
            != Some(artifact.file.as_str())
    {
        return Err("runtime artifact filename is unsafe".to_string());
    }
    if artifact.size == 0 {
        return Err("runtime artifact size must be positive".to_string());
    }
    if artifact.sha256.len() != 64
        || !artifact
            .sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err("runtime artifact SHA-256 is invalid".to_string());
    }
    Ok(())
}

fn safe_version(version: &str) -> bool {
    !version.is_empty()
        && version.len() <= 128
        && !version.starts_with('.')
        && !version.ends_with('.')
        && !version.contains("..")
        && version
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'+'))
}

fn installed_resource(
    version_dir: &Path,
    manifest: &RuntimeResourceManifest,
    target: &str,
    artifact: &RuntimeResourceArtifact,
) -> InstalledRuntimeResource {
    InstalledRuntimeResource {
        version: manifest.version.clone(),
        target: target.to_string(),
        binary_path: version_dir.join(&artifact.file),
        manifest_path: version_dir.join(MANIFEST_FILE),
        signature_path: version_dir.join(SIGNATURE_FILE),
        protocol_min: manifest.protocol.min,
        protocol_max: manifest.protocol.max,
        size: artifact.size,
        sha256: artifact.sha256.clone(),
    }
}

fn selection_entry(resource: &InstalledRuntimeResource) -> RuntimeResourceSelectionEntry {
    RuntimeResourceSelectionEntry {
        version: resource.version.clone(),
        target: resource.target.clone(),
    }
}

fn active_path(resources_dir: &Path) -> PathBuf {
    resources_dir.join(ACTIVE_FILE)
}

fn read_active(resources_dir: &Path) -> Result<Option<RuntimeResourceSelection>, String> {
    match std::fs::read(active_path(resources_dir)) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|error| format!("Runtime activation state is invalid: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("failed to read Runtime activation state: {error}")),
    }
}

fn write_active(resources_dir: &Path, selection: &RuntimeResourceSelection) -> Result<(), String> {
    std::fs::create_dir_all(resources_dir)
        .map_err(|error| format!("failed to create Runtime resource directory: {error}"))?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("system clock cannot name Runtime activation state: {error}"))?
        .as_nanos();
    let temporary = resources_dir.join(format!(".{ACTIVE_FILE}.{}-{nonce}", std::process::id()));
    let bytes = serde_json::to_vec_pretty(selection)
        .map_err(|error| format!("failed to encode Runtime activation state: {error}"))?;
    std::fs::write(&temporary, bytes)
        .map_err(|error| format!("failed to stage Runtime activation state: {error}"))?;
    replace_file(&temporary, &active_path(resources_dir))
}

fn remove_active(resources_dir: &Path) -> Result<(), String> {
    match std::fs::remove_file(active_path(resources_dir)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("failed to clear Runtime activation state: {error}")),
    }
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    std::fs::rename(source, destination)
        .map_err(|error| format!("failed to activate Runtime selection: {error}"))
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    unsafe {
        MoveFileExW(
            PCWSTR(source.as_ptr()),
            PCWSTR(destination.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(|error| format!("failed to activate Runtime selection: {error}"))
}

async fn read_bounded_file(path: &Path, maximum: usize, label: &str) -> Result<Vec<u8>, String> {
    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|error| format!("failed to inspect installed {label}: {error}"))?;
    if metadata.len() > maximum as u64 {
        return Err(format!(
            "installed {label} exceeds the maximum allowed size"
        ));
    }
    tokio::fs::read(path)
        .await
        .map_err(|error| format!("failed to read installed {label}: {error}"))
}

async fn verify_installed(
    installed: &InstalledRuntimeResource,
    artifact: &RuntimeResourceArtifact,
) -> bool {
    let Ok(bytes) = tokio::fs::read(&installed.binary_path).await else {
        return false;
    };
    bytes.len() as u64 == artifact.size
        && format!("{:x}", Sha256::digest(&bytes)) == artifact.sha256
        && tokio::fs::try_exists(&installed.manifest_path)
            .await
            .unwrap_or(false)
        && tokio::fs::try_exists(&installed.signature_path)
            .await
            .unwrap_or(false)
}

#[cfg(unix)]
async fn set_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = tokio::fs::metadata(path)
        .await
        .map_err(|error| format!("failed to inspect runtime binary permissions: {error}"))?
        .permissions();
    permissions.set_mode(0o755);
    tokio::fs::set_permissions(path, permissions)
        .await
        .map_err(|error| format!("failed to mark runtime binary executable: {error}"))
}

#[cfg(not(unix))]
async fn set_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    const TAURI_TEST_PUBLIC_KEY: &str = "untrusted comment: minisign public key: F3E2CE91678DD036\nRWQ20I1nkc7i86e8j0+Jk41TEAN1vbGE+xIhUYs28OcUGs7zKUI9YDWI\n";
    const TAURI_RUNTIME_MANIFEST_BASE64: &str = "ewogICJzY2hlbWFfdmVyc2lvbiI6IDEsCiAgInZlcnNpb24iOiAiOS45LjktdGVzdC4xIiwKICAicHJvdG9jb2wiOiB7ICJtaW4iOiAyLCAibWF4IjogMiB9LAogICJhcnRpZmFjdHMiOiB7CiAgICAibGludXgteDY0IjogewogICAgICAiZmlsZSI6ICJvcGVuYWdlbnQtc2VydmVyLmJpbiIsCiAgICAgICJzaGEyNTYiOiAiMzM2NmE0ZGM2MDI4NzU2MjM2ZGFiZmZiNzZkNzlkZDY1NGE0NGNiZWIxYjFmMTRhNjE1MTlhZDg0YzA5ZmY4MyIsCiAgICAgICJzaXplIjogMTUKICAgIH0sCiAgICAibWFjb3MtYXJtNjQiOiB7CiAgICAgICJmaWxlIjogIm9wZW5hZ2VudC1zZXJ2ZXIuYmluIiwKICAgICAgInNoYTI1NiI6ICIzMzY2YTRkYzYwMjg3NTYyMzZkYWJmZmI3NmQ3OWRkNjU0YTQ0Y2JlYjFiMWYxNGE2MTUxOWFkODRjMDlmZjgzIiwKICAgICAgInNpemUiOiAxNQogICAgfSwKICAgICJtYWNvcy14NjQiOiB7CiAgICAgICJmaWxlIjogIm9wZW5hZ2VudC1zZXJ2ZXIuYmluIiwKICAgICAgInNoYTI1NiI6ICIzMzY2YTRkYzYwMjg3NTYyMzZkYWJmZmI3NmQ3OWRkNjU0YTQ0Y2JlYjFiMWYxNGE2MTUxOWFkODRjMDlmZjgzIiwKICAgICAgInNpemUiOiAxNQogICAgfSwKICAgICJ3aW5kb3dzLXg2NCI6IHsKICAgICAgImZpbGUiOiAib3BlbmFnZW50LXNlcnZlci5iaW4iLAogICAgICAic2hhMjU2IjogIjMzNjZhNGRjNjAyODc1NjIzNmRhYmZmYjc2ZDc5ZGQ2NTRhNDRjYmViMWIxZjE0YTYxNTE5YWQ4NGMwOWZmODMiLAogICAgICAic2l6ZSI6IDE1CiAgICB9CiAgfQp9Cg==";
    const TAURI_RUNTIME_SIGNATURE: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVRMjBJMW5rYzdpOC8wdFhNbVkxYm1FRXFoRkFLc0l1VGNjYVkzUytjN0JPUVMvZEMzODRBL1NlUEloN1Q4OEkyN2ZCdUl0RDBpdm9oZUlRYUhPYTM3UWF5Uk5wM1A0VXd3PQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzg4MDEwMDQ1CWZpbGU6b3BlbmFnZW50LXNkay1tYW5pZmVzdC5qc29uCmNvd0VNaDNrTFdBdnNjRk01U3g5aEhlK05rY3BFU1htNzlKM25EWFhCdHhRUGtHVDdmNklBQXY3VFFmanJDdkh0aEo0ZjVPMitMNGVsRzNBQUV0N0RRPT0K";

    #[test]
    fn verifies_tauri_base64_runtime_manifest_signatures() {
        let manifest_bytes = STANDARD.decode(TAURI_RUNTIME_MANIFEST_BASE64).unwrap();
        let manifest = verify_and_parse_manifest(
            &manifest_bytes,
            TAURI_RUNTIME_SIGNATURE.as_bytes(),
            TAURI_TEST_PUBLIC_KEY,
            2,
        )
        .unwrap();
        assert_eq!(manifest.version, "9.9.9-test.1");

        let mut tampered = manifest_bytes;
        tampered[1] ^= 1;
        assert!(verify_and_parse_manifest(
            &tampered,
            TAURI_RUNTIME_SIGNATURE.as_bytes(),
            TAURI_TEST_PUBLIC_KEY,
            2,
        )
        .is_err());
    }

    fn serve_signed_runtime_fixture(artifact: Vec<u8>) -> (String, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let manifest = STANDARD.decode(TAURI_RUNTIME_MANIFEST_BASE64).unwrap();
        let signature = TAURI_RUNTIME_SIGNATURE.as_bytes().to_vec();
        let server = std::thread::spawn(move || {
            for _ in 0..3 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = Vec::new();
                let mut buffer = [0_u8; 1024];
                while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                    let read = stream.read(&mut buffer).unwrap();
                    if read == 0 {
                        break;
                    }
                    request.extend_from_slice(&buffer[..read]);
                }
                let request = String::from_utf8(request).unwrap();
                let path = request
                    .lines()
                    .next()
                    .and_then(|line| line.split_whitespace().nth(1))
                    .unwrap();
                let body = match path {
                    "/openagent-sdk-manifest.json" => &manifest,
                    "/openagent-sdk-manifest.json.sig" => &signature,
                    "/openagent-server.bin" => &artifact,
                    _ => panic!("unexpected fixture request {path}"),
                };
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                )
                .unwrap();
                stream.write_all(body).unwrap();
            }
        });
        (format!("http://{address}"), server)
    }

    #[tokio::test]
    async fn installs_a_tauri_signed_runtime_over_http_and_rejects_tampering() {
        let artifact = b"runtime-fixture".to_vec();
        let (origin, server) = serve_signed_runtime_fixture(artifact.clone());
        let home = tempfile::tempdir().unwrap();
        let manager = RuntimeResourceManager::new(
            home.path().to_path_buf(),
            RuntimeResourceSource {
                manifest_url: format!("{origin}/openagent-sdk-manifest.json"),
                signature_url: format!("{origin}/openagent-sdk-manifest.json.sig"),
                public_key: TAURI_TEST_PUBLIC_KEY.to_string(),
            },
            2,
        );
        let mut progress = Vec::new();
        let installed = manager
            .install_latest(|event| progress.push(event))
            .await
            .unwrap();
        assert_eq!(installed.version, "9.9.9-test.1");
        assert_eq!(
            tokio::fs::read(&installed.binary_path).await.unwrap(),
            artifact
        );
        assert!(progress
            .last()
            .is_some_and(|event| { event.downloaded_bytes == 15 && event.total_bytes == 15 }));
        manager.activate(&installed).await.unwrap();
        assert_eq!(
            manager.active_resource().await.unwrap().unwrap().version,
            "9.9.9-test.1"
        );
        server.join().unwrap();

        let mut tampered = b"runtime-fixture".to_vec();
        tampered[0] ^= 1;
        let (origin, server) = serve_signed_runtime_fixture(tampered);
        let home = tempfile::tempdir().unwrap();
        let manager = RuntimeResourceManager::new(
            home.path().to_path_buf(),
            RuntimeResourceSource {
                manifest_url: format!("{origin}/openagent-sdk-manifest.json"),
                signature_url: format!("{origin}/openagent-sdk-manifest.json.sig"),
                public_key: TAURI_TEST_PUBLIC_KEY.to_string(),
            },
            2,
        );
        assert!(manager.install_latest(|_| {}).await.is_err());
        server.join().unwrap();
    }

    #[test]
    fn verifies_minisign_before_parsing_manifest_content() {
        let public_key = "untrusted comment: minisign public key E7620F1842B4E81F\n\
RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
        let signature = "untrusted comment: signature from minisign secret key\n\
RUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\n\
trusted comment: timestamp:1556193335\tfile:test\n\
y/rUw2y8/hOUYjZU71eHp/Wo1KZ40fGy2VJEDl34XMJM+TX48Ss/17u3IvIfbVR1FkZZSNCisQbuQY+bHwhEBg==";
        let key = PublicKey::decode(public_key).unwrap();
        let signature = Signature::decode(signature).unwrap();
        key.verify(b"test", &signature, false).unwrap();
        assert!(key.verify(b"tampered", &signature, false).is_err());
    }

    #[test]
    fn rejects_unsafe_or_incompatible_manifests() {
        let mut manifest = RuntimeResourceManifest {
            schema_version: 1,
            version: "1.2.3".to_string(),
            protocol: RuntimeResourceProtocolRange { min: 2, max: 2 },
            artifacts: BTreeMap::from([(
                "windows-x64".to_string(),
                RuntimeResourceArtifact {
                    file: "openagent-server.exe".to_string(),
                    sha256: "0".repeat(64),
                    size: 1,
                },
            )]),
        };
        validate_manifest(&manifest, 2).unwrap();

        manifest.version = "../escape".to_string();
        assert!(validate_manifest(&manifest, 2).is_err());
        manifest.version = "1.2.3".to_string();
        manifest.protocol.min = 3;
        manifest.protocol.max = 3;
        assert!(validate_manifest(&manifest, 2).is_err());
        manifest.protocol.min = 2;
        manifest.protocol.max = 2;
        manifest.artifacts.get_mut("windows-x64").unwrap().file =
            "../openagent-server.exe".to_string();
        assert!(validate_manifest(&manifest, 2).is_err());
    }

    #[tokio::test]
    async fn replaces_a_corrupt_immutable_version_with_verified_staging() {
        let temp = tempfile::tempdir().unwrap();
        let manager = RuntimeResourceManager::new(
            temp.path().to_path_buf(),
            RuntimeResourceSource {
                manifest_url: "https://example.invalid/openagent-sdk-manifest.json".to_string(),
                signature_url: "https://example.invalid/openagent-sdk-manifest.json.sig"
                    .to_string(),
                public_key: String::new(),
            },
            2,
        );
        let bytes = b"verified runtime";
        let artifact = RuntimeResourceArtifact {
            file: "openagent-server.exe".to_string(),
            sha256: format!("{:x}", Sha256::digest(bytes)),
            size: bytes.len() as u64,
        };
        let manifest = RuntimeResourceManifest {
            schema_version: 1,
            version: "1.2.3".to_string(),
            protocol: RuntimeResourceProtocolRange { min: 2, max: 2 },
            artifacts: BTreeMap::from([("windows-x64".to_string(), artifact.clone())]),
        };
        let version_dir = manager.resources_dir.join("1.2.3").join("windows-x64");
        tokio::fs::create_dir_all(&version_dir).await.unwrap();
        tokio::fs::write(version_dir.join(&artifact.file), b"corrupt")
            .await
            .unwrap();
        let staging = manager
            .create_staging_dir("1.2.3", "windows-x64")
            .await
            .unwrap();
        tokio::fs::write(staging.join(&artifact.file), bytes)
            .await
            .unwrap();
        tokio::fs::write(staging.join(MANIFEST_FILE), b"manifest")
            .await
            .unwrap();
        tokio::fs::write(staging.join(SIGNATURE_FILE), b"signature")
            .await
            .unwrap();
        let installed = installed_resource(&version_dir, &manifest, "windows-x64", &artifact);

        manager
            .commit_staging(&staging, &version_dir, &installed, &artifact)
            .await
            .unwrap();

        assert!(verify_installed(&installed, &artifact).await);
        assert_eq!(
            tokio::fs::read(&installed.binary_path).await.unwrap(),
            bytes
        );
    }

    #[test]
    fn activation_state_round_trips_active_and_previous_versions() {
        let temp = tempfile::tempdir().unwrap();
        let resources = temp.path().join("resources").join("runtime");
        let selection = RuntimeResourceSelection {
            schema_version: 1,
            active: RuntimeResourceSelectionEntry {
                version: "1.2.3".to_string(),
                target: current_runtime_resource_target().unwrap().to_string(),
            },
            previous: Some(RuntimeResourceSelectionEntry {
                version: "1.2.2".to_string(),
                target: current_runtime_resource_target().unwrap().to_string(),
            }),
        };

        write_active(&resources, &selection).unwrap();
        assert_eq!(read_active(&resources).unwrap(), Some(selection));
    }

    #[tokio::test]
    async fn unsafe_activation_state_is_cleared_before_path_resolution() {
        let temp = tempfile::tempdir().unwrap();
        let manager = RuntimeResourceManager::new(
            temp.path().to_path_buf(),
            RuntimeResourceSource {
                manifest_url: "https://example.invalid/openagent-sdk-manifest.json".to_string(),
                signature_url: "https://example.invalid/openagent-sdk-manifest.json.sig"
                    .to_string(),
                public_key: String::new(),
            },
            2,
        );
        std::fs::create_dir_all(manager.resources_dir()).unwrap();
        std::fs::write(
            active_path(manager.resources_dir()),
            format!(
                "{{\"schema_version\":1,\"active\":{{\"version\":\"../../escape\",\"target\":\"{}\"}},\"previous\":null}}",
                current_runtime_resource_target().unwrap()
            ),
        )
        .unwrap();

        assert!(manager.active_resource().await.unwrap().is_none());
        assert!(!active_path(manager.resources_dir()).exists());
    }
}
