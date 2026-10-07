//! The shell can provision and recover signed resources without a running Runtime.
use crate::component_updates::sources::update_public_key;
use crate::frontend_resource::FrontendResourceManager;
use crate::runtime_process::RuntimeProcessSupervisor;
use crate::runtime_resource::{
    current_runtime_resource_target, RuntimeResourceArtifact, RuntimeResourceManager,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex;

#[derive(Clone, Debug, Serialize)]
pub(crate) struct ProvisioningStatus {
    pub(crate) phase: String,
    pub(crate) error: Option<String>,
    pub(crate) downloaded_bytes: u64,
    pub(crate) total_bytes: u64,
}

pub(crate) struct ProvisioningState {
    operation: Mutex<()>,
    status: std::sync::Mutex<ProvisioningStatus>,
    pub(crate) embedding_seed: std::sync::Mutex<Option<PathBuf>>,
}

impl Default for ProvisioningState {
    fn default() -> Self {
        Self {
            operation: Mutex::new(()),
            status: std::sync::Mutex::new(ProvisioningStatus {
                phase: "waiting".into(),
                error: None,
                downloaded_bytes: 0,
                total_bytes: 0,
            }),
            embedding_seed: std::sync::Mutex::new(None),
        }
    }
}

#[derive(Deserialize)]
pub(crate) struct Distribution {
    schema_version: u32,
    version: String,
    manifests: BTreeMap<String, RuntimeResourceArtifact>,
    runtime: BTreeMap<String, RuntimeResourceArtifact>,
    frontend: RuntimeResourceArtifact,
    embedding: BTreeMap<String, RuntimeResourceArtifact>,
    helpers: BTreeMap<String, BTreeMap<String, RuntimeResourceArtifact>>,
}

fn parse_distribution(
    bytes: &[u8],
    signature: &[u8],
    expected_version: &str,
) -> Result<Distribution, String> {
    let key = minisign_verify::PublicKey::decode(&update_public_key())
        .map_err(|error| error.to_string())?;
    let text = std::str::from_utf8(signature)
        .map_err(|error| error.to_string())?
        .trim();
    let text = if text.starts_with("untrusted comment:") {
        text.to_string()
    } else {
        String::from_utf8(STANDARD.decode(text).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?
    };
    key.verify(
        bytes,
        &minisign_verify::Signature::decode(&text).map_err(|error| error.to_string())?,
        false,
    )
    .map_err(|error| format!("Distribution signature verification failed: {error}"))?;
    let manifest: Distribution =
        serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
    if manifest.schema_version != 1 || manifest.version != expected_version {
        return Err("Distribution does not match this shell release".into());
    }
    if manifest
        .manifests
        .keys()
        .map(String::as_str)
        .collect::<Vec<_>>()
        != [
            "openagent-frontend-manifest.json",
            "openagent-frontend-manifest.json.sig",
            "openagent-sdk-manifest.json",
            "openagent-sdk-manifest.json.sig",
        ]
    {
        return Err("Distribution has an incomplete component manifest set".into());
    }
    for (name, artifact) in &manifest.manifests {
        if artifact.file != *name {
            return Err("Distribution manifest filename mismatch".into());
        }
    }
    if manifest
        .embedding
        .keys()
        .map(String::as_str)
        .collect::<Vec<_>>()
        != [
            "LICENSE",
            "config.json",
            "model_quantized.onnx",
            "special_tokens_map.json",
            "tokenizer.json",
            "tokenizer_config.json",
        ]
    {
        return Err("Distribution has an incomplete embedding seed".into());
    }
    Ok(manifest)
}

fn platform_artifacts(distribution: &Distribution) -> Result<Vec<RuntimeResourceArtifact>, String> {
    let target = current_runtime_resource_target()?;
    let mut artifacts: Vec<_> = distribution.manifests.values().cloned().collect();
    artifacts.push(
        distribution
            .runtime
            .get(target)
            .ok_or("Distribution has no Runtime for this platform")?
            .clone(),
    );
    artifacts.push(distribution.frontend.clone());
    artifacts.extend(distribution.embedding.values().cloned());
    let names: &[&str] = match target {
        "windows-x64" => &[
            "codex-windows-sandbox-setup.exe",
            "codex-command-runner.exe",
        ],
        "linux-x64" => &["codex-bwrap-linux-x64"],
        _ => &[],
    };
    for name in names {
        let helper = distribution
            .helpers
            .get(target)
            .and_then(|helpers| helpers.get(*name))
            .ok_or("Distribution is missing a sandbox helper")?;
        if helper.file != *name {
            return Err("Distribution helper filename mismatch".into());
        }
        artifacts.push(helper.clone());
    }
    let mut filenames = std::collections::BTreeSet::new();
    for artifact in &artifacts {
        if artifact.file.is_empty()
            || artifact.file == "."
            || artifact.file == ".."
            || !artifact
                .file
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
            || !filenames.insert(&artifact.file)
            || artifact.size == 0
            || artifact.size > 512 * 1024 * 1024
            || artifact.sha256.len() != 64
            || !artifact
                .sha256
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        {
            return Err("Invalid or duplicate distribution artifact".into());
        }
    }
    Ok(artifacts)
}

fn update(app: &tauri::AppHandle, phase: &str, error: Option<String>) {
    let state = app.state::<ProvisioningState>();
    if let Ok(mut status) = state.status.lock() {
        status.phase = phase.to_string();
        status.error = error;
        let _ = app.emit("shell-resource-progress", &*status);
    };
}

pub(crate) fn frontend_failed(app: &tauri::AppHandle) {
    update(
        app,
        "failed",
        Some("Frontend startup was not confirmed; retry or import verified resources".into()),
    );
}

#[tauri::command]
pub(crate) fn shell_resource_status(
    state: State<'_, ProvisioningState>,
) -> Result<ProvisioningStatus, String> {
    state
        .status
        .lock()
        .map(|status| status.clone())
        .map_err(|error| error.to_string())
}

fn source(app: &tauri::AppHandle, offline_directory: Option<PathBuf>) -> Result<String, String> {
    #[cfg(debug_assertions)]
    if offline_directory.is_none()
        && std::env::var("OPENAGENT_BOOTSTRAP_TEST").is_ok_and(|value| value == "1")
    {
        if let Ok(url) = std::env::var("OPENAGENT_BOOTSTRAP_TEST_URL") {
            let parsed = reqwest::Url::parse(&url).map_err(|error| error.to_string())?;
            if parsed
                .host_str()
                .is_some_and(|host| host == "127.0.0.1" || host == "localhost")
            {
                return Ok(url);
            }
            return Err("Bootstrap test endpoint must use loopback".into());
        }
    }
    let bundled = app
        .path()
        .resolve(
            "bootstrap-release/openagent-distribution.json",
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|error| error.to_string())?;
    let local = offline_directory
        .map(|directory| directory.join("openagent-distribution.json"))
        .or_else(|| bundled.is_file().then_some(bundled));
    if let Some(path) = local {
        return reqwest::Url::from_file_path(path)
            .map(|url| url.to_string())
            .map_err(|()| "Invalid offline resource directory".into());
    }
    Ok(format!(
        "https://github.com/BANG404/openagent/releases/download/v{}/openagent-distribution.json",
        env!("CARGO_PKG_VERSION")
    ))
}

async fn stage_distribution(
    app: &tauri::AppHandle,
    home: &Path,
    source: &str,
    expected_version: &str,
) -> Result<PathBuf, String> {
    let client = reqwest::Client::new();
    let signature_url = format!("{source}.sig");
    let directory = home
        .join("resources")
        .join("distributions")
        .join(expected_version);
    let cached_manifest = directory.join("openagent-distribution.json");
    let cached_signature = directory.join("openagent-distribution.json.sig");
    let cached_url = reqwest::Url::from_file_path(&cached_manifest)
        .map_err(|()| "Invalid cached distribution path")?;
    let cached_signature_url = reqwest::Url::from_file_path(&cached_signature)
        .map_err(|()| "Invalid cached signature path")?;
    let cached = tokio::try_join!(
        crate::resource_download::bounded(&client, cached_url.as_str(), 1024 * 1024),
        crate::resource_download::bounded(&client, cached_signature_url.as_str(), 16 * 1024)
    );
    let (bytes, signature) = if let Ok((bytes, signature)) = cached {
        if parse_distribution(&bytes, &signature, expected_version).is_ok() {
            (bytes, signature)
        } else {
            tokio::try_join!(
                crate::resource_download::bounded(&client, source, 1024 * 1024),
                crate::resource_download::bounded(&client, &signature_url, 16 * 1024)
            )?
        }
    } else {
        tokio::try_join!(
            crate::resource_download::bounded(&client, source, 1024 * 1024),
            crate::resource_download::bounded(&client, &signature_url, 16 * 1024)
        )?
    };
    let distribution = parse_distribution(&bytes, &signature, expected_version)?;
    let artifacts = platform_artifacts(&distribution)?;
    tokio::fs::create_dir_all(&directory)
        .await
        .map_err(|error| error.to_string())?;
    let state = app.state::<ProvisioningState>();
    if let Ok(mut status) = state.status.lock() {
        status.downloaded_bytes = 0;
        status.total_bytes = artifacts.iter().map(|artifact| artifact.size).sum();
    }
    transfer_artifacts(app, &client, &directory, source, artifacts).await?;
    // Persist only after the complete signed resource set is staged. Interrupted
    // downloads remain in the content-addressed cache and resume on retry.
    tokio::fs::write(cached_manifest, bytes)
        .await
        .map_err(|error| error.to_string())?;
    tokio::fs::write(cached_signature, signature)
        .await
        .map_err(|error| error.to_string())?;
    let seed = directory.join("models");
    tokio::fs::create_dir_all(&seed)
        .await
        .map_err(|error| error.to_string())?;
    for (name, artifact) in &distribution.embedding {
        tokio::fs::copy(directory.join(&artifact.file), seed.join(name))
            .await
            .map_err(|error| error.to_string())?;
    }
    if expected_version == env!("CARGO_PKG_VERSION") {
        *state
            .embedding_seed
            .lock()
            .map_err(|error| error.to_string())? = Some(seed);
    }
    Ok(directory)
}

async fn transfer_artifacts(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    directory: &Path,
    source: &str,
    artifacts: Vec<RuntimeResourceArtifact>,
) -> Result<(), String> {
    let totals = Arc::new(std::sync::Mutex::new(vec![0_u64; artifacts.len()]));
    let transfer_locks: BTreeMap<_, _> = artifacts
        .iter()
        .map(|artifact| (artifact.sha256.clone(), Arc::new(Mutex::new(()))))
        .collect();
    let mut transfers = tokio::task::JoinSet::new();
    for (index, artifact) in artifacts.into_iter().enumerate() {
        if artifact.file.is_empty()
            || !artifact
                .file
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
            || artifact.file == "."
            || artifact.file == ".."
        {
            return Err("Unsafe distribution artifact filename".into());
        }
        let app = app.clone();
        let client = client.clone();
        let directory = directory.to_path_buf();
        let totals = totals.clone();
        let transfer_lock = transfer_locks
            .get(&artifact.sha256)
            .expect("each artifact has a cache lock")
            .clone();
        let url = reqwest::Url::parse(source)
            .map_err(|error| error.to_string())?
            .join(&artifact.file)
            .map_err(|error| error.to_string())?;
        transfers.spawn(async move {
            let _transfer = transfer_lock.lock().await;
            let cached = crate::resource_download::artifact(
                &client,
                url,
                &directory.join("downloads"),
                artifact.size,
                &artifact.sha256,
                |downloaded, _| {
                    if let Ok(mut totals) = totals.lock() {
                        totals[index] = downloaded;
                        let state = app.state::<ProvisioningState>();
                        if let Ok(mut status) = state.status.lock() {
                            status.downloaded_bytes = totals.iter().sum();
                            let _ = app.emit("shell-resource-progress", &*status);
                        };
                    }
                },
            )
            .await?;
            let destination = directory.join(&artifact.file);
            tokio::fs::copy(cached, destination)
                .await
                .map_err(|error| error.to_string())?;
            Ok::<(), String>(())
        });
    }
    while let Some(result) = transfers.join_next().await {
        result.map_err(|error| error.to_string())??;
    }
    Ok(())
}

pub(crate) async fn provision(
    app: tauri::AppHandle,
    offline_directory: Option<PathBuf>,
) -> Result<(), String> {
    let state = app.state::<ProvisioningState>();
    let _operation = state.operation.lock().await;
    if state
        .status
        .lock()
        .map_err(|error| error.to_string())?
        .phase
        == "ready"
    {
        return Ok(());
    }
    update(&app, "downloading", None);
    let result = provision_inner(&app, offline_directory).await;
    if let Err(error) = &result {
        update(&app, "failed", Some(error.clone()));
    }
    result
}

async fn provision_inner(
    app: &tauri::AppHandle,
    offline_directory: Option<PathBuf>,
) -> Result<(), String> {
    let home = &app.state::<crate::DesktopDataDir>().0;
    let directory = stage_distribution(
        app,
        home,
        &source(app, offline_directory)?,
        env!("CARGO_PKG_VERSION"),
    )
    .await?;
    update(app, "installing", None);
    let local_url = |name| {
        reqwest::Url::from_file_path(directory.join(name))
            .map(|url| url.to_string())
            .map_err(|()| "Invalid staged resource URL".to_string())
    };
    let runtime_manager = app.state::<RuntimeResourceManager>();
    let runtime = runtime_manager
        .with_manifest_url(local_url("openagent-sdk-manifest.json")?)
        .install_latest(|_| {})
        .await?;
    let frontend_manager = app.state::<FrontendResourceManager>();
    let frontend = frontend_manager
        .with_manifest_url(local_url("openagent-frontend-manifest.json")?)
        .install_latest()
        .await?;
    // Selection remains reversible; Runtime retains ownership of data inspection
    // and the interactive backup/transition consent boundary.
    let selected_runtime = match runtime_manager.active_resource().await? {
        Some(active)
            if semver::Version::parse(&active.version).ok()
                > semver::Version::parse(&runtime.version).ok() =>
        {
            active
        }
        _ => runtime,
    };
    update(app, "starting", None);
    let supervisor = app.state::<Arc<RuntimeProcessSupervisor>>();
    supervisor.stop().await?;
    let inspection_binary = selected_runtime.binary_path.clone();
    let launch = tokio::task::spawn_blocking(move || {
        super::persistence::prepare_interactive_persistence_with_binary(&inspection_binary)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?
    .ok_or("Application data upgrade was cancelled")?;
    runtime_manager.activate(&selected_runtime).await?;
    super::start_external_desktop_runtime(
        app,
        app.state::<Arc<RuntimeProcessSupervisor>>().inner().clone(),
        runtime_manager.inner(),
        launch,
        super::instances::should_start_primary_desktop_services(
            false,
            crate::workspace_process::is_workspace_window_process(),
            super::instances::is_development_multi_instance(),
        ),
    )
    .await?;
    if frontend_manager.is_newer_than_active(&frontend.version)? {
        frontend_manager.activate(&frontend.version).await?;
    }
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let windows_app = app.clone();
    let windows_frontend = frontend_manager.inner().clone();
    app.run_on_main_thread(move || {
        let result = crate::desktop_windows::startup::initialize(
            &windows_app,
            &windows_frontend,
            false,
            crate::workspace_process::is_workspace_window_process(),
            super::instances::is_development_multi_instance(),
        )
        .map_err(|error| error.to_string());
        let _ = sender.send(result);
    })
    .map_err(|error| error.to_string())?;
    receiver.await.map_err(|error| error.to_string())??;
    let window = app
        .get_webview_window("main")
        .ok_or("Main window is unavailable")?;
    let active_frontend_version = frontend_manager.current_version();
    let url = crate::component_updates::external_frontend_url("", &active_frontend_version)?;
    window.navigate(url).map_err(|error| error.to_string())?;
    update(app, "ready", None);
    crate::component_updates::arm_frontend_confirmation_deadline(
        app.clone(),
        frontend_manager.inner().clone(),
        active_frontend_version,
        "bootstrap_confirmation_timed_out",
    );
    Ok(())
}

#[derive(Clone, serde::Serialize)]
pub(crate) struct PreparedReleaseResources {
    version: String,
}

#[tauri::command]
pub(crate) async fn prepare_release_resources(
    app: tauri::AppHandle,
    version: String,
) -> Result<PreparedReleaseResources, String> {
    let candidate = semver::Version::parse(&version).map_err(|error| error.to_string())?;
    let current =
        semver::Version::parse(env!("CARGO_PKG_VERSION")).map_err(|error| error.to_string())?;
    if candidate <= current {
        return Err("Release resource preparation requires a newer shell".into());
    }
    let state = app.state::<ProvisioningState>();
    let _operation = state.operation.lock().await;
    let home = &app.state::<crate::DesktopDataDir>().0;
    let source = format!("https://github.com/BANG404/openagent/releases/download/v{version}/openagent-distribution.json");
    stage_distribution(&app, home, &source, &version).await?;
    Ok(PreparedReleaseResources { version })
}

pub(crate) fn verify_prepared_release(home: &Path, version: &str) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let directory = home.join("resources").join("distributions").join(version);
    let read = |name: &str, maximum: u64| -> Result<Vec<u8>, String> {
        let file = std::fs::File::open(directory.join(name)).map_err(|error| error.to_string())?;
        let mut bytes = Vec::new();
        file.take(maximum + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| error.to_string())?;
        if bytes.len() as u64 > maximum {
            return Err("Cached distribution exceeds its size limit".into());
        }
        Ok(bytes)
    };
    let distribution = parse_distribution(
        &read("openagent-distribution.json", 1024 * 1024)?,
        &read("openagent-distribution.json.sig", 16 * 1024)?,
        version,
    )?;
    for artifact in platform_artifacts(&distribution)? {
        let mut file = std::fs::File::open(directory.join(&artifact.file))
            .map_err(|error| error.to_string())?;
        if file.metadata().map_err(|error| error.to_string())?.len() != artifact.size {
            return Err("Prepared release artifact length changed".into());
        }
        let mut hash = Sha256::new();
        let mut buffer = [0; 64 * 1024];
        loop {
            let count = file.read(&mut buffer).map_err(|error| error.to_string())?;
            if count == 0 {
                break;
            }
            hash.update(&buffer[..count]);
        }
        if format!("{:x}", hash.finalize()) != artifact.sha256 {
            return Err("Prepared release artifact checksum changed".into());
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn retry_shell_resources(
    app: tauri::AppHandle,
    offline_directory: Option<PathBuf>,
) -> Result<(), String> {
    provision(app, offline_directory).await
}
