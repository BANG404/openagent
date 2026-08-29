#[cfg(debug_assertions)]
use openagent_app::bootstrap_development_runtime as bootstrap_product_runtime;
#[cfg(not(debug_assertions))]
use openagent_app::bootstrap_runtime as bootstrap_product_runtime;
#[cfg(debug_assertions)]
use openagent_app::pending_development_persistence_transition as pending_product_persistence_transition;
#[cfg(not(debug_assertions))]
use openagent_app::pending_persistence_transition as pending_product_persistence_transition;
use openagent_app::{
    apply_persistence_transition, EmbeddingResourceManager, EmbeddingResourceStatus,
    ExternalRuntimeLaunch, InstalledRuntimeResource, PersistenceTransitionPlan,
    RuntimeResourceManager, RuntimeResourceSource,
};
use openagent_runtime::checkpoint::{
    BranchMeta, CheckpointMeta, ConvPatch, ConversationMeta, FileChange, RenderableCheckpoint,
    TaskTrace,
};
use openagent_runtime::commands::*;
use openagent_runtime::config::{
    Config, DefaultModelBinding, McpServerConfig, ReasoningEffort, RecentWorkspace,
};
use openagent_runtime::conversation_memory::{
    AgentMemoryEntry, AgentRole, ConversationPage, ConversationPageCursor,
};
use openagent_runtime::skills::SkillMetadata;
use openagent_runtime::state::{
    HtmlPreviewRoots, OpenAgentRuntime, RuntimeAsset, RuntimeHost, ScheduledChatHookDefinition,
};
use openagent_runtime::tools::ScheduleChatHookArgs;
use openagent_runtime::{
    html_preview_protocol, mcp, tools, tracing_setup, AgentInputRequest, ChatModelBinding,
    CommandSpec, CreateConversationRequest, InputError, ResolvedInput, ResumeInterruptRequest,
    RuntimeBootstrap, SubmissionOutcome, SubmitInterruptResponseRequest, UserMessageContext,
};
use std::sync::Arc;
use tauri::{path::BaseDirectory, Emitter, Manager, State};

pub mod frontend_resource;
pub mod runtime_asset_protocol;
pub mod runtime_process;
pub mod runtime_transport;

use frontend_resource::{
    FrontendResourceManager, FrontendResourceSource, InstalledFrontendResource,
};
use runtime_process::{RuntimeLaunchSpec, RuntimeProcessSupervisor};
use runtime_transport::{RuntimeEventProxy, RuntimeProxyRequest, RuntimeProxyResponse};

#[derive(serde::Serialize)]
struct PreparedFrontendResource {
    version: String,
    update_available: bool,
}

#[derive(serde::Serialize)]
struct PreparedRuntimeResource {
    version: String,
    target: String,
    update_available: bool,
}

#[derive(serde::Serialize)]
struct ActivatedRuntimeResource {
    version: String,
    target: String,
    event_generation: u64,
}

#[derive(Default)]
struct RuntimeUpdateState {
    pending: tokio::sync::Mutex<Option<InstalledRuntimeResource>>,
    lifecycle: tokio::sync::Mutex<()>,
}

#[derive(Default)]
struct DesktopWindowState {
    startup_window_revealed: std::sync::atomic::AtomicBool,
}

struct HostRuntimeBootstrap {
    initial_locale: String,
    runtime: Option<Arc<OpenAgentRuntime>>,
    html_preview_roots: HtmlPreviewRoots,
    external_launch: Option<ExternalRuntimeLaunch>,
}

fn prepare_host_runtime(agent_server: bool) -> anyhow::Result<HostRuntimeBootstrap> {
    #[cfg(debug_assertions)]
    {
        let RuntimeBootstrap {
            initial_locale,
            runtime,
            html_preview_roots,
        } = bootstrap_product_runtime(agent_server)?;
        Ok(HostRuntimeBootstrap {
            initial_locale,
            runtime: Some(runtime),
            html_preview_roots,
            external_launch: None,
        })
    }

    #[cfg(not(debug_assertions))]
    {
        if agent_server {
            let RuntimeBootstrap {
                initial_locale,
                runtime,
                html_preview_roots,
            } = bootstrap_product_runtime(true)?;
            return Ok(HostRuntimeBootstrap {
                initial_locale,
                runtime: Some(runtime),
                html_preview_roots,
                external_launch: None,
            });
        }
        let launch = openagent_app::prepare_external_runtime_launch()?;
        Ok(HostRuntimeBootstrap {
            initial_locale: launch.initial_locale.clone(),
            runtime: None,
            html_preview_roots: Default::default(),
            external_launch: Some(launch),
        })
    }
}

const EMBEDDING_MODEL_RESOURCE_PATH: &str = "models/all-MiniLM-L6-v2-q";
const UPDATE_PUBLIC_KEY: &str = "untrusted comment: minisign public key: C373284FCF9656A0\nRWSgVpbPTyhzw46ILL4vBbjg4XueHFxKhTk48DCGqAT/IfE5vSyBDSGl\n";

fn modular_update_channel() -> &'static str {
    let version = env!("CARGO_PKG_VERSION");
    if version.contains("-rc.") {
        "rc"
    } else if version.contains('-') {
        "beta"
    } else {
        "stable"
    }
}

fn runtime_resource_manager() -> RuntimeResourceManager {
    let manifest_url = format!(
        "https://github.com/BANG404/openagent/releases/download/runtime-{}/openagent-sdk-manifest.json",
        modular_update_channel()
    );
    RuntimeResourceManager::new(
        openagent_runtime::config::config_dir(),
        RuntimeResourceSource {
            signature_url: format!("{manifest_url}.sig"),
            manifest_url,
            public_key: UPDATE_PUBLIC_KEY.to_string(),
        },
        openagent_protocol::SDK_PROTOCOL_VERSION,
    )
}

fn runtime_update_available(candidate: &str, baseline: &str) -> Result<bool, String> {
    let candidate = semver::Version::parse(candidate)
        .map_err(|error| format!("Runtime candidate version is invalid: {error}"))?;
    let baseline = semver::Version::parse(baseline)
        .map_err(|error| format!("Runtime baseline version is invalid: {error}"))?;
    Ok(candidate > baseline)
}

fn frontend_resource_manager() -> Result<FrontendResourceManager, String> {
    let manifest_url = format!(
        "https://github.com/BANG404/openagent/releases/download/frontend-{}/openagent-frontend-manifest.json",
        modular_update_channel()
    );
    FrontendResourceManager::new(
        openagent_runtime::config::config_dir(),
        FrontendResourceSource {
            signature_url: format!("{manifest_url}.sig"),
            manifest_url,
            public_key: UPDATE_PUBLIC_KEY.to_string(),
        },
        env!("CARGO_PKG_VERSION"),
        frontend_resource::FRONTEND_HOST_PROTOCOL_VERSION,
    )
}

fn external_frontend_url(query: &str, version: &str) -> Result<tauri::Url, String> {
    let separator = if query.is_empty() { '?' } else { '&' };
    tauri::Url::parse(&format!(
        "openagent-ui://localhost/{query}{separator}frontend-version={version}"
    ))
    .map_err(|error| format!("failed to build external frontend URL: {error}"))
}

fn embedded_frontend_url(query: &str) -> Result<tauri::Url, String> {
    #[cfg(target_os = "windows")]
    let origin = "http://tauri.localhost/";
    #[cfg(not(target_os = "windows"))]
    let origin = "tauri://localhost/";
    tauri::Url::parse(&format!("{origin}{query}"))
        .map_err(|error| format!("failed to build embedded frontend URL: {error}"))
}

fn frontend_window_query(label: &str) -> &'static str {
    match label {
        "onboarding" => "?onboarding-window=1",
        "quick-chat" => "?quick-chat-window=1",
        "debug" => "?dev-inspector=1",
        _ => "",
    }
}

fn navigate_frontend_windows(app: &tauri::AppHandle, version: Option<&str>) -> Result<(), String> {
    for (label, window) in app.webview_windows() {
        let query = frontend_window_query(&label);
        let url = match version {
            Some(version) => external_frontend_url(query, version)?,
            None => embedded_frontend_url(query)?,
        };
        window
            .navigate(url)
            .map_err(|error| format!("failed to reload frontend window {label}: {error}"))?;
    }
    Ok(())
}

fn product_webview_url(
    manager: &FrontendResourceManager,
    query: &str,
) -> Result<tauri::WebviewUrl, String> {
    if !cfg!(debug_assertions) {
        if let Some(version) = manager.active_version() {
            return external_frontend_url(query, &version).map(tauri::WebviewUrl::CustomProtocol);
        }
    }
    Ok(tauri::WebviewUrl::App(format!("/{query}").into()))
}

fn bundled_embedding_seed(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    #[cfg(debug_assertions)]
    {
        let source = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(EMBEDDING_MODEL_RESOURCE_PATH);
        if source.is_dir() {
            return Some(source);
        }
    }

    app.path()
        .resolve(EMBEDDING_MODEL_RESOURCE_PATH, BaseDirectory::Resource)
        .ok()
        .filter(|path| path.is_dir())
}

#[cfg(debug_assertions)]
async fn load_embedding_model(
    runtime: Arc<OpenAgentRuntime>,
    model_dir: std::path::PathBuf,
) -> Result<(), String> {
    let model = tokio::task::spawn_blocking(move || {
        openagent_runtime::embedding::load_bundled_model(model_dir).map(Arc::new)
    })
    .await
    .map_err(|error| format!("embedding task failed: {error}"))??;
    *runtime.state().embedding_model.lock().await = Some(model);
    tracing::info!(target: "openagent::app", "embedding model ready");
    Ok(())
}

#[tauri::command]
#[cfg(debug_assertions)]
async fn get_embedding_resource_status(
    manager: State<'_, EmbeddingResourceManager>,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<EmbeddingResourceStatus, String> {
    let resource = manager.status().await;
    if resource.ready() && runtime.state().embedding_model.lock().await.is_none() {
        load_embedding_model(runtime.inner().clone(), manager.model_dir().to_path_buf()).await?;
    }
    Ok(resource)
}

#[tauri::command]
#[cfg(not(debug_assertions))]
async fn get_embedding_resource_status(
    manager: State<'_, EmbeddingResourceManager>,
) -> Result<EmbeddingResourceStatus, String> {
    Ok(manager.status().await)
}

#[tauri::command]
#[cfg(debug_assertions)]
async fn prepare_embedding_resource(
    app: tauri::AppHandle,
    manager: State<'_, EmbeddingResourceManager>,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<EmbeddingResourceStatus, String> {
    let progress_app = app.clone();
    let installed = manager
        .prepare(bundled_embedding_seed(&app), move |progress| {
            if let Err(error) = progress_app.emit("embedding-resource-progress", progress) {
                tracing::warn!(%error, "failed to emit embedding resource progress");
            }
        })
        .await?;
    load_embedding_model(runtime.inner().clone(), manager.model_dir().to_path_buf()).await?;
    Ok(installed)
}

#[tauri::command]
#[cfg(not(debug_assertions))]
async fn prepare_embedding_resource(
    app: tauri::AppHandle,
    manager: State<'_, EmbeddingResourceManager>,
    updates: State<'_, RuntimeUpdateState>,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
    proxy: State<'_, RuntimeEventProxy>,
) -> Result<EmbeddingResourceStatus, String> {
    let _lifecycle = updates.lifecycle.lock().await;
    let progress_app = app.clone();
    let installed = manager
        .prepare(bundled_embedding_seed(&app), move |progress| {
            if let Err(error) = progress_app.emit("embedding-resource-progress", progress) {
                tracing::warn!(%error, "failed to emit embedding resource progress");
            }
        })
        .await?;
    let Some(spec) = supervisor.launch_spec().await else {
        return Ok(installed);
    };
    let drain = drain_supervised_runtime(supervisor.inner()).await?;
    if !drain.drained {
        return Err(format!(
            "Runtime did not drain {} active conversation(s) before loading the embedding resource",
            drain.active_conversations.len()
        ));
    }
    proxy.stop().await;
    if let Err(error) = supervisor.reload_after_drain(spec.clone()).await {
        let reconnect =
            reconnect_supervised_runtime(&app, supervisor.inner().clone(), &proxy).await;
        return Err(match reconnect {
            Ok(_) => error,
            Err(reconnect_error) => {
                format!("{error}; Runtime reconnect failed: {reconnect_error}")
            }
        });
    }
    if let Err(error) = reconnect_supervised_runtime(&app, supervisor.inner().clone(), &proxy).await
    {
        let rollback =
            restore_previous_runtime(&app, supervisor.inner().clone(), &proxy, spec).await;
        return Err(match rollback {
            Ok(_) => format!("Runtime embedding reload failed and was restarted: {error}"),
            Err(rollback_error) => format!(
                "Runtime embedding reload failed ({error}); recovery also failed ({rollback_error})"
            ),
        });
    }
    Ok(installed)
}

#[tauri::command]
async fn prepare_runtime_resource(
    app: tauri::AppHandle,
    manager: State<'_, RuntimeResourceManager>,
    updates: State<'_, RuntimeUpdateState>,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
) -> Result<PreparedRuntimeResource, String> {
    let progress_app = app.clone();
    let candidate = manager
        .install_latest(move |progress| {
            if let Err(error) = progress_app.emit("runtime-resource-progress", progress) {
                tracing::warn!(%error, "failed to emit Runtime resource progress");
            }
        })
        .await?;
    let active = manager.active_resource().await?;
    let running = supervisor.status().await;
    let baseline = active
        .as_ref()
        .map(|value| value.version.as_str())
        .or_else(|| running.as_ref().map(|value| value.version.as_str()));
    let update_available = baseline
        .map(|baseline| runtime_update_available(&candidate.version, baseline))
        .transpose()?
        .unwrap_or(false);
    *updates.pending.lock().await = update_available.then(|| candidate.clone());
    Ok(PreparedRuntimeResource {
        version: candidate.version,
        target: candidate.target,
        update_available,
    })
}

#[tauri::command]
async fn proxy_runtime_request(
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
    request: RuntimeProxyRequest,
) -> Result<RuntimeProxyResponse, String> {
    runtime_transport::proxy_webview_runtime_request(supervisor.inner(), request).await
}

#[tauri::command]
async fn runtime_transport_mode(
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
) -> Result<String, String> {
    Ok(if supervisor.status().await.is_some() {
        "external".to_string()
    } else {
        "embedded".to_string()
    })
}

#[tauri::command]
async fn start_runtime_event_proxy(
    app: tauri::AppHandle,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
    proxy: State<'_, RuntimeEventProxy>,
) -> Result<u64, String> {
    proxy.start(app, supervisor.inner().clone()).await
}

#[tauri::command]
async fn stop_runtime_event_proxy(proxy: State<'_, RuntimeEventProxy>) -> Result<(), String> {
    proxy.stop().await;
    Ok(())
}

#[derive(serde::Deserialize)]
struct RuntimeDrainResponse {
    drained: bool,
    active_conversations: Vec<String>,
}

fn validate_runtime_bootstrap(value: &serde_json::Value) -> Result<(), String> {
    let Some(object) = value.as_object() else {
        return Err("Runtime bootstrap was not a JSON object".to_string());
    };
    for field in [
        "config",
        "workspace_path",
        "workspace",
        "launch_context",
        "conversations",
        "active_conv_id",
    ] {
        if !object.contains_key(field) {
            return Err(format!("Runtime bootstrap omitted required field {field}"));
        }
    }
    if !object["config"].is_object()
        || !object["workspace_path"].is_string()
        || !object["workspace"].is_object()
        || !object["launch_context"].is_object()
        || !object["conversations"].is_array()
    {
        return Err("Runtime bootstrap field types were invalid".to_string());
    }
    Ok(())
}

async fn drain_supervised_runtime(
    supervisor: &RuntimeProcessSupervisor,
) -> Result<RuntimeDrainResponse, String> {
    let response = runtime_transport::proxy_runtime_request(
        supervisor,
        RuntimeProxyRequest {
            method: "POST".to_string(),
            path: "/api/desktop/drain".to_string(),
            body: Some("{\"cancel\":true}".to_string()),
        },
    )
    .await?;
    if response.status != 200 {
        return Err(format!(
            "Runtime drain was rejected with status {}",
            response.status
        ));
    }
    serde_json::from_str(&response.body)
        .map_err(|error| format!("Runtime drain response was invalid: {error}"))
}

async fn validate_supervised_runtime_bootstrap(
    supervisor: &RuntimeProcessSupervisor,
) -> Result<(), String> {
    let response = runtime_transport::proxy_runtime_request(
        supervisor,
        RuntimeProxyRequest {
            method: "GET".to_string(),
            path: "/api/desktop/bootstrap".to_string(),
            body: None,
        },
    )
    .await?;
    if response.status != 200 {
        return Err(format!(
            "Runtime bootstrap was rejected with status {}",
            response.status
        ));
    }
    let bootstrap: serde_json::Value = serde_json::from_str(&response.body)
        .map_err(|error| format!("Runtime bootstrap response was invalid: {error}"))?;
    validate_runtime_bootstrap(&bootstrap)
}

async fn reconnect_supervised_runtime(
    app: &tauri::AppHandle,
    supervisor: Arc<RuntimeProcessSupervisor>,
    proxy: &RuntimeEventProxy,
) -> Result<u64, String> {
    validate_supervised_runtime_bootstrap(&supervisor).await?;
    proxy.start(app.clone(), supervisor).await
}

async fn restore_previous_runtime(
    app: &tauri::AppHandle,
    supervisor: Arc<RuntimeProcessSupervisor>,
    proxy: &RuntimeEventProxy,
    previous_spec: RuntimeLaunchSpec,
) -> Result<u64, String> {
    proxy.stop().await;
    supervisor.reload_after_drain(previous_spec).await?;
    reconnect_supervised_runtime(app, supervisor, proxy).await
}

#[tauri::command]
async fn activate_runtime_resource(
    app: tauri::AppHandle,
    manager: State<'_, RuntimeResourceManager>,
    updates: State<'_, RuntimeUpdateState>,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
    proxy: State<'_, RuntimeEventProxy>,
    version: String,
    target: String,
) -> Result<ActivatedRuntimeResource, String> {
    let _lifecycle = updates.lifecycle.lock().await;
    let candidate = updates
        .pending
        .lock()
        .await
        .as_ref()
        .filter(|candidate| candidate.version == version && candidate.target == target)
        .cloned()
        .ok_or_else(|| "Runtime candidate is not the pending verified resource".to_string())?;
    let previous_spec = supervisor
        .launch_spec()
        .await
        .ok_or_else(|| "Runtime activation requires external Runtime mode".to_string())?;

    let drain = drain_supervised_runtime(supervisor.inner()).await?;
    if !drain.drained {
        return Err(format!(
            "Runtime did not drain {} active conversation(s) before the deadline",
            drain.active_conversations.len()
        ));
    }

    proxy.stop().await;
    let candidate_spec = RuntimeLaunchSpec {
        binary_path: candidate.binary_path.clone(),
        workspace: previous_spec.workspace.clone(),
        openagent_home: previous_spec.openagent_home.clone(),
        primary_desktop_services: previous_spec.primary_desktop_services,
    };
    if let Err(candidate_error) = supervisor.reload_after_drain(candidate_spec).await {
        let recovery = reconnect_supervised_runtime(&app, supervisor.inner().clone(), &proxy).await;
        let _ = app.emit(
            "runtime-resource-rolled-back",
            serde_json::json!({ "reason": "candidate_start_failed" }),
        );
        return Err(match recovery {
            Ok(_) => candidate_error,
            Err(recovery_error) => {
                format!("{candidate_error}; previous Runtime reconnect failed: {recovery_error}")
            }
        });
    }

    if let Err(validation_error) = validate_supervised_runtime_bootstrap(supervisor.inner()).await {
        let rollback = restore_previous_runtime(
            &app,
            supervisor.inner().clone(),
            &proxy,
            previous_spec.clone(),
        )
        .await;
        let _ = app.emit(
            "runtime-resource-rolled-back",
            serde_json::json!({ "reason": "bootstrap_failed" }),
        );
        return Err(match rollback {
            Ok(_) => validation_error,
            Err(rollback_error) => {
                format!("{validation_error}; Runtime rollback failed: {rollback_error}")
            }
        });
    }

    let generation = match proxy.start(app.clone(), supervisor.inner().clone()).await {
        Ok(generation) => generation,
        Err(reconnect_error) => {
            let rollback = restore_previous_runtime(
                &app,
                supervisor.inner().clone(),
                &proxy,
                previous_spec.clone(),
            )
            .await;
            let _ = app.emit(
                "runtime-resource-rolled-back",
                serde_json::json!({ "reason": "event_reconnect_failed" }),
            );
            return Err(match rollback {
                Ok(_) => reconnect_error,
                Err(rollback_error) => {
                    format!("{reconnect_error}; Runtime rollback failed: {rollback_error}")
                }
            });
        }
    };

    if let Err(activation_error) = manager.activate(&candidate).await {
        let rollback =
            restore_previous_runtime(&app, supervisor.inner().clone(), &proxy, previous_spec).await;
        let _ = app.emit(
            "runtime-resource-rolled-back",
            serde_json::json!({ "reason": "selection_commit_failed" }),
        );
        return Err(match rollback {
            Ok(_) => activation_error,
            Err(rollback_error) => {
                format!("{activation_error}; Runtime rollback failed: {rollback_error}")
            }
        });
    }

    *updates.pending.lock().await = None;
    let _ = app.emit(
        "runtime-resource-activated",
        serde_json::json!({
            "version": candidate.version,
            "target": candidate.target,
            "generation": generation,
        }),
    );
    let _ = app.emit(
        "runtime-resync-required",
        serde_json::json!({ "generation": generation }),
    );
    Ok(ActivatedRuntimeResource {
        version: candidate.version,
        target: candidate.target,
        event_generation: generation,
    })
}

#[cfg(test)]
mod modular_runtime_update_tests {
    use super::{runtime_update_available, validate_runtime_bootstrap};

    #[test]
    fn runtime_candidate_must_be_newer_than_the_active_resource() {
        assert!(runtime_update_available("1.2.0", "1.1.9").unwrap());
        assert!(!runtime_update_available("1.2.0", "1.2.0").unwrap());
        assert!(!runtime_update_available("1.1.9", "1.2.0").unwrap());
        assert!(runtime_update_available("1.2.0", "invalid").is_err());
    }

    #[test]
    fn candidate_bootstrap_requires_the_durable_desktop_shape() {
        let valid = serde_json::json!({
            "config": {},
            "workspace_path": "C:/workspace",
            "workspace": {},
            "launch_context": {},
            "conversations": [],
            "active_conv_id": null,
        });
        assert!(validate_runtime_bootstrap(&valid).is_ok());

        let mut invalid = valid;
        invalid.as_object_mut().unwrap().remove("conversations");
        assert!(validate_runtime_bootstrap(&invalid).is_err());
    }
}

#[tauri::command]
async fn prepare_frontend_resource(
    manager: State<'_, FrontendResourceManager>,
) -> Result<PreparedFrontendResource, String> {
    if cfg!(debug_assertions) {
        return Err("production frontend resources are disabled in development builds".to_string());
    }
    let InstalledFrontendResource { version, .. } = manager.install_latest().await?;
    let update_available = manager.is_newer_than_active(&version)?;
    Ok(PreparedFrontendResource {
        version,
        update_available,
    })
}

#[tauri::command]
async fn activate_frontend_resource(
    app: tauri::AppHandle,
    manager: State<'_, FrontendResourceManager>,
    version: String,
) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Err("production frontend resources are disabled in development builds".to_string());
    }
    manager.activate(&version).await?;
    navigate_frontend_windows(&app, Some(&version))?;
    let rollback_manager = manager.inner().clone();
    let rollback_app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(15)).await;
        match rollback_manager.rollback_pending().await {
            Ok(true) => {
                let version = rollback_manager.active_version();
                if let Err(error) = navigate_frontend_windows(&rollback_app, version.as_deref()) {
                    tracing::error!(%error, "failed to display frontend rollback");
                }
            }
            Ok(false) => {}
            Err(error) => tracing::error!(%error, "failed to roll back unconfirmed frontend"),
        }
    });
    Ok(())
}

#[tauri::command]
async fn confirm_frontend_activation(
    manager: State<'_, FrontendResourceManager>,
    version: String,
) -> Result<(), String> {
    manager.confirm(&version).await
}

fn apply_native_window_material(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        if let Err(mica_error) = window_vibrancy::apply_mica(window, None) {
            tracing::debug!(%mica_error, "Mica unavailable; trying Acrylic window material");
            if let Err(acrylic_error) = window_vibrancy::apply_acrylic(window, None) {
                tracing::debug!(%acrylic_error, "Acrylic unavailable; trying Blur window material");
                if let Err(blur_error) = window_vibrancy::apply_blur(window, None) {
                    tracing::warn!(
                        %mica_error,
                        %acrylic_error,
                        %blur_error,
                        window = window.label(),
                        "Native Windows material is unavailable"
                    );
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    if let Err(error) = window_vibrancy::apply_vibrancy(
        window,
        window_vibrancy::NSVisualEffectMaterial::UnderWindowBackground,
        Some(window_vibrancy::NSVisualEffectState::FollowsWindowActiveState),
        None,
    ) {
        tracing::warn!(%error, window = window.label(), "Native macOS vibrancy is unavailable");
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let _ = window;
}

// Keep the flat arguments aligned with the existing typed Tauri command contract.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
async fn submit_agent_input(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    text: String,
    parent_checkpoint_id: Option<String>,
    branch_id: Option<String>,
    attachments: Option<Vec<String>>,
    contexts: Option<Vec<UserMessageContext>>,
    model_binding: Option<ChatModelBinding>,
    user_message_id: Option<String>,
    assistant_message_id: Option<String>,
) -> Result<SubmissionOutcome, String> {
    runtime
        .inner()
        .facade()
        .submit_agent_input(AgentInputRequest {
            conv_id,
            text,
            parent_checkpoint_id,
            branch_id,
            attachments: attachments.unwrap_or_default(),
            contexts: contexts.unwrap_or_default(),
            model_binding,
            user_message_id,
            assistant_message_id,
        })
        .await
}

#[tauri::command]
fn get_agent_commands() -> Vec<CommandSpec> {
    agent_commands()
}

#[tauri::command]
fn resolve_agent_input(text: String) -> Result<ResolvedInput, InputError> {
    resolve_agent_input_text(text)
}

#[tauri::command]
async fn debug_create_context_compaction_diagnostic(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<String, String> {
    create_context_compaction_diagnostic(runtime.inner().clone(), runtime.state()).await
}

#[tauri::command]
async fn resume_interrupted_chat(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    interrupt_id: String,
    response: String,
    branch_id: Option<String>,
    assistant_message_id: String,
    model_binding: Option<ChatModelBinding>,
) -> Result<(), String> {
    runtime
        .inner()
        .facade()
        .resume_interrupt(ResumeInterruptRequest {
            conv_id,
            interrupt_id,
            response,
            branch_id,
            assistant_message_id,
            model_binding,
        })
        .await
}

#[tauri::command]
async fn submit_interrupt_response(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    interrupt_id: String,
    response: String,
) -> Result<(), String> {
    runtime
        .inner()
        .facade()
        .submit_interrupt_response(SubmitInterruptResponseRequest {
            interrupt_id,
            response,
        })
        .await
}

#[tauri::command]
async fn list_agent_roles(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<Vec<AgentRole>, String> {
    openagent_runtime::commands::list_agent_roles(runtime.state(), scope).await
}

#[tauri::command]
async fn list_agent_roles_for_workspace(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: String,
) -> Result<Vec<AgentRole>, String> {
    openagent_runtime::commands::list_agent_roles_for_workspace(runtime.state(), workspace).await
}

#[tauri::command]
async fn save_agent_role(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: Option<String>,
    scope: String,
    name: String,
    description: String,
) -> Result<AgentRole, String> {
    openagent_runtime::commands::save_agent_role(runtime.state(), id, scope, name, description)
        .await
}

#[tauri::command]
async fn delete_agent_role(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
) -> Result<(), String> {
    openagent_runtime::commands::delete_agent_role(runtime.state(), id).await
}

#[tauri::command]
async fn get_settings(runtime: State<'_, Arc<OpenAgentRuntime>>) -> Result<Config, String> {
    openagent_runtime::commands::get_settings(runtime.state()).await
}

#[tauri::command]
async fn save_settings(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    config: Config,
    base_config: Option<Config>,
) -> Result<Config, String> {
    openagent_runtime::commands::save_settings(runtime.state(), config, base_config).await
}

#[tauri::command]
async fn get_wechat_channel_status(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<openagent_runtime::channels::WechatChannelStatus, String> {
    Ok(openagent_runtime::channels::get_wechat_channel_status(runtime.state()).await)
}

#[tauri::command]
async fn get_channel_statuses(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<openagent_runtime::channels::ChannelStatus>, String> {
    Ok(openagent_runtime::channels::get_channel_statuses(runtime.state()).await)
}

#[tauri::command]
async fn reset_wechat_channel(runtime: State<'_, Arc<OpenAgentRuntime>>) -> Result<(), String> {
    openagent_runtime::channels::reset_wechat_channel(runtime.state()).await
}

fn diagnostic_event_name(value: &str) -> &'static str {
    match value {
        "frontend_uncaught_error" => "frontend_uncaught_error",
        "frontend_unhandled_rejection" => "frontend_unhandled_rejection",
        "settings_save_failed" => "settings_save_failed",
        _ => "unknown_event",
    }
}

fn diagnostic_component(value: &str) -> &'static str {
    match value {
        "window" => "window",
        "SettingsView" => "SettingsView",
        _ => "unknown_component",
    }
}

fn diagnostic_error_type(value: &str) -> &'static str {
    match value {
        "Error" => "Error",
        "EvalError" => "EvalError",
        "RangeError" => "RangeError",
        "ReferenceError" => "ReferenceError",
        "SyntaxError" => "SyntaxError",
        "TypeError" => "TypeError",
        "URIError" => "URIError",
        "AggregateError" => "AggregateError",
        "AbortError" => "AbortError",
        "NetworkError" => "NetworkError",
        "NotAllowedError" => "NotAllowedError",
        "NotFoundError" => "NotFoundError",
        "NotReadableError" => "NotReadableError",
        "NotSupportedError" => "NotSupportedError",
        "OperationError" => "OperationError",
        "QuotaExceededError" => "QuotaExceededError",
        "SecurityError" => "SecurityError",
        "TimeoutError" => "TimeoutError",
        "UnknownError" => "UnknownError",
        "bigint" => "bigint",
        "boolean" => "boolean",
        "function" => "function",
        "number" => "number",
        "object" => "object",
        "string" => "string",
        "symbol" => "symbol",
        "undefined" => "undefined",
        _ => "unknown_error_type",
    }
}

#[tauri::command]
fn report_frontend_diagnostic(event_name: String, component: String, error_kind: String) {
    tracing::error!(
        target: "openagent::diagnostics",
        event_name = diagnostic_event_name(&event_name),
        code_namespace = diagnostic_component(&component),
        error_type = diagnostic_error_type(&error_kind),
        "frontend operation failed"
    );
}

#[tauri::command]
async fn set_default_chat_model(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    binding: DefaultModelBinding,
) -> Result<DefaultModelBinding, String> {
    openagent_runtime::commands::set_default_chat_model(runtime.state(), binding).await
}

#[tauri::command]
async fn set_model_reasoning_effort(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    provider_id: String,
    model: String,
    effort: ReasoningEffort,
) -> Result<ReasoningEffort, String> {
    openagent_runtime::commands::set_model_reasoning_effort(
        runtime.state(),
        provider_id,
        model,
        effort,
    )
    .await
}

#[tauri::command]
async fn save_workspace_prefs(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: String,
    recent_workspaces: Vec<RecentWorkspace>,
) -> Result<(), String> {
    openagent_runtime::commands::save_workspace_prefs(runtime.state(), workspace, recent_workspaces)
        .await
}

#[tauri::command]
async fn set_active_conversation(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: Option<String>,
    workspace: String,
) -> Result<(), String> {
    openagent_runtime::commands::set_active_conversation(runtime.state(), conv_id, workspace).await
}

#[tauri::command]
async fn get_active_conv_id(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: String,
) -> Result<Option<String>, String> {
    openagent_runtime::commands::get_active_conv_id(runtime.state(), workspace).await
}

#[tauri::command]
async fn test_provider_connection(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    request: ProviderProbeRequest,
) -> Result<ProviderProbeResult, String> {
    openagent_runtime::commands::test_provider_connection(runtime.inner(), request).await
}

#[tauri::command]
async fn fetch_provider_models(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    request: ProviderProbeRequest,
) -> Result<Vec<String>, String> {
    openagent_runtime::commands::fetch_provider_models(runtime.inner(), request).await
}

#[tauri::command]
async fn get_chatgpt_auth_status() -> Result<bool, String> {
    openagent_runtime::commands::get_chatgpt_auth_status().await
}

#[tauri::command]
async fn logout_chatgpt() -> Result<bool, String> {
    openagent_runtime::commands::logout_chatgpt().await
}

#[tauri::command]
async fn refresh_mcp_servers(runtime: State<'_, Arc<OpenAgentRuntime>>) -> Result<(), String> {
    openagent_runtime::commands::refresh_mcp_servers(runtime.state()).await
}

#[tauri::command]
async fn inspector_database_overview(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<InspectorDatabaseOverview, String> {
    openagent_runtime::commands::inspector_database_overview(runtime.state()).await
}

#[tauri::command]
async fn inspector_table_data(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    table_name: String,
    search: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<InspectorTableData, String> {
    openagent_runtime::commands::inspector_table_data(
        runtime.state(),
        table_name,
        search,
        sort_column,
        sort_direction,
        offset,
        limit,
    )
    .await
}

#[tauri::command]
async fn get_conversations(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: Option<String>,
) -> Result<Vec<ConversationMeta>, String> {
    openagent_runtime::commands::get_conversations(runtime.state(), workspace).await
}

#[tauri::command]
async fn get_conversation_page(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: Option<String>,
    cursor: Option<ConversationPageCursor>,
    limit: usize,
    search_query: Option<String>,
    filter_by_role: Option<bool>,
    role_id: Option<String>,
) -> Result<ConversationPage, String> {
    openagent_runtime::commands::get_conversation_page(
        runtime.state(),
        workspace,
        cursor,
        limit,
        search_query,
        filter_by_role,
        role_id,
    )
    .await
}

#[tauri::command]
async fn get_conversation_meta(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Option<ConversationMeta>, String> {
    openagent_runtime::commands::get_conversation_meta(runtime.state(), conv_id).await
}

#[tauri::command]
async fn get_child_conversations(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    parent_conv_id: String,
    workspace: Option<String>,
) -> Result<Vec<ConversationMeta>, String> {
    openagent_runtime::commands::get_child_conversations(runtime.state(), parent_conv_id, workspace)
        .await
}

#[tauri::command]
async fn create_conversation(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
    title: String,
    workspace: String,
    parent_conv_id: Option<String>,
    role_id: Option<String>,
) -> Result<(), String> {
    runtime
        .facade()
        .create_conversation(CreateConversationRequest {
            id,
            title,
            workspace,
            parent_conv_id,
            role_id,
        })
        .await
}

#[tauri::command]
async fn update_conversation(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    patch: ConvPatch,
) -> Result<(), String> {
    openagent_runtime::commands::update_conversation(runtime.state(), conv_id, patch).await
}

#[tauri::command]
async fn create_branch(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
    conv_id: String,
    parent_branch_id: Option<String>,
    forked_from_checkpoint_id: Option<String>,
    forked_from_message_id: Option<String>,
) -> Result<(), String> {
    openagent_runtime::commands::create_branch(
        runtime.state(),
        id,
        conv_id,
        parent_branch_id,
        forked_from_checkpoint_id,
        forked_from_message_id,
    )
    .await
}

#[tauri::command]
async fn get_branches(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Vec<BranchMeta>, String> {
    openagent_runtime::commands::get_branches(runtime.state(), conv_id).await
}

#[tauri::command]
async fn set_branch_head(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    branch_id: String,
    checkpoint_id: String,
) -> Result<(), String> {
    openagent_runtime::commands::set_branch_head(runtime.state(), branch_id, checkpoint_id).await
}

#[tauri::command]
async fn set_active_branch_tip(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    checkpoint_id: String,
) -> Result<(), String> {
    openagent_runtime::commands::set_active_branch_tip(runtime.state(), conv_id, checkpoint_id)
        .await
}

#[tauri::command]
async fn get_active_branch_tip(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Option<String>, String> {
    openagent_runtime::commands::get_active_branch_tip(runtime.state(), conv_id).await
}

#[tauri::command]
async fn delete_conversation(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<(), String> {
    runtime.facade().delete_conversation(conv_id).await
}

#[tauri::command]
async fn get_task_traces(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<TaskTrace>, String> {
    openagent_runtime::commands::get_task_traces(runtime.state()).await
}

#[tauri::command]
async fn get_latest_checkpoint(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Option<CheckpointMeta>, String> {
    openagent_runtime::commands::get_latest_checkpoint(runtime.state(), conv_id).await
}

#[tauri::command]
async fn get_checkpoint_metas(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Vec<CheckpointMeta>, String> {
    openagent_runtime::commands::get_checkpoint_metas(runtime.state(), conv_id).await
}

#[tauri::command]
async fn get_renderable_checkpoints(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Vec<RenderableCheckpoint>, String> {
    runtime.facade().renderable_checkpoints(conv_id).await
}

#[tauri::command]
async fn rollback_to_checkpoint(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    checkpoint_id: String,
) -> Result<(), String> {
    openagent_runtime::commands::rollback_to_checkpoint(runtime.state(), conv_id, checkpoint_id)
        .await
}

#[tauri::command]
async fn restore_agent_history(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    checkpoint_id: Option<String>,
) -> Result<(), String> {
    openagent_runtime::commands::restore_agent_history(runtime.state(), conv_id, checkpoint_id)
        .await
}

#[tauri::command]
async fn get_file_changes(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Vec<FileChange>, String> {
    openagent_runtime::commands::get_file_changes(runtime.state(), conv_id).await
}

#[tauri::command]
async fn revert_file_change(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    change_id: String,
) -> Result<String, String> {
    openagent_runtime::commands::revert_file_change(runtime.state(), change_id).await
}

#[tauri::command]
async fn revert_file_change_keep(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    change_id: String,
) -> Result<String, String> {
    openagent_runtime::commands::revert_file_change_keep(runtime.state(), change_id).await
}

#[tauri::command]
async fn apply_file_change_forward(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    change_id: String,
) -> Result<String, String> {
    openagent_runtime::commands::apply_file_change_forward(runtime.state(), change_id).await
}

#[tauri::command]
async fn list_skills(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<SkillMetadata>, String> {
    openagent_runtime::commands::list_skills(runtime.state()).await
}

#[tauri::command]
async fn list_agent_plugins(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<openagent_runtime::agent_plugins::AgentPluginSummary>, String> {
    openagent_runtime::commands::list_agent_plugins(runtime.state()).await
}

#[tauri::command]
async fn install_agent_plugin(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    source_path: String,
) -> Result<openagent_runtime::agent_plugins::AgentPluginSummary, String> {
    openagent_runtime::commands::install_agent_plugin(runtime.state(), source_path).await
}

#[tauri::command]
async fn uninstall_agent_plugin(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
) -> Result<(), String> {
    openagent_runtime::commands::uninstall_agent_plugin(runtime.state(), id).await
}

#[tauri::command]
async fn get_skill_content(path: String) -> Result<String, String> {
    openagent_runtime::commands::get_skill_content(path).await
}

#[tauri::command]
async fn save_skill_content(path: String, content: String) -> Result<(), String> {
    openagent_runtime::commands::save_skill_content(path, content).await
}

#[tauri::command]
async fn create_skill(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    name: String,
    description: String,
) -> Result<SkillMetadata, String> {
    openagent_runtime::commands::create_skill(runtime.state(), scope, name, description).await
}

#[tauri::command]
async fn delete_skill(path: String) -> Result<(), String> {
    openagent_runtime::commands::delete_skill(path).await
}

#[tauri::command]
async fn get_skills_dir(
    scope: String,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<String, String> {
    openagent_runtime::commands::get_skills_dir(scope, runtime.state()).await
}

#[cfg(debug_assertions)]
#[tauri::command]
async fn open_path(
    path: String,
    app_handle: tauri::AppHandle,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let resolved = openagent_runtime::commands::resolve_open_path(path, runtime.state()).await?;
    app_handle
        .opener()
        .open_path(resolved, None::<&str>)
        .map_err(|error| error.to_string())
}

#[cfg(not(debug_assertions))]
#[tauri::command]
async fn open_path(
    path: String,
    app_handle: tauri::AppHandle,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let response = runtime_transport::proxy_runtime_request(
        supervisor.inner(),
        RuntimeProxyRequest {
            method: "POST".to_string(),
            path: "/api/desktop/operations".to_string(),
            body: Some(
                serde_json::json!({
                    "operation": "resolve_open_path",
                    "args": { "path": path },
                })
                .to_string(),
            ),
        },
    )
    .await?;
    if !(200..300).contains(&response.status) {
        return Err(format!(
            "Runtime path resolution failed with status {}: {}",
            response.status, response.body
        ));
    }
    let resolved: String = serde_json::from_str(&response.body)
        .map_err(|error| format!("Runtime path resolution response was invalid: {error}"))?;
    app_handle
        .opener()
        .open_path(resolved, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn read_html_preview_file(
    path: String,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<HtmlPreviewFile, String> {
    openagent_runtime::commands::read_html_preview_file(path, runtime.state()).await
}

#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
    openagent_runtime::commands::read_text_file(path).await
}

#[tauri::command]
async fn read_workspace_text_snippet(
    path: String,
    start_line: usize,
    end_line: usize,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<WorkspaceTextSnippet, String> {
    openagent_runtime::commands::read_workspace_text_snippet(
        path,
        start_line,
        end_line,
        runtime.state(),
    )
    .await
}

#[tauri::command]
async fn resolve_workspace_media_source(
    path: String,
    kind: String,
    app_handle: tauri::AppHandle,
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<WorkspaceMediaSource, String> {
    let source =
        openagent_runtime::commands::resolve_workspace_media_source(path, kind, runtime.state())
            .await?;
    app_handle
        .asset_protocol_scope()
        .allow_file(&source.path)
        .map_err(|error| format!("Failed to authorize media preview: {error}"))?;
    Ok(source)
}

#[tauri::command]
async fn save_download_file(
    filename: String,
    content: String,
    encoding: Option<String>,
) -> Result<String, String> {
    openagent_runtime::commands::save_download_file(filename, content, encoding).await
}

#[tauri::command]
async fn get_mcp_servers(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<McpServerConfig>, String> {
    openagent_runtime::commands::get_mcp_servers(runtime.state()).await
}

#[tauri::command]
async fn save_mcp_servers(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    servers: Vec<McpServerConfig>,
) -> Result<(), String> {
    openagent_runtime::commands::save_mcp_servers(runtime.state(), servers).await
}

#[tauri::command]
async fn test_mcp_server(server: McpServerConfig) -> Result<mcp::McpProbeResult, String> {
    openagent_runtime::commands::test_mcp_server(server).await
}

#[tauri::command]
fn get_system_locale() -> String {
    openagent_runtime::commands::get_system_locale()
}

#[tauri::command]
async fn list_workspace_files(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    query: Option<String>,
) -> Result<Vec<String>, String> {
    openagent_runtime::commands::list_workspace_files(runtime.state(), query).await
}

#[tauri::command]
async fn clear_conversation(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<(), String> {
    openagent_runtime::commands::clear_conversation(runtime.state(), conv_id).await
}

#[tauri::command]
async fn cancel_chat_message(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<(), String> {
    runtime.facade().cancel_conversation(conv_id).await
}

#[tauri::command]
async fn set_chat_stream_paused(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    paused: bool,
) -> Result<(), String> {
    runtime
        .facade()
        .set_conversation_stream_paused(conv_id, paused)
        .await
}

#[tauri::command]
async fn skip_memory_retrieval(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<(), String> {
    openagent_runtime::commands::skip_memory_retrieval(runtime.state(), conv_id).await
}

#[tauri::command]
async fn set_chat_queue_pending(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
    pending: bool,
) -> Result<(), String> {
    openagent_runtime::commands::set_chat_queue_pending(runtime.state(), conv_id, pending).await
}

#[tauri::command]
async fn debug_disconnect_model_requests(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<String>, String> {
    openagent_runtime::commands::debug_disconnect_model_requests(runtime.state()).await
}

#[tauri::command]
async fn get_memory_status(runtime: State<'_, Arc<OpenAgentRuntime>>) -> Result<bool, String> {
    openagent_runtime::commands::get_memory_status(runtime.state()).await
}

#[tauri::command]
async fn trigger_flash_agent(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: Option<String>,
) -> Result<(), String> {
    openagent_runtime::commands::trigger_flash_agent(runtime.state(), conv_id).await
}

#[tauri::command]
async fn get_flash_status(runtime: State<'_, Arc<OpenAgentRuntime>>) -> Result<bool, String> {
    openagent_runtime::commands::get_flash_status(runtime.state()).await
}

#[tauri::command]
async fn list_scheduled_chat_hooks(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<Vec<ScheduledChatHookDefinition>, String> {
    openagent_runtime::commands::list_scheduled_chat_hooks(runtime.state()).await
}

#[tauri::command]
async fn cancel_scheduled_chat_hook(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
) -> Result<(), String> {
    openagent_runtime::commands::cancel_scheduled_chat_hook(runtime.state(), id).await
}

#[tauri::command]
async fn schedule_chat_hook(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    args: ScheduleChatHookArgs,
) -> Result<String, String> {
    openagent_runtime::commands::schedule_chat_hook(runtime.state(), args).await
}

#[tauri::command]
async fn update_scheduled_chat_hook(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
    args: ScheduleChatHookArgs,
) -> Result<String, String> {
    openagent_runtime::commands::update_scheduled_chat_hook(runtime.state(), id, args).await
}

#[tauri::command]
async fn get_agent_memories(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    query: Option<String>,
) -> Result<Vec<AgentMemoryEntry>, String> {
    openagent_runtime::commands::get_agent_memories(runtime.state(), scope, query).await
}

#[tauri::command]
async fn delete_agent_memory(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    id: String,
) -> Result<(), String> {
    openagent_runtime::commands::delete_agent_memory(runtime.state(), id).await
}

#[tauri::command]
async fn trigger_memory_agent(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: Option<String>,
) -> Result<(), String> {
    openagent_runtime::commands::trigger_memory_agent(runtime.inner(), runtime.state(), conv_id)
        .await
}

#[tauri::command]
async fn get_memory(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<String, String> {
    openagent_runtime::commands::get_memory(runtime.inner(), runtime.state(), scope).await
}

#[tauri::command]
async fn save_memory(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    content: String,
) -> Result<(), String> {
    openagent_runtime::commands::save_memory(runtime.inner(), runtime.state(), scope, content).await
}

#[tauri::command]
async fn export_memory_backup(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<String, String> {
    openagent_runtime::commands::export_memory_backup(runtime.inner(), runtime.state(), scope).await
}

#[tauri::command]
async fn import_memory_backup(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    content: String,
    replace: bool,
) -> Result<MemoryImportResult, String> {
    openagent_runtime::commands::import_memory_backup(
        runtime.inner(),
        runtime.state(),
        scope,
        content,
        replace,
    )
    .await
}

#[tauri::command]
async fn clear_memory(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<(), String> {
    openagent_runtime::commands::clear_memory(runtime.inner(), runtime.state(), scope).await
}

#[tauri::command]
async fn list_project_drafts(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<Vec<DraftCategoryEntry>, String> {
    openagent_runtime::commands::list_project_drafts(runtime.inner(), runtime.state(), scope).await
}

#[tauri::command]
async fn ensure_project_drafts_dir(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<String, String> {
    openagent_runtime::commands::ensure_project_drafts_dir(runtime.inner(), runtime.state(), scope)
        .await
}

#[tauri::command]
async fn get_project_draft(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    path: String,
) -> Result<String, String> {
    openagent_runtime::commands::get_project_draft(runtime.inner(), runtime.state(), scope, path)
        .await
}

#[tauri::command]
async fn save_project_draft(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    category: String,
    name: String,
    content: String,
) -> Result<DraftFileEntry, String> {
    openagent_runtime::commands::save_project_draft(
        runtime.inner(),
        runtime.state(),
        scope,
        category,
        name,
        content,
    )
    .await
}

#[tauri::command]
async fn delete_project_draft(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    path: String,
) -> Result<(), String> {
    openagent_runtime::commands::delete_project_draft(runtime.inner(), runtime.state(), scope, path)
        .await
}

#[tauri::command]
async fn get_design_document(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
) -> Result<String, String> {
    openagent_runtime::commands::get_design_document(runtime.inner(), runtime.state(), scope).await
}

#[tauri::command]
async fn save_design_document(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    scope: String,
    content: String,
) -> Result<(), String> {
    openagent_runtime::commands::save_design_document(
        runtime.inner(),
        runtime.state(),
        scope,
        content,
    )
    .await
}

#[tauri::command]
async fn save_pasted_attachment(name: String, content_base64: String) -> Result<String, String> {
    openagent_runtime::commands::save_pasted_attachment(name, content_base64).await
}

#[tauri::command]
async fn materialize_attachment_blob(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    blob_id: String,
    name: String,
) -> Result<String, String> {
    openagent_runtime::commands::materialize_attachment_blob(runtime.state(), blob_id, name).await
}

#[tauri::command]
async fn repair_attachment_blob(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    blob_id: String,
    name: String,
    path: String,
) -> Result<(), String> {
    openagent_runtime::commands::repair_attachment_blob(runtime.state(), blob_id, name, path).await
}

#[tauri::command]
async fn repair_attachment_blob_content(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    blob_id: String,
    name: String,
    content_base64: String,
) -> Result<(), String> {
    openagent_runtime::commands::repair_attachment_blob_content(
        runtime.state(),
        blob_id,
        name,
        content_base64,
    )
    .await
}

#[tauri::command]
async fn read_attachment_preview(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    locator: String,
    name: String,
) -> Result<AttachmentPreview, String> {
    openagent_runtime::commands::read_attachment_preview(runtime.state(), locator, name).await
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg(windows)]
fn foreground_belongs_to_desktop_window(
    shares_root_owner: bool,
    foreground_process_id: Option<u32>,
    current_process_id: u32,
) -> bool {
    shares_root_owner || foreground_process_id == Some(current_process_id)
}

#[cfg(windows)]
fn desktop_window_is_active(window: &tauri::WebviewWindow) -> Result<bool, String> {
    use windows::Win32::UI::WindowsAndMessaging::{GetAncestor, GA_ROOTOWNER};
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    let foreground_window = unsafe { GetForegroundWindow() };
    if foreground_window.0.is_null() {
        return Ok(false);
    }

    let desktop_window = window.hwnd().map_err(|error| error.to_string())?;
    let foreground_root_owner = unsafe { GetAncestor(foreground_window, GA_ROOTOWNER) };
    let desktop_root_owner = unsafe { GetAncestor(desktop_window, GA_ROOTOWNER) };
    let shares_root_owner = !foreground_root_owner.0.is_null()
        && !desktop_root_owner.0.is_null()
        && foreground_root_owner == desktop_root_owner;

    let mut foreground_process_id = 0;
    unsafe {
        GetWindowThreadProcessId(foreground_window, Some(&mut foreground_process_id));
    }
    Ok(foreground_belongs_to_desktop_window(
        shares_root_owner,
        Some(foreground_process_id),
        std::process::id(),
    ))
}

#[tauri::command]
fn is_desktop_window_active(window: tauri::WebviewWindow) -> Result<bool, String> {
    #[cfg(windows)]
    {
        // WebView2 may activate a child HWND, including one hosted by its own
        // subprocess. Resolve both handles through their root-owner chain first;
        // same-process ownership also covers native dialogs owned by this app.
        desktop_window_is_active(&window)
    }

    #[cfg(not(windows))]
    {
        window.is_focused().map_err(|error| error.to_string())
    }
}

fn show_onboarding_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("onboarding")
        .ok_or_else(|| "Onboarding window is unavailable".to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn reveal_onboarding_window(
    app: tauri::AppHandle,
    windows: State<'_, DesktopWindowState>,
) -> Result<(), String> {
    show_onboarding_window(&app)?;
    windows
        .startup_window_revealed
        .store(true, std::sync::atomic::Ordering::Release);
    Ok(())
}

#[tauri::command]
fn reveal_main_window(
    app: tauri::AppHandle,
    windows: State<'_, DesktopWindowState>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    windows
        .startup_window_revealed
        .store(true, std::sync::atomic::Ordering::Release);
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_remote_gateway_status() -> Result<RemoteGatewayStatus, String> {
    openagent_runtime::commands::get_remote_gateway_status().await
}

#[tauri::command]
async fn rotate_remote_gateway_pairing_code() -> Result<String, String> {
    openagent_runtime::commands::rotate_remote_gateway_pairing_code().await
}

#[tauri::command]
async fn list_wsl_distributions() -> Result<Vec<openagent_runtime::wsl::WslDistribution>, String> {
    openagent_runtime::commands::list_wsl_distributions().await
}

#[tauri::command]
async fn get_wsl_home(
    distribution: String,
) -> Result<openagent_runtime::wsl::WslWorkspaceTarget, String> {
    openagent_runtime::commands::get_wsl_home(distribution).await
}

#[tauri::command]
async fn resolve_wsl_workspace(
    distribution: String,
    linux_path: String,
) -> Result<openagent_runtime::wsl::WslWorkspaceTarget, String> {
    openagent_runtime::commands::resolve_wsl_workspace(distribution, linux_path).await
}

#[tauri::command]
async fn get_startup_bootstrap(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<StartupBootstrap, String> {
    openagent_runtime::commands::get_startup_bootstrap(runtime.inner().clone()).await
}

#[tauri::command]
async fn set_workspace(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    path: Option<String>,
) -> Result<(), String> {
    openagent_runtime::commands::set_workspace(runtime.inner().clone(), path).await
}

#[tauri::command]
async fn get_workspace_context(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
) -> Result<WorkspaceContext, String> {
    openagent_runtime::commands::get_workspace_context(runtime.state()).await
}

#[tauri::command]
fn get_workspace_launch_context() -> WorkspaceLaunchContext {
    openagent_runtime::commands::get_workspace_launch_context()
}

#[tauri::command]
async fn open_workspace_window(
    path: String,
    conversation_id: Option<String>,
    message_id: Option<String>,
) -> Result<(), String> {
    openagent_runtime::commands::open_workspace_window(path, conversation_id, message_id).await
}

#[tauri::command]
fn create_workspace_window(path: String) -> Result<(), String> {
    openagent_runtime::commands::create_workspace_window(path)
}

#[tauri::command]
async fn submit_quick_chat(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    workspace: String,
    text: String,
    attachments: Option<Vec<String>>,
    model_binding: Option<ChatModelBinding>,
    role_id: Option<String>,
) -> Result<String, String> {
    openagent_runtime::commands::submit_quick_chat(
        runtime.inner().clone(),
        QuickChatSubmission {
            workspace,
            text,
            attachments: attachments.unwrap_or_default(),
            model_binding,
            role_id,
        },
    )
    .await
}

#[tauri::command]
async fn get_conversation_workspace(
    runtime: State<'_, Arc<OpenAgentRuntime>>,
    conv_id: String,
) -> Result<Option<String>, String> {
    openagent_runtime::commands::get_conversation_workspace(runtime.state(), conv_id).await
}

struct TauriRuntimeHost {
    app: tauri::AppHandle,
}

impl RuntimeHost for TauriRuntimeHost {
    fn translate(&self, key: &str, fallback: &str) -> String {
        use tauri_plugin_i18n::PluginI18nExt;

        self.app
            .i18n()
            .translate(key)
            .filter(|translated| *translated != key)
            .unwrap_or(fallback)
            .to_string()
    }

    fn open_path(&self, path: &std::path::Path) -> Result<(), String> {
        use tauri_plugin_opener::OpenerExt;

        self.app
            .opener()
            .open_path(path.to_string_lossy().into_owned(), None::<&str>)
            .map_err(|error| error.to_string())
    }

    fn activate_workspace_window(&self, context: serde_json::Value) -> Result<(), String> {
        let window = self
            .app
            .get_webview_window("main")
            .ok_or_else(|| "Main window is unavailable".to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        self.app
            .emit_to("main", "workspace-window-open-request", context)
            .map_err(|error| error.to_string())
    }

    fn frontend_asset(&self, path: &str) -> Option<RuntimeAsset> {
        self.app
            .asset_resolver()
            .get(path.to_string())
            .map(|asset| RuntimeAsset {
                bytes: asset.bytes,
                mime_type: asset.mime_type,
            })
    }
}

#[cfg(all(test, windows))]
unsafe extern "C" {
    fn openagent_link_windows_test_manifest();
}

#[cfg(all(test, windows))]
#[test]
fn windows_test_harness_uses_common_controls_v6() {
    unsafe { openagent_link_windows_test_manifest() };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    run_with_mode(false);
}

pub fn run_agent_server() {
    run_with_mode(true);
}

const CONTINUE_TRANSITION_LABEL: &str = "备份并继续 / Back up and continue";
const EXIT_TRANSITION_LABEL: &str = "退出 / Exit";

fn persistence_transition_description(plan: &PersistenceTransitionPlan) -> String {
    let (scope_zh, scope_en) = match (plan.reset_config, plan.reset_conversations) {
        (true, true) => ("设置和对话记录", "settings and conversation history"),
        (true, false) => ("设置", "settings"),
        (false, true) => ("对话记录", "conversation history"),
        (false, false) => ("数据", "data"),
    };
    format!(
        "OpenAgent 检测到旧版或不兼容的{scope_zh}。继续升级会先把原文件完整备份到：\n{}\n\n随后会为受影响的范围创建全新数据。请先关闭其他 OpenAgent 窗口。选择“退出”可在继续前手动复制整个数据目录：\n{}\n\nOpenAgent found {scope_en} from an older or incompatible format. Continuing will preserve the original files at:\n{}\n\nFresh data will then be created only for the affected scope. Close every other OpenAgent window first. Choose “Exit” to make your own copy of the full data directory before continuing:\n{}",
        plan.backup_dir.display(),
        plan.data_dir.display(),
        plan.backup_dir.display(),
        plan.data_dir.display(),
    )
}

fn confirm_persistence_transition(plan: &PersistenceTransitionPlan) -> bool {
    matches!(
        rfd::MessageDialog::new()
            .set_level(rfd::MessageLevel::Warning)
            .set_title("OpenAgent 数据升级 / Data upgrade")
            .set_description(persistence_transition_description(plan))
            .set_buttons(rfd::MessageButtons::OkCancelCustom(
                CONTINUE_TRANSITION_LABEL.to_string(),
                EXIT_TRANSITION_LABEL.to_string(),
            ))
            .show(),
        rfd::MessageDialogResult::Custom(label) if label == CONTINUE_TRANSITION_LABEL
    )
}

fn prepare_interactive_persistence() -> anyhow::Result<bool> {
    let Some(plan) = pending_product_persistence_transition()? else {
        return Ok(true);
    };
    if !confirm_persistence_transition(&plan) {
        return Ok(false);
    }
    let backup_dir = apply_persistence_transition(&plan)?;
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Info)
        .set_title("OpenAgent 备份完成 / Backup complete")
        .set_description(format!(
            "旧数据已保存到：\n{}\n\nOpenAgent 将使用新的兼容配置继续启动。\n\nThe previous data was saved to:\n{}\n\nOpenAgent will now continue with fresh compatible data.",
            backup_dir.display(),
            backup_dir.display()
        ))
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
    Ok(true)
}

fn should_enforce_single_instance(agent_server: bool, is_workspace_window: bool) -> bool {
    !agent_server && !is_workspace_window
}

fn should_reveal_workspace_shell_early(agent_server: bool, is_workspace_window: bool) -> bool {
    !agent_server && is_workspace_window
}

fn packaged_runtime_binary() -> Result<std::path::PathBuf, String> {
    let executable = std::env::current_exe()
        .map_err(|error| format!("Failed to resolve desktop executable path: {error}"))?;
    let directory = executable
        .parent()
        .ok_or_else(|| "Desktop executable has no parent directory".to_string())?;
    #[cfg(windows)]
    let name = "openagent-server.exe";
    #[cfg(not(windows))]
    let name = "openagent-server";
    let binary = directory.join(name);
    if !binary.is_file() {
        return Err(format!(
            "Packaged Runtime fallback is missing: {}",
            binary.display()
        ));
    }
    Ok(binary)
}

async fn start_runtime_spec(
    supervisor: &RuntimeProcessSupervisor,
    spec: RuntimeLaunchSpec,
) -> Result<(), String> {
    supervisor.start(spec).await?;
    if let Err(error) = validate_supervised_runtime_bootstrap(supervisor).await {
        let _ = supervisor.stop().await;
        return Err(error);
    }
    Ok(())
}

async fn start_external_desktop_runtime(
    app: &tauri::AppHandle,
    supervisor: Arc<RuntimeProcessSupervisor>,
    manager: &RuntimeResourceManager,
    launch: ExternalRuntimeLaunch,
    primary_desktop_services: bool,
) -> Result<(), String> {
    let spec_for = |binary_path| RuntimeLaunchSpec {
        binary_path,
        workspace: launch.workspace.clone(),
        openagent_home: launch.openagent_home.clone(),
        primary_desktop_services,
    };
    let mut failures = Vec::new();
    if let Some(active) = manager.active_resource().await? {
        match start_runtime_spec(&supervisor, spec_for(active.binary_path.clone())).await {
            Ok(()) => {
                app.state::<RuntimeEventProxy>()
                    .start(app.clone(), supervisor)
                    .await?;
                return Ok(());
            }
            Err(error) => {
                failures.push(format!("active Runtime {} failed: {error}", active.version))
            }
        }
        if let Some(previous) = manager.rollback_active().await? {
            match start_runtime_spec(&supervisor, spec_for(previous.binary_path.clone())).await {
                Ok(()) => {
                    app.state::<RuntimeEventProxy>()
                        .start(app.clone(), supervisor)
                        .await?;
                    return Ok(());
                }
                Err(error) => failures.push(format!(
                    "previous Runtime {} failed: {error}",
                    previous.version
                )),
            }
        }
    }
    let packaged = packaged_runtime_binary()?;
    start_runtime_spec(&supervisor, spec_for(packaged))
        .await
        .map_err(|error| {
            failures.push(format!("packaged Runtime failed: {error}"));
            failures.join("; ")
        })?;
    app.state::<RuntimeEventProxy>()
        .start(app.clone(), supervisor)
        .await?;
    Ok(())
}

fn single_instance_window_label(onboarding_visible: bool) -> &'static str {
    if onboarding_visible {
        "onboarding"
    } else {
        "main"
    }
}

#[cfg(test)]
mod single_instance_tests {
    use super::{
        should_enforce_single_instance, should_reveal_workspace_shell_early,
        single_instance_window_label,
    };

    #[test]
    fn only_regular_desktop_launches_share_the_primary_instance() {
        assert!(should_enforce_single_instance(false, false));
        assert!(!should_enforce_single_instance(false, true));
        assert!(!should_enforce_single_instance(true, false));
    }

    #[test]
    fn dedicated_workspace_windows_reveal_the_loading_shell_early() {
        assert!(!should_reveal_workspace_shell_early(false, false));
        assert!(should_reveal_workspace_shell_early(false, true));
        assert!(!should_reveal_workspace_shell_early(true, true));
    }

    #[test]
    fn repeated_launch_restores_main_when_onboarding_is_hidden() {
        assert_eq!(single_instance_window_label(false), "main");
        assert_eq!(single_instance_window_label(true), "onboarding");
    }
}

fn run_with_mode(agent_server: bool) {
    if !agent_server {
        match prepare_interactive_persistence() {
            Ok(true) => {}
            Ok(false) => return,
            Err(error) => {
                rfd::MessageDialog::new()
                    .set_level(rfd::MessageLevel::Error)
                    .set_title("OpenAgent 升级失败 / Upgrade failed")
                    .set_description(format!(
                        "未修改无法安全备份的数据。请手动备份应用数据目录后重试。\n\nNo data that could not be safely backed up was replaced. Back up the application data directory manually, then try again.\n\n{error:#}"
                    ))
                    .set_buttons(rfd::MessageButtons::Ok)
                    .show();
                panic!("Failed to prepare OpenAgent persistence transition: {error:#}");
            }
        }
    }
    let startup_started_at = std::time::Instant::now();
    let is_workspace_window = is_workspace_window_process();
    let HostRuntimeBootstrap {
        initial_locale,
        runtime,
        html_preview_roots,
        external_launch,
    } = prepare_host_runtime(agent_server)
        .unwrap_or_else(|error| panic!("Failed to initialize OpenAgent runtime: {error:#}"));

    let protocol_roots = html_preview_roots;
    let frontend_manager = frontend_resource_manager()
        .unwrap_or_else(|error| panic!("Failed to initialize frontend resources: {error}"));
    let frontend_protocol_root = frontend_manager.asset_root();
    let startup_frontend_manager = frontend_manager.clone();
    let runtime_supervisor = Arc::new(
        RuntimeProcessSupervisor::new(openagent_protocol::SDK_PROTOCOL_VERSION)
            .unwrap_or_else(|error| panic!("Failed to initialize Runtime supervisor: {error}")),
    );
    let startup_runtime_supervisor = runtime_supervisor.clone();
    let protocol_runtime_supervisor = runtime_supervisor.clone();
    let runtime_manager = runtime_resource_manager();
    let startup_runtime_manager = runtime_manager.clone();
    let builder = tauri::Builder::default();

    // This must remain the first registered plugin. Ordinary desktop launches
    // share one primary process, while the SDK-owned workspace-window processes
    // and the headless agent server keep their intentionally separate lifecycles.
    #[cfg(desktop)]
    let builder = if should_enforce_single_instance(agent_server, is_workspace_window) {
        builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let onboarding_visible = app
                .get_webview_window("onboarding")
                .and_then(|window| window.is_visible().ok())
                .unwrap_or(false);
            if let Some(window) =
                app.get_webview_window(single_instance_window_label(onboarding_visible))
            {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
    } else {
        builder
    };

    // Pilot exposes its named-pipe automation bridge only in debug builds and
    // becomes a no-op plugin in release builds.
    let builder = builder.plugin(tauri_plugin_pilot::init());

    let builder = builder
        .register_asynchronous_uri_scheme_protocol(
            html_preview_protocol::SCHEME,
            move |_context, request, responder| {
                let roots = protocol_roots.clone();
                tauri::async_runtime::spawn(async move {
                    responder.respond(html_preview_protocol::serve(request, roots).await);
                });
            },
        )
        .register_asynchronous_uri_scheme_protocol(
            frontend_resource::FRONTEND_SCHEME,
            move |_context, request, responder| {
                let root = frontend_protocol_root.clone();
                tauri::async_runtime::spawn(async move {
                    responder.respond(frontend_resource::serve(request, root).await);
                });
            },
        )
        .register_asynchronous_uri_scheme_protocol(
            runtime_asset_protocol::SCHEME,
            move |_context, request, responder| {
                let supervisor = protocol_runtime_supervisor.clone();
                tauri::async_runtime::spawn(async move {
                    responder.respond(runtime_asset_protocol::serve(request, &supervisor).await);
                });
            },
        )
        .plugin(tauri_plugin_i18n::init(Some(initial_locale)));

    #[cfg(desktop)]
    let builder = if agent_server {
        builder
    } else {
        builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
    };

    #[cfg(desktop)]
    let builder = if agent_server {
        builder
    } else {
        builder.plugin(tauri_plugin_updater::Builder::new().build())
    };

    #[cfg(desktop)]
    let builder = if agent_server {
        builder
    } else {
        builder.plugin(tauri_plugin_global_shortcut::Builder::new().build())
    };

    let mut context = tauri::generate_context!();
    if agent_server {
        context.config_mut().app.windows.clear();
    }

    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init());
    let builder = if let Some(runtime) = runtime.clone() {
        builder.manage(runtime)
    } else {
        builder
    };
    builder
        .manage(runtime_supervisor)
        .manage(RuntimeEventProxy::default())
        .manage(RuntimeUpdateState::default())
        .manage(DesktopWindowState::default())
        .manage(EmbeddingResourceManager::default())
        .manage(runtime_manager)
        .manage(frontend_manager)
        .setup(move |app| {
            // init_tracing() spawns a background Tokio task (batch exporter). The
            // .setup() callback runs on the main thread which is not a Tokio worker
            // thread, so we use block_on to enter the runtime context before calling it.
            tauri::async_runtime::block_on(async {
                let diagnostic_logs_enabled = if let Some(runtime) = runtime.as_ref() {
                    runtime
                        .state()
                        .config
                        .lock()
                        .await
                        .diagnostic_log_collection_enabled
                } else {
                    openagent_runtime::config::load_config()
                        .map(|config| config.diagnostic_log_collection_enabled)
                        .unwrap_or(true)
                };
                tracing_setup::set_diagnostic_log_collection_enabled(diagnostic_logs_enabled);
                tracing_setup::init_tracing_with_service_version(env!("CARGO_PKG_VERSION"));
            });
            tracing::info!(
                target: "openagent::startup",
                elapsed_ms = startup_started_at.elapsed().as_millis() as u64,
                "Tauri setup started"
            );

            if let Some(launch) = external_launch.clone() {
                tauri::async_runtime::block_on(start_external_desktop_runtime(
                    app.handle(),
                    startup_runtime_supervisor.clone(),
                    &startup_runtime_manager,
                    launch,
                    !is_workspace_window,
                ))
                .map_err(std::io::Error::other)?;
            }

            if let Some(window) = app.get_webview_window("main") {
                apply_native_window_material(&window);
                if !cfg!(debug_assertions) {
                    if let Some(version) = startup_frontend_manager.active_version() {
                        let url = external_frontend_url("", &version)
                            .map_err(std::io::Error::other)?;
                        window.navigate(url)?;
                    }
                }
            }

            // Keep diagnostics alongside the application without shipping an
            // inspector surface in release builds. The frontend route is also
            // guarded by import.meta.env.DEV.
            #[cfg(debug_assertions)]
            {
                if !is_workspace_window {
                    let runtime = app.state::<Arc<OpenAgentRuntime>>().inner().clone();
                    let result = tauri::async_runtime::block_on(async { start_dev_api(runtime) });
                    if let Err(error) = result {
                        tracing::warn!(%error, "OpenAgent dev API did not start");
                    }
                    if !agent_server {
                        tauri::WebviewWindowBuilder::new(
                            app,
                            "debug",
                            tauri::WebviewUrl::App("/?dev-inspector=1".into()),
                        )
                        .title("OpenAgent Dev Inspector")
                        .inner_size(980.0, 760.0)
                        .min_inner_size(720.0, 520.0)
                        .build()?;
                    }
                }
            }

            if !agent_server && !is_workspace_window {
                let onboarding_window = tauri::WebviewWindowBuilder::new(
                    app,
                    "onboarding",
                    product_webview_url(&startup_frontend_manager, "?onboarding-window=1")
                        .map_err(std::io::Error::other)?,
                )
                .title("OpenAgent Setup")
                .inner_size(960.0, 640.0)
                .decorations(false)
                .transparent(true)
                .resizable(false)
                .maximizable(false)
                .center()
                .visible(false)
                .build()?;
                apply_native_window_material(&onboarding_window);

                tauri::WebviewWindowBuilder::new(
                    app,
                    "quick-chat",
                    product_webview_url(&startup_frontend_manager, "?quick-chat-window=1")
                        .map_err(std::io::Error::other)?,
                )
                .title("OpenAgent Quick Chat")
                .inner_size(856.0, 246.0)
                .min_inner_size(760.0, 246.0)
                .decorations(false)
                .transparent(true)
                .resizable(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .shadow(false)
                .visible(false)
                .build()?;
            }

            if should_reveal_workspace_shell_early(agent_server, is_workspace_window) {
                if let Some(window) = app.get_webview_window("main") {
                    window.show()?;
                    window.set_focus()?;
                    app.state::<DesktopWindowState>()
                        .startup_window_revealed
                        .store(true, std::sync::atomic::Ordering::Release);
                    tracing::info!(
                        target: "openagent::startup",
                        elapsed_ms = startup_started_at.elapsed().as_millis() as u64,
                        "workspace window shell revealed"
                    );
                }
            }

            // Embedded development and the legacy headless Tauri entry point
            // retain their in-process host adapter. Ordinary release desktop
            // processes have already started the sole external Runtime above.
            if let Some(runtime) = runtime.as_ref() {
                let _ = runtime.set_host(Arc::new(TauriRuntimeHost {
                    app: app.handle().clone(),
                }));
                tauri::async_runtime::spawn(openagent_runtime::commands::watch_config(
                    runtime.clone(),
                ));
            let mut runtime_events = runtime.subscribe();
            let event_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    match runtime_events.recv().await {
                        Ok(event) => {
                            if let Err(error) = event_app.emit(&event.name, event.payload) {
                                tracing::warn!(
                                    event = %event.name,
                                    %error,
                                    "failed to project runtime event to Tauri"
                                );
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                            tracing::warn!(
                                skipped,
                                "Tauri runtime-event adapter lagged behind"
                            );
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    }
                }
            });
            if !is_workspace_window {
                tauri::async_runtime::block_on(async {
                    openagent_runtime::channels::start_channel_supervisor(
                        runtime.clone(),
                        openagent_runtime::config::config_dir(),
                    );
                });
                let gateway_runtime = runtime.clone();
                let result = tauri::async_runtime::block_on(async {
                    start_remote_gateway(gateway_runtime)
                });
                if let Err(error) = result {
                    tracing::warn!(%error, "OpenAgent remote gateway did not start");
                }
            }
            if !agent_server && !is_workspace_window {
                let restore_runtime = runtime.clone();
                tauri::async_runtime::spawn(async move {
                    match tools::restore_scheduled_chat_hooks(restore_runtime).await {
                        Ok(count) if count > 0 => {
                            tracing::info!(target: "openagent::app", count, "restored scheduled chat hooks");
                        }
                        Ok(_) => {}
                        Err(e) => tracing::error!(target: "openagent::app", error = %e, "scheduled chat hook restoration failed"),
                    }
                });
            }
            // MCP transports may spawn subprocesses or establish network
            // connections. Keep all of that work off Tauri's main-thread setup
            // path so the webview can begin bootstrapping immediately.
            let startup_runtime = runtime.clone();
            tauri::async_runtime::spawn(async move {
                let state = startup_runtime.state();
                let config = state.config.lock().await.clone();
                let servers =
                    openagent_runtime::commands::effective_mcp_servers(state, &config).await;
                let mcp_handles = mcp::connect_mcp_servers(&servers);
                *state.mcp_join_handles.lock().await = mcp_handles;
                tracing::info!(
                    target: "openagent::startup",
                    elapsed_ms = startup_started_at.elapsed().as_millis() as u64,
                    "MCP connections scheduled"
                );
            });
            }

            if !agent_server {
                let startup_app = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                    if !startup_app
                        .state::<DesktopWindowState>()
                        .startup_window_revealed
                        .load(std::sync::atomic::Ordering::Acquire)
                    {
                        if let Some(window) = startup_app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            get_embedding_resource_status,
            prepare_embedding_resource,
            prepare_runtime_resource,
            activate_runtime_resource,
            runtime_transport_mode,
            proxy_runtime_request,
            start_runtime_event_proxy,
            stop_runtime_event_proxy,
            prepare_frontend_resource,
            activate_frontend_resource,
            confirm_frontend_activation,
            save_settings,
            get_channel_statuses,
            get_wechat_channel_status,
            reset_wechat_channel,
            report_frontend_diagnostic,
            set_default_chat_model,
            set_model_reasoning_effort,
            test_provider_connection,
            fetch_provider_models,
            get_chatgpt_auth_status,
            logout_chatgpt,
            set_workspace,
            get_workspace_context,
            get_remote_gateway_status,
            rotate_remote_gateway_pairing_code,
            list_wsl_distributions,
            get_wsl_home,
            resolve_wsl_workspace,
            get_startup_bootstrap,
            get_workspace_launch_context,
            open_workspace_window,
            create_workspace_window,
            submit_quick_chat,
            get_conversation_workspace,
            clear_conversation,
            submit_agent_input,
            get_agent_commands,
            resolve_agent_input,
            debug_create_context_compaction_diagnostic,
            resume_interrupted_chat,
            cancel_chat_message,
            set_chat_stream_paused,
            skip_memory_retrieval,
            set_chat_queue_pending,
            debug_disconnect_model_requests,
            inspector_database_overview,
            inspector_table_data,
            trigger_memory_agent,
            get_memory_status,
            trigger_flash_agent,
            get_flash_status,
            list_scheduled_chat_hooks,
            cancel_scheduled_chat_hook,
            schedule_chat_hook,
            update_scheduled_chat_hook,
            get_memory,
            save_memory,
            export_memory_backup,
            import_memory_backup,
            clear_memory,
            get_agent_memories,
            delete_agent_memory,
            list_agent_roles,
            list_agent_roles_for_workspace,
            save_agent_role,
            delete_agent_role,
            list_project_drafts,
            ensure_project_drafts_dir,
            get_project_draft,
            save_project_draft,
            delete_project_draft,
            get_design_document,
            save_design_document,
            get_system_locale,
            list_skills,
            list_agent_plugins,
            install_agent_plugin,
            uninstall_agent_plugin,
            get_skill_content,
            save_skill_content,
            create_skill,
            delete_skill,
            get_skills_dir,
            open_path,
            read_html_preview_file,
            read_text_file,
            read_workspace_text_snippet,
            resolve_workspace_media_source,
            save_download_file,
            get_mcp_servers,
            save_mcp_servers,
            test_mcp_server,
            refresh_mcp_servers,
            get_conversations,
            get_conversation_page,
            get_conversation_meta,
            get_child_conversations,
            create_conversation,
            update_conversation,
            create_branch,
            get_branches,
            set_branch_head,
            delete_conversation,
            get_task_traces,
            get_latest_checkpoint,
            get_checkpoint_metas,
            get_renderable_checkpoints,
            rollback_to_checkpoint,
            restore_agent_history,
            get_file_changes,
            revert_file_change,
            revert_file_change_keep,
            apply_file_change_forward,
            submit_interrupt_response,
            save_workspace_prefs,
            set_active_conversation,
            get_active_conv_id,
            set_active_branch_tip,
            get_active_branch_tip,
            list_workspace_files,
            save_pasted_attachment,
            materialize_attachment_blob,
            repair_attachment_blob,
            repair_attachment_blob_content,
            read_attachment_preview,
            restart_app,
            quit_app,
            is_desktop_window_active,
            reveal_main_window,
            reveal_onboarding_window,
        ])
        .run(context)
        .expect("error while running tauri application");

    // Flush remaining spans before the process exits. Must be called here while
    // tauri::async_runtime (a global Tokio runtime) is still alive, because the
    // BatchSpanProcessor needs an async context to export the final HTTP batch.
    tracing_setup::shutdown_tracing();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn persistence_transition_warning_names_scope_and_backup_paths() {
        let plan = PersistenceTransitionPlan {
            data_dir: Path::new("C:/OpenAgent/data").to_path_buf(),
            backup_dir: Path::new("C:/OpenAgent/data/backups/before-data-v1").to_path_buf(),
            reset_config: true,
            reset_conversations: false,
        };
        let warning = persistence_transition_description(&plan);
        assert!(warning.contains("设置"));
        assert!(warning.contains("settings"));
        assert!(warning.contains("C:/OpenAgent/data/backups/before-data-v1"));
        assert!(warning.contains("C:/OpenAgent/data"));
        assert!(!warning.contains("conversation history from"));
    }

    #[test]
    fn diagnostic_fields_are_allowlisted() {
        assert_eq!(
            diagnostic_event_name("frontend_uncaught_error"),
            "frontend_uncaught_error"
        );
        assert_eq!(diagnostic_component("SettingsView"), "SettingsView");
        assert_eq!(diagnostic_error_type("TypeError"), "TypeError");
        assert_eq!(diagnostic_event_name("raw user message"), "unknown_event");
        assert_eq!(
            diagnostic_component("C:/Users/example/private"),
            "unknown_component"
        );
        assert_eq!(diagnostic_error_type("secretError"), "unknown_error_type");
    }

    #[cfg(windows)]
    #[test]
    fn foreground_activity_accepts_the_window_tree_or_current_process() {
        assert!(foreground_belongs_to_desktop_window(true, Some(7), 42));
        assert!(foreground_belongs_to_desktop_window(false, Some(42), 42));
        assert!(!foreground_belongs_to_desktop_window(false, Some(7), 42));
        assert!(!foreground_belongs_to_desktop_window(false, None, 42));
    }

    #[test]
    fn bundled_embedding_model_runs_offline() {
        let model_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(EMBEDDING_MODEL_RESOURCE_PATH);
        let model = openagent_runtime::embedding::load_bundled_model(model_dir)
            .expect("bundled model should load");
        let embeddings = model
            .embed(
                vec![
                    "A desktop agent remembers useful context.",
                    "桌面智能体会记住有用的上下文。",
                ],
                None,
            )
            .expect("bundled model should produce embeddings");

        assert_eq!(embeddings.len(), 2);
        assert!(embeddings.iter().all(|embedding| embedding.len() == 384));
        assert!(embeddings
            .iter()
            .flatten()
            .all(|component| component.is_finite()));
    }

    #[test]
    fn bundled_embedding_seed_installs_the_persistent_resource() {
        let seed = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(EMBEDDING_MODEL_RESOURCE_PATH);
        let fixture = std::env::temp_dir().join(format!(
            "openagent-embedding-install-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let manager = EmbeddingResourceManager::new(fixture.clone());
        let installed = tauri::async_runtime::block_on(manager.prepare(Some(seed), |_| {}))
            .expect("bundled seed should install");

        assert!(installed.ready());
        openagent_runtime::embedding::load_bundled_model(manager.model_dir().to_path_buf())
            .expect("installed resource should load offline");
        std::fs::remove_dir_all(fixture).expect("embedding fixture should be removable");
    }

    #[test]
    #[ignore = "requires GitHub access and downloads the 23.7 MB embedding resource"]
    fn embedding_resource_downloads_and_loads_from_github() {
        let fixture = std::env::temp_dir().join(format!(
            "openagent-embedding-download-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let manager = EmbeddingResourceManager::new(fixture.clone());
        let installed = tauri::async_runtime::block_on(manager.prepare(None, |_| {}))
            .expect("GitHub embedding resource should install");

        assert!(installed.ready());
        openagent_runtime::embedding::load_bundled_model(manager.model_dir().to_path_buf())
            .expect("downloaded resource should load offline");
        std::fs::remove_dir_all(fixture).expect("embedding fixture should be removable");
    }
}
