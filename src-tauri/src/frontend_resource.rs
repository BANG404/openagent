use base64::{engine::general_purpose::STANDARD, Engine as _};
use flate2::read::GzDecoder;
use http::{header, Request, Response, StatusCode};
use minisign_verify::{PublicKey, Signature};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, RwLock};
use tokio::sync::Mutex;

const MAX_MANIFEST_BYTES: usize = 1024 * 1024;
const MAX_SIGNATURE_BYTES: usize = 16 * 1024;
const MAX_ARCHIVE_BYTES: usize = 128 * 1024 * 1024;
const MAX_UNPACKED_BYTES: u64 = 256 * 1024 * 1024;
const MAX_FILES: usize = 20_000;
const ACTIVE_FILE: &str = "active.json";
const INSTALLED_MANIFEST_FILE: &str = ".openagent-frontend-manifest.json";
const INSTALLED_SIGNATURE_FILE: &str = ".openagent-frontend-manifest.json.sig";

pub type FrontendAssetRoot = Arc<RwLock<Option<PathBuf>>>;
pub const FRONTEND_SCHEME: &str = "openagent-ui";
pub const FRONTEND_HOST_PROTOCOL_VERSION: u32 = 1;

#[derive(Clone, Debug)]
pub struct FrontendResourceSource {
    pub manifest_url: String,
    pub signature_url: String,
    pub public_key: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct FrontendArtifact {
    pub file: String,
    pub sha256: String,
    pub size: u64,
    pub unpacked_size: u64,
    pub files: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct FrontendManifest {
    pub schema_version: u32,
    pub version: String,
    pub protocol: FrontendProtocolRange,
    pub artifact: FrontendArtifact,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct FrontendProtocolRange {
    pub min: u32,
    pub max: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct InstalledFrontendResource {
    pub version: String,
    pub root: PathBuf,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct ActiveFrontend {
    version: String,
    previous_version: Option<String>,
    pending_confirmation: bool,
}

#[derive(Clone)]
pub struct FrontendResourceManager {
    resources_dir: PathBuf,
    source: FrontendResourceSource,
    client: reqwest::Client,
    root: FrontendAssetRoot,
    operation: Arc<Mutex<()>>,
    embedded_version: semver::Version,
    host_protocol: u32,
}

impl FrontendResourceManager {
    pub fn new(
        openagent_home: PathBuf,
        source: FrontendResourceSource,
        embedded_version: &str,
        host_protocol: u32,
    ) -> Result<Self, String> {
        let manager = Self {
            resources_dir: openagent_home.join("resources").join("frontend"),
            source,
            client: reqwest::Client::new(),
            root: Arc::new(RwLock::new(None)),
            operation: Arc::new(Mutex::new(())),
            embedded_version: semver::Version::parse(embedded_version)
                .map_err(|error| format!("embedded frontend version is invalid: {error}"))?,
            host_protocol,
        };
        manager.restore_startup_selection()?;
        Ok(manager)
    }

    pub fn asset_root(&self) -> FrontendAssetRoot {
        self.root.clone()
    }

    pub fn active_version(&self) -> Option<String> {
        read_active(&self.resources_dir)
            .ok()
            .flatten()
            .filter(|active| frontend_version_root(&self.resources_dir, &active.version).is_some())
            .map(|active| active.version)
    }

    pub fn is_newer_than_active(&self, version: &str) -> Result<bool, String> {
        let candidate = semver::Version::parse(version)
            .map_err(|error| format!("frontend version is invalid: {error}"))?;
        let baseline = read_active(&self.resources_dir)?
            .and_then(|active| {
                frontend_version_root(&self.resources_dir, &active.version)
                    .and_then(|_| semver::Version::parse(&active.version).ok())
            })
            .unwrap_or_else(|| self.embedded_version.clone());
        Ok(candidate > baseline)
    }

    pub async fn install_latest(&self) -> Result<InstalledFrontendResource, String> {
        let _guard = self.operation.lock().await;
        let manifest_bytes = self
            .download_bounded(
                &self.source.manifest_url,
                MAX_MANIFEST_BYTES,
                "frontend manifest",
            )
            .await?;
        let signature_bytes = self
            .download_bounded(
                &self.source.signature_url,
                MAX_SIGNATURE_BYTES,
                "frontend manifest signature",
            )
            .await?;
        let manifest = verify_manifest(
            &manifest_bytes,
            &signature_bytes,
            &self.source.public_key,
            self.host_protocol,
        )?;
        let version_dir = self.resources_dir.join(&manifest.version);
        if valid_frontend_root(&version_dir)
            && installed_metadata_matches(&version_dir, &manifest_bytes, &signature_bytes)
        {
            return Ok(InstalledFrontendResource {
                version: manifest.version,
                root: version_dir,
            });
        }

        let archive_url = reqwest::Url::parse(&self.source.manifest_url)
            .map_err(|error| format!("frontend manifest URL is invalid: {error}"))?
            .join(&manifest.artifact.file)
            .map_err(|error| format!("frontend artifact URL is invalid: {error}"))?;
        let archive = self
            .download_bounded(archive_url.as_str(), MAX_ARCHIVE_BYTES, "frontend artifact")
            .await?;
        verify_archive(&archive, &manifest.artifact)?;

        tokio::fs::create_dir_all(&self.resources_dir)
            .await
            .map_err(|error| format!("failed to create frontend resource directory: {error}"))?;
        let staging = self
            .resources_dir
            .join(format!(".staging-{}", uuid::Uuid::new_v4()));
        let extraction = staging.clone();
        let artifact = manifest.artifact.clone();
        let extraction_result =
            tokio::task::spawn_blocking(move || extract_archive(&archive, &extraction, &artifact))
                .await
                .map_err(|error| format!("frontend extraction task failed: {error}"))?;
        if let Err(error) = extraction_result {
            let _ = tokio::fs::remove_dir_all(&staging).await;
            return Err(error);
        }
        if !valid_frontend_root(&staging) {
            let _ = tokio::fs::remove_dir_all(&staging).await;
            return Err("frontend archive has no usable index.html".to_string());
        }
        tokio::fs::write(staging.join(INSTALLED_MANIFEST_FILE), manifest_bytes)
            .await
            .map_err(|error| format!("failed to store frontend manifest: {error}"))?;
        tokio::fs::write(staging.join(INSTALLED_SIGNATURE_FILE), signature_bytes)
            .await
            .map_err(|error| format!("failed to store frontend signature: {error}"))?;
        if version_dir.exists() {
            tokio::fs::remove_dir_all(&version_dir)
                .await
                .map_err(|error| format!("failed to repair frontend version directory: {error}"))?;
        }
        tokio::fs::rename(&staging, &version_dir)
            .await
            .map_err(|error| format!("failed to commit frontend resource: {error}"))?;
        Ok(InstalledFrontendResource {
            version: manifest.version,
            root: version_dir,
        })
    }

    pub async fn activate(&self, version: &str) -> Result<(), String> {
        let _guard = self.operation.lock().await;
        if !safe_version(version) {
            return Err("frontend version is unsafe".to_string());
        }
        if !self.is_newer_than_active(version)? {
            return Err("frontend candidate is not newer than the active frontend".to_string());
        }
        let root = frontend_version_root(&self.resources_dir, version)
            .ok_or_else(|| "frontend version is not installed or is incomplete".to_string())?;
        let previous_version = read_active(&self.resources_dir)?.and_then(|active| {
            (!active.pending_confirmation
                && frontend_version_root(&self.resources_dir, &active.version).is_some())
            .then_some(active.version)
        });
        write_active(
            &self.resources_dir,
            &ActiveFrontend {
                version: version.to_string(),
                previous_version,
                pending_confirmation: true,
            },
        )?;
        *self
            .root
            .write()
            .map_err(|_| "frontend asset root lock is poisoned".to_string())? = Some(root);
        Ok(())
    }

    pub async fn confirm(&self, version: &str) -> Result<(), String> {
        let _guard = self.operation.lock().await;
        let Some(mut active) = read_active(&self.resources_dir)? else {
            return Err("no external frontend is active".to_string());
        };
        if active.version != version {
            return Err(
                "frontend activation confirmation does not match the pending version".to_string(),
            );
        }
        if !active.pending_confirmation {
            return Ok(());
        }
        active.pending_confirmation = false;
        write_active(&self.resources_dir, &active)
    }

    pub async fn rollback_pending(&self) -> Result<bool, String> {
        let _guard = self.operation.lock().await;
        self.rollback_pending_locked()
    }

    fn restore_startup_selection(&self) -> Result<(), String> {
        let active = match read_active(&self.resources_dir) {
            Ok(active) => active,
            Err(_) => {
                remove_active(&self.resources_dir)?;
                None
            }
        };
        if active
            .as_ref()
            .is_some_and(|active| active.pending_confirmation)
        {
            self.rollback_pending_locked()?;
        } else if let Some(active) = active {
            if frontend_version_root(&self.resources_dir, &active.version).is_none() {
                let replacement = active.previous_version.and_then(|version| {
                    frontend_version_root(&self.resources_dir, &version).map(|_| ActiveFrontend {
                        version,
                        previous_version: None,
                        pending_confirmation: false,
                    })
                });
                match replacement {
                    Some(replacement) => write_active(&self.resources_dir, &replacement)?,
                    None => remove_active(&self.resources_dir)?,
                }
            }
        }
        let selected = read_active(&self.resources_dir)?
            .and_then(|active| frontend_version_root(&self.resources_dir, &active.version));
        *self
            .root
            .write()
            .map_err(|_| "frontend asset root lock is poisoned".to_string())? = selected;
        Ok(())
    }

    fn rollback_pending_locked(&self) -> Result<bool, String> {
        let Some(active) = read_active(&self.resources_dir)? else {
            return Ok(false);
        };
        if !active.pending_confirmation {
            return Ok(false);
        }
        let replacement = active.previous_version.and_then(|version| {
            frontend_version_root(&self.resources_dir, &version).map(|_| ActiveFrontend {
                version,
                previous_version: None,
                pending_confirmation: false,
            })
        });
        match replacement {
            Some(replacement) => write_active(&self.resources_dir, &replacement)?,
            None => remove_active(&self.resources_dir)?,
        }
        let selected = read_active(&self.resources_dir)?
            .and_then(|active| frontend_version_root(&self.resources_dir, &active.version));
        *self
            .root
            .write()
            .map_err(|_| "frontend asset root lock is poisoned".to_string())? = selected;
        Ok(true)
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
}

fn verify_manifest(
    manifest_bytes: &[u8],
    signature_bytes: &[u8],
    public_key_text: &str,
    host_protocol: u32,
) -> Result<FrontendManifest, String> {
    let public_key = PublicKey::decode(public_key_text)
        .map_err(|error| format!("frontend signing public key is invalid: {error}"))?;
    let signature_text = decode_signature_text(signature_bytes, "frontend manifest signature")?;
    let signature = Signature::decode(&signature_text)
        .map_err(|error| format!("frontend manifest signature is invalid: {error}"))?;
    public_key
        .verify(manifest_bytes, &signature, false)
        .map_err(|error| format!("frontend manifest signature verification failed: {error}"))?;
    let manifest: FrontendManifest = serde_json::from_slice(manifest_bytes)
        .map_err(|error| format!("frontend manifest is invalid JSON: {error}"))?;
    validate_manifest(&manifest, host_protocol)?;
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

fn validate_manifest(manifest: &FrontendManifest, host_protocol: u32) -> Result<(), String> {
    if manifest.schema_version != 1
        || !safe_version(&manifest.version)
        || semver::Version::parse(&manifest.version).is_err()
        || manifest.protocol.min > manifest.protocol.max
        || host_protocol < manifest.protocol.min
        || host_protocol > manifest.protocol.max
    {
        return Err("frontend manifest schema or version is invalid".to_string());
    }
    let artifact = &manifest.artifact;
    if Path::new(&artifact.file)
        .file_name()
        .and_then(|name| name.to_str())
        != Some(artifact.file.as_str())
        || !artifact.file.ends_with(".tar.gz")
        || artifact.size == 0
        || artifact.size > MAX_ARCHIVE_BYTES as u64
        || artifact.unpacked_size == 0
        || artifact.unpacked_size > MAX_UNPACKED_BYTES
        || artifact.files == 0
        || artifact.files > MAX_FILES
        || artifact.sha256.len() != 64
        || !artifact
            .sha256
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
    {
        return Err("frontend artifact metadata is invalid".to_string());
    }
    Ok(())
}

fn verify_archive(bytes: &[u8], artifact: &FrontendArtifact) -> Result<(), String> {
    if bytes.len() as u64 != artifact.size {
        return Err("frontend artifact size does not match the manifest".to_string());
    }
    let digest = format!("{:x}", Sha256::digest(bytes));
    if digest != artifact.sha256 {
        return Err("frontend artifact SHA-256 does not match the manifest".to_string());
    }
    Ok(())
}

fn extract_archive(
    bytes: &[u8],
    destination: &Path,
    expected: &FrontendArtifact,
) -> Result<(), String> {
    std::fs::create_dir_all(destination)
        .map_err(|error| format!("failed to create frontend staging directory: {error}"))?;
    let decoder = GzDecoder::new(bytes);
    let mut archive = tar::Archive::new(decoder);
    let mut files = 0usize;
    let mut unpacked = 0u64;
    for entry in archive
        .entries()
        .map_err(|error| format!("failed to inspect frontend archive: {error}"))?
    {
        let mut entry =
            entry.map_err(|error| format!("invalid frontend archive entry: {error}"))?;
        let path = entry
            .path()
            .map_err(|error| format!("invalid frontend archive path: {error}"))?
            .into_owned();
        let reserved = path.components().any(|component| match component {
            Component::Normal(name) => name
                .to_str()
                .is_some_and(|name| name.starts_with(".openagent-")),
            _ => false,
        });
        if path.as_os_str().is_empty()
            || !path
                .components()
                .all(|component| matches!(component, Component::CurDir | Component::Normal(_)))
            || reserved
        {
            return Err("frontend archive contains an unsafe path".to_string());
        }
        let kind = entry.header().entry_type();
        if !(kind.is_file() || kind.is_dir()) {
            return Err("frontend archive contains an unsupported entry type".to_string());
        }
        if kind.is_file() {
            files = files.saturating_add(1);
            unpacked = unpacked.saturating_add(entry.size());
            if files > expected.files || unpacked > expected.unpacked_size {
                return Err("frontend archive exceeds its declared limits".to_string());
            }
        }
        entry
            .unpack_in(destination)
            .map_err(|error| format!("failed to extract frontend archive: {error}"))?;
    }
    if files != expected.files || unpacked != expected.unpacked_size {
        return Err("frontend archive contents do not match the manifest".to_string());
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

fn valid_frontend_root(root: &Path) -> bool {
    root.is_dir() && root.join("index.html").is_file()
}

fn installed_metadata_matches(root: &Path, manifest: &[u8], signature: &[u8]) -> bool {
    std::fs::read(root.join(INSTALLED_MANIFEST_FILE)).is_ok_and(|stored| stored == manifest)
        && std::fs::read(root.join(INSTALLED_SIGNATURE_FILE))
            .is_ok_and(|stored| stored == signature)
}

fn frontend_version_root(resources_dir: &Path, version: &str) -> Option<PathBuf> {
    if !safe_version(version) {
        return None;
    }
    let root = resources_dir.join(version);
    valid_frontend_root(&root).then_some(root)
}

fn active_path(resources_dir: &Path) -> PathBuf {
    resources_dir.join(ACTIVE_FILE)
}

fn read_active(resources_dir: &Path) -> Result<Option<ActiveFrontend>, String> {
    let path = active_path(resources_dir);
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("failed to read frontend activation state: {error}")),
    };
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| format!("frontend activation state is invalid: {error}"))
}

fn write_active(resources_dir: &Path, active: &ActiveFrontend) -> Result<(), String> {
    std::fs::create_dir_all(resources_dir)
        .map_err(|error| format!("failed to create frontend resource directory: {error}"))?;
    let path = active_path(resources_dir);
    let temporary = resources_dir.join(format!(".{ACTIVE_FILE}.{}", uuid::Uuid::new_v4()));
    let bytes = serde_json::to_vec_pretty(active)
        .map_err(|error| format!("failed to encode frontend activation state: {error}"))?;
    std::fs::write(&temporary, bytes)
        .map_err(|error| format!("failed to stage frontend activation state: {error}"))?;
    replace_file(&temporary, &path)
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    std::fs::rename(source, destination)
        .map_err(|error| format!("failed to activate frontend version: {error}"))
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
    .map_err(|error| format!("failed to activate frontend version: {error}"))
}

fn remove_active(resources_dir: &Path) -> Result<(), String> {
    match std::fs::remove_file(active_path(resources_dir)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "failed to clear frontend activation state: {error}"
        )),
    }
}

fn response(status: StatusCode, content_type: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(body)
        .expect("valid frontend protocol response")
}

fn requested_asset(uri_path: &str) -> Option<PathBuf> {
    let decoded = percent_encoding::percent_decode_str(uri_path.trim_start_matches('/'))
        .decode_utf8()
        .ok()?;
    if decoded.is_empty() {
        return Some(PathBuf::from("index.html"));
    }
    let path = Path::new(decoded.as_ref());
    path.components()
        .all(|component| matches!(component, Component::Normal(_)))
        .then(|| path.to_path_buf())
}

pub async fn serve(request: Request<Vec<u8>>, root: FrontendAssetRoot) -> Response<Vec<u8>> {
    let Some(relative) = requested_asset(request.uri().path()) else {
        return response(
            StatusCode::BAD_REQUEST,
            "text/plain; charset=utf-8",
            Vec::new(),
        );
    };
    let root = root.read().ok().and_then(|root| root.clone());
    let Some(root) = root else {
        return response(
            StatusCode::SERVICE_UNAVAILABLE,
            "text/plain; charset=utf-8",
            Vec::new(),
        );
    };
    let canonical_root = match tokio::fs::canonicalize(&root).await {
        Ok(root) => root,
        Err(_) => {
            return response(
                StatusCode::SERVICE_UNAVAILABLE,
                "text/plain; charset=utf-8",
                Vec::new(),
            )
        }
    };
    let requested = root.join(&relative);
    let resolved = match tokio::fs::canonicalize(&requested).await {
        Ok(path) if path.starts_with(&canonical_root) => path,
        Ok(_) => {
            return response(
                StatusCode::FORBIDDEN,
                "text/plain; charset=utf-8",
                Vec::new(),
            )
        }
        Err(error)
            if error.kind() == std::io::ErrorKind::NotFound && relative.extension().is_none() =>
        {
            canonical_root.join("index.html")
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return response(
                StatusCode::NOT_FOUND,
                "text/plain; charset=utf-8",
                Vec::new(),
            )
        }
        Err(_) => {
            return response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "text/plain; charset=utf-8",
                Vec::new(),
            )
        }
    };
    if !resolved.starts_with(&canonical_root)
        || !tokio::fs::metadata(&resolved)
            .await
            .is_ok_and(|metadata| metadata.is_file())
    {
        return response(
            StatusCode::NOT_FOUND,
            "text/plain; charset=utf-8",
            Vec::new(),
        );
    }
    let mime = mime_guess::from_path(&resolved).first_or_octet_stream();
    if request.method() == http::Method::HEAD {
        return response(StatusCode::OK, mime.essence_str(), Vec::new());
    }
    match tokio::fs::read(resolved).await {
        Ok(bytes) => response(StatusCode::OK, mime.essence_str(), bytes),
        Err(_) => response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "text/plain; charset=utf-8",
            Vec::new(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        extract_archive, requested_asset, safe_version, serve, validate_manifest, FrontendArtifact,
        FrontendManifest, FrontendProtocolRange, FrontendResourceManager, FrontendResourceSource,
    };
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use http::{Request, StatusCode};
    use std::io::{Read, Write};
    use std::net::TcpListener;

    const TAURI_TEST_PUBLIC_KEY: &str = "untrusted comment: minisign public key: F3E2CE91678DD036\nRWQ20I1nkc7i86e8j0+Jk41TEAN1vbGE+xIhUYs28OcUGs7zKUI9YDWI\n";
    const TAURI_FRONTEND_MANIFEST_BASE64: &str = "ewogICJzY2hlbWFfdmVyc2lvbiI6IDEsCiAgInZlcnNpb24iOiAiOS45LjktdGVzdC4xIiwKICAicHJvdG9jb2wiOiB7ICJtaW4iOiAxLCAibWF4IjogMSB9LAogICJhcnRpZmFjdCI6IHsKICAgICJmaWxlIjogIm9wZW5hZ2VudC1mcm9udGVuZC50YXIuZ3oiLAogICAgInNoYTI1NiI6ICI0NzhkMWVkMWRmY2UzMjlkNWMxNTA3NzQyZmNmNzY0NWYyMTg2ZTgwNWQ1MzJmMzkxZWU2ODQwZWZlYTlmYjRiIiwKICAgICJzaXplIjogMjMwLAogICAgInVucGFja2VkX3NpemUiOiAxMDksCiAgICAiZmlsZXMiOiAyCiAgfQp9Cg==";
    const TAURI_FRONTEND_SIGNATURE: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVRMjBJMW5rYzdpODN4dTlXd0dEck1jOUlZU3B3WHlLUVdPL2MxZW5ROWRFNFZ3b01oL0JVd052MjFKN3MzeFJLVnFrZzZ2RVo1MktKUnFnRFNQWjB4WlMrbi9YMy9WbHdFPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzg4MDA5ODI0CWZpbGU6b3BlbmFnZW50LWZyb250ZW5kLW1hbmlmZXN0Lmpzb24KYnJCK2Znam5qOXV6YlQ1MS9oS2xkYWNxbmFla3l1RCtvRzhubGJjRHlxUUZiUGRTakZBSzhnZ2hSeEFKVS9GdVZlbkVyY1lJaFN1Z2JJSy83M0o1RHc9PQo=";
    const TAURI_FRONTEND_ARCHIVE_BASE64: &str = "H4sIAEndkmoAA+3TQQuCMBQH8M59ivUF9K22dciCIBMvFmXQLTSXGqbiJui3z+oQeOkQFsV+h22wsb0H+8dpwCstkpek1xkAYIyh29xozwAYMMJ0SAiljIwpAoyHI9ZD0F1JT6WQXtGU8u497eZ+hDEIsqOsc45uf2BmPEY/C+qZiMOUB+hUZKnkabOIK1kW3NDvu4Z+P9r/dgPKWzwhuBS6l+faWXT0xqv8AyXt/LMxqPx/Qphkvpe4USy01dp05pbpuIetbTnm4rC09+5uY6IpkkXJJyrqiqIof+QKX/Na0QAMAAA=";

    fn serve_signed_frontend_fixture(archive: Vec<u8>) -> (String, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let manifest = STANDARD.decode(TAURI_FRONTEND_MANIFEST_BASE64).unwrap();
        let signature = TAURI_FRONTEND_SIGNATURE.as_bytes().to_vec();
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
                    "/openagent-frontend-manifest.json" => &manifest,
                    "/openagent-frontend-manifest.json.sig" => &signature,
                    "/openagent-frontend.tar.gz" => &archive,
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
    async fn installs_a_tauri_signed_frontend_over_http_and_rejects_tampering() {
        let archive = STANDARD.decode(TAURI_FRONTEND_ARCHIVE_BASE64).unwrap();
        let (origin, server) = serve_signed_frontend_fixture(archive.clone());
        let home = std::env::temp_dir().join(format!(
            "openagent-frontend-signed-http-{}",
            uuid::Uuid::new_v4()
        ));
        let manager = FrontendResourceManager::new(
            home.clone(),
            FrontendResourceSource {
                manifest_url: format!("{origin}/openagent-frontend-manifest.json"),
                signature_url: format!("{origin}/openagent-frontend-manifest.json.sig"),
                public_key: TAURI_TEST_PUBLIC_KEY.to_string(),
            },
            "1.0.0",
            1,
        )
        .unwrap();
        let installed = manager.install_latest().await.unwrap();
        assert_eq!(installed.version, "9.9.9-test.1");
        assert!(installed.root.join("index.html").is_file());
        manager.activate(&installed.version).await.unwrap();
        manager.confirm(&installed.version).await.unwrap();
        assert_eq!(manager.active_version().as_deref(), Some("9.9.9-test.1"));
        server.join().unwrap();
        std::fs::remove_dir_all(home).unwrap();

        let mut tampered = archive;
        tampered[0] ^= 1;
        let (origin, server) = serve_signed_frontend_fixture(tampered);
        let home = std::env::temp_dir().join(format!(
            "openagent-frontend-tampered-http-{}",
            uuid::Uuid::new_v4()
        ));
        let manager = FrontendResourceManager::new(
            home.clone(),
            FrontendResourceSource {
                manifest_url: format!("{origin}/openagent-frontend-manifest.json"),
                signature_url: format!("{origin}/openagent-frontend-manifest.json.sig"),
                public_key: TAURI_TEST_PUBLIC_KEY.to_string(),
            },
            "1.0.0",
            1,
        )
        .unwrap();
        assert!(manager.install_latest().await.is_err());
        server.join().unwrap();
        if home.exists() {
            std::fs::remove_dir_all(home).unwrap();
        }
    }

    #[test]
    fn validates_bounded_frontend_manifests() {
        let manifest = FrontendManifest {
            schema_version: 1,
            version: "0.51.0-beta.2".to_string(),
            protocol: FrontendProtocolRange { min: 1, max: 1 },
            artifact: FrontendArtifact {
                file: "openagent-frontend.tar.gz".to_string(),
                sha256: "a".repeat(64),
                size: 10,
                unpacked_size: 20,
                files: 2,
            },
        };
        assert!(validate_manifest(&manifest, 1).is_ok());
    }

    #[test]
    fn rejects_unsafe_frontend_versions() {
        assert!(safe_version("0.51.0-beta.2"));
        assert!(!safe_version("../current"));
        assert!(!safe_version("version/path"));
    }

    #[test]
    fn rejects_frontend_protocol_path_traversal() {
        assert_eq!(
            requested_asset("/"),
            Some(std::path::PathBuf::from("index.html"))
        );
        assert_eq!(
            requested_asset("/assets/app.js"),
            Some(std::path::PathBuf::from("assets/app.js"))
        );
        assert_eq!(requested_asset("/%2e%2e/config.toml"), None);
    }

    #[tokio::test]
    async fn rolls_back_an_unconfirmed_frontend_activation() {
        let home = std::env::temp_dir().join(format!(
            "openagent-frontend-rollback-{}",
            uuid::Uuid::new_v4()
        ));
        let resources = home.join("resources").join("frontend");
        for version in ["1.0.0", "1.1.0"] {
            let root = resources.join(version);
            std::fs::create_dir_all(&root).unwrap();
            std::fs::write(root.join("index.html"), version).unwrap();
        }
        let manager = FrontendResourceManager::new(
            home.clone(),
            FrontendResourceSource {
                manifest_url: "https://example.invalid/manifest.json".to_string(),
                signature_url: "https://example.invalid/manifest.json.sig".to_string(),
                public_key: String::new(),
            },
            "0.50.0",
            1,
        )
        .unwrap();
        manager.activate("1.0.0").await.unwrap();
        manager.confirm("1.0.0").await.unwrap();
        manager.activate("1.1.0").await.unwrap();

        assert!(manager.rollback_pending().await.unwrap());
        assert_eq!(manager.active_version().as_deref(), Some("1.0.0"));
        assert_eq!(
            manager.asset_root().read().unwrap().as_deref(),
            Some(resources.join("1.0.0").as_path())
        );
        std::fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn rejects_an_active_frontend_path_outside_the_resource_directory() {
        let home = std::env::temp_dir().join(format!(
            "openagent-frontend-active-path-{}",
            uuid::Uuid::new_v4()
        ));
        let resources = home.join("resources").join("frontend");
        let escaped = home.join("escaped");
        std::fs::create_dir_all(&resources).unwrap();
        std::fs::create_dir_all(&escaped).unwrap();
        std::fs::write(escaped.join("index.html"), b"outside").unwrap();
        std::fs::write(
            resources.join("active.json"),
            br#"{"version":"../../escaped","previous_version":null,"pending_confirmation":false}"#,
        )
        .unwrap();

        let manager = FrontendResourceManager::new(
            home.clone(),
            FrontendResourceSource {
                manifest_url: "https://example.invalid/manifest.json".to_string(),
                signature_url: "https://example.invalid/manifest.json.sig".to_string(),
                public_key: String::new(),
            },
            "0.50.0",
            1,
        )
        .unwrap();

        assert_eq!(manager.active_version(), None);
        assert!(manager.asset_root().read().unwrap().is_none());
        assert!(!resources.join("active.json").exists());
        std::fs::remove_dir_all(home).unwrap();
    }

    #[tokio::test]
    async fn serves_assets_and_spa_fallback_from_the_selected_root() {
        let root = std::env::temp_dir().join(format!(
            "openagent-frontend-protocol-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(root.join("assets")).unwrap();
        std::fs::write(root.join("index.html"), b"app").unwrap();
        std::fs::write(root.join("assets/app.js"), b"script").unwrap();
        let selected = std::sync::Arc::new(std::sync::RwLock::new(Some(root.clone())));

        let asset = serve(
            Request::builder()
                .uri("http://openagent-ui.localhost/assets/app.js")
                .body(Vec::new())
                .unwrap(),
            selected.clone(),
        )
        .await;
        assert_eq!(asset.status(), StatusCode::OK);
        assert_eq!(asset.body(), b"script");

        let route = serve(
            Request::builder()
                .uri("http://openagent-ui.localhost/conversations/123")
                .body(Vec::new())
                .unwrap(),
            selected,
        )
        .await;
        assert_eq!(route.status(), StatusCode::OK);
        assert_eq!(route.body(), b"app");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn extracts_the_release_tar_layout_with_declared_limits() {
        use flate2::write::GzEncoder;
        use flate2::Compression;

        let source = std::env::temp_dir().join(format!(
            "openagent-frontend-archive-source-{}",
            uuid::Uuid::new_v4()
        ));
        let destination = std::env::temp_dir().join(format!(
            "openagent-frontend-archive-destination-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(source.join("assets")).unwrap();
        std::fs::write(source.join("index.html"), b"app").unwrap();
        std::fs::write(source.join("assets/app.js"), b"script").unwrap();
        let encoder = GzEncoder::new(Vec::new(), Compression::default());
        let mut builder = tar::Builder::new(encoder);
        builder.append_dir_all(".", &source).unwrap();
        let encoder = builder.into_inner().unwrap();
        let archive = encoder.finish().unwrap();
        let artifact = FrontendArtifact {
            file: "openagent-frontend.tar.gz".to_string(),
            sha256: "a".repeat(64),
            size: archive.len() as u64,
            unpacked_size: 9,
            files: 2,
        };

        extract_archive(&archive, &destination, &artifact).unwrap();
        assert_eq!(
            std::fs::read(destination.join("index.html")).unwrap(),
            b"app"
        );
        assert_eq!(
            std::fs::read(destination.join("assets/app.js")).unwrap(),
            b"script"
        );
        std::fs::remove_dir_all(source).unwrap();
        std::fs::remove_dir_all(destination).unwrap();
    }
}
