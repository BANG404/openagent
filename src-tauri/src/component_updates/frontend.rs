use super::barrier::release_component_update;
use super::PreparedFrontendResource;
use super::RuntimeUpdateState;
use crate::desktop_exit::DesktopWindowState;
use crate::diagnostics::component_update_version;
use crate::frontend_resource::{FrontendResourceManager, InstalledFrontendResource};
use crate::runtime_process::RuntimeProcessSupervisor;
use std::sync::Arc;
use tauri::{Manager, State};

fn external_frontend_url_for_platform(
    query: &str,
    version: &str,
    windows: bool,
) -> Result<tauri::Url, String> {
    // WebView2 rewrites registered custom protocols only while constructing a
    // WebView. Runtime navigation must use the equivalent mapped origin.
    let origin = if windows {
        "http://openagent-ui.localhost/"
    } else {
        "openagent-ui://localhost/"
    };
    let separator = if query.is_empty() { '?' } else { '&' };
    tauri::Url::parse(&format!(
        "{origin}{query}{separator}frontend-version={version}"
    ))
    .map_err(|error| format!("failed to build external frontend URL: {error}"))
}

pub(crate) fn external_frontend_url(query: &str, version: &str) -> Result<tauri::Url, String> {
    external_frontend_url_for_platform(query, version, cfg!(target_os = "windows"))
}

fn embedded_frontend_url(query: &str) -> Result<tauri::Url, String> {
    #[cfg(target_os = "windows")]
    let origin = "http://tauri.localhost/";
    #[cfg(not(target_os = "windows"))]
    let origin = "tauri://localhost/";
    tauri::Url::parse(&format!("{origin}{query}"))
        .map_err(|error| format!("failed to build embedded frontend URL: {error}"))
}

pub(crate) fn frontend_window_query(label: &str) -> &'static str {
    match label {
        "onboarding" => "?onboarding-window=1",
        "quick-chat" => "?quick-chat-window=1",
        "debug" => "?dev-inspector=1",
        "role-editor" => "?role-editor-window=1",
        "settings-general" => "?settings-window=general",
        "settings-models" => "?settings-window=models",
        "settings-agent" => "?settings-window=agent",
        "settings-integrations" => "?settings-window=integrations",
        "settings-memory" => "?settings-window=memory",
        "settings-about" => "?settings-window=about",
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

pub(crate) fn product_webview_url(
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

#[tauri::command]
pub(crate) async fn prepare_frontend_resource(
    manager: State<'_, FrontendResourceManager>,
) -> Result<PreparedFrontendResource, String> {
    if cfg!(debug_assertions) {
        return Err("production frontend resources are disabled in development builds".to_string());
    }
    tracing::info!(
        target: "openagent::component_update",
        component = "frontend",
        stage = "check_started",
        "checking signed frontend component channel"
    );
    let InstalledFrontendResource { version, .. } =
        manager.install_latest().await.map_err(|error| {
            tracing::error!(
                target: "openagent::component_update",
                component = "frontend",
                stage = "check_failed",
                %error,
                "frontend component preparation failed"
            );
            error
        })?;
    let current_version = manager.current_version();
    let update_available = manager.is_newer_than_active(&version)?;
    tracing::info!(
        target: "openagent::component_update",
        component = "frontend",
        stage = if update_available { "check_available" } else { "check_current" },
        current_version,
        candidate_version = version,
        update_available,
        "frontend component check finished"
    );
    Ok(PreparedFrontendResource {
        version,
        current_version,
        update_available,
    })
}

/// How long a reloaded frontend has to confirm its own activation.
const FRONTEND_CONFIRMATION_DEADLINE: std::time::Duration = std::time::Duration::from_secs(15);

/// Roll an unconfirmed frontend activation back, re-navigate this process's
/// windows, and release this process's Runtime barrier if it still holds one.
///
/// Armed by an in-process activation and by startup for a selection the
/// previous process left pending. `rollback_pending` matches the candidate
/// version, so a deadline that outlives its activation cannot discard a newer
/// selection, and a fresh process that never acquired the barrier releases
/// nothing.
pub(crate) fn arm_frontend_confirmation_deadline(
    app: tauri::AppHandle,
    manager: FrontendResourceManager,
    candidate_version: String,
    stage: &'static str,
) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FRONTEND_CONFIRMATION_DEADLINE).await;
        match manager.rollback_pending(&candidate_version).await {
            Ok(true) => {
                tracing::warn!(
                    target: "openagent::component_update",
                    component = "frontend",
                    stage,
                    candidate_version = candidate_version.as_str(),
                    "frontend activation was not confirmed within the deadline; rolled back"
                );
                let version = manager.active_version();
                if let Err(error) = navigate_frontend_windows(&app, version.as_deref()) {
                    tracing::error!(%error, "failed to display frontend rollback");
                }
                let updates = app.state::<RuntimeUpdateState>();
                let supervisor = app.state::<Arc<RuntimeProcessSupervisor>>();
                if let Err(error) =
                    release_component_update(updates.inner(), supervisor.inner()).await
                {
                    tracing::error!(
                        %error,
                        "failed to release frontend update barrier after rollback"
                    );
                }
            }
            Ok(false) => {}
            Err(error) => tracing::error!(%error, "failed to roll back unconfirmed frontend"),
        }
    });
}

#[tauri::command]
pub(crate) async fn activate_frontend_resource(
    app: tauri::AppHandle,
    manager: State<'_, FrontendResourceManager>,
    updates: State<'_, RuntimeUpdateState>,
    version: String,
    navigate: Option<bool>,
) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Err("production frontend resources are disabled in development builds".to_string());
    }
    let _lifecycle = updates.lifecycle.lock().await;
    if !*updates.component_update_active.lock().await {
        return Err("frontend activation requires an active component update barrier".to_string());
    }
    let diagnostic_version = component_update_version(Some(version.clone()))?
        .expect("a supplied component version remains present after validation");
    tracing::info!(
        target: "openagent::component_update",
        component = "frontend",
        stage = "activation_started",
        candidate_version = diagnostic_version,
        "frontend component activation started"
    );
    manager.activate(&version).await.map_err(|error| {
        tracing::error!(
            target: "openagent::component_update",
            component = "frontend",
            stage = "selection_commit_failed",
            candidate_version = diagnostic_version,
            %error,
            "frontend selection commit failed"
        );
        error
    })?;
    if !navigate.unwrap_or(true) {
        tracing::info!(
            target: "openagent::component_update",
            component = "frontend",
            stage = "activation_deferred",
            candidate_version = diagnostic_version,
            "deferred frontend navigation until the replacement desktop process starts"
        );
        return Ok(());
    }
    if let Err(error) = navigate_frontend_windows(&app, Some(&version)) {
        tracing::error!(
            target: "openagent::component_update",
            component = "frontend",
            stage = "navigation_failed",
            candidate_version = diagnostic_version,
            %error,
            "frontend WebView navigation failed; rolling back the pending selection"
        );
        let rollback = manager.rollback_pending(&version).await;
        return Err(match rollback {
            Ok(_) => error,
            Err(rollback_error) => {
                format!("{error}; frontend selection rollback failed: {rollback_error}")
            }
        });
    }
    arm_frontend_confirmation_deadline(
        app,
        manager.inner().clone(),
        version,
        "confirmation_timed_out",
    );
    Ok(())
}

#[tauri::command]
pub(crate) async fn confirm_frontend_activation(
    manager: State<'_, FrontendResourceManager>,
    updates: State<'_, RuntimeUpdateState>,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
    window_state: State<'_, DesktopWindowState>,
    version: String,
) -> Result<bool, String> {
    let diagnostic_version = component_update_version(Some(version.clone()))?
        .expect("a supplied component version remains present after validation");
    tracing::info!(
        target: "openagent::component_update",
        component = "frontend",
        stage = "confirmation_started",
        candidate_version = diagnostic_version,
        "frontend activation confirmation received"
    );
    if window_state.rejects_frontend_confirmation() {
        tracing::debug!(
            target: "openagent::component_update",
            component = "frontend",
            candidate_version = diagnostic_version,
            "ignored frontend activation confirmation after desktop teardown began"
        );
        return Ok(false);
    }
    let first_confirmation = manager.confirm(&version).await.map_err(|error| {
        tracing::error!(
            target: "openagent::component_update",
            component = "frontend",
            stage = "confirmation_failed",
            candidate_version = diagnostic_version,
            %error,
            "frontend activation confirmation failed"
        );
        error
    })?;
    release_component_update(updates.inner(), supervisor.inner()).await?;
    tracing::info!(
        target: "openagent::component_update",
        component = "frontend",
        stage = "confirmation_finished",
        active_version = diagnostic_version,
        "frontend activation confirmed"
    );
    Ok(first_confirmation)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn external_frontend_urls_use_the_webview2_mapped_origin_on_windows() {
        let main = external_frontend_url_for_platform("", "0.62.0-beta.1", true).unwrap();
        assert_eq!(
            main.as_str(),
            "http://openagent-ui.localhost/?frontend-version=0.62.0-beta.1"
        );

        let settings =
            external_frontend_url_for_platform("?settings-window=general", "0.62.0-beta.1", true)
                .unwrap();
        assert_eq!(
            settings.as_str(),
            "http://openagent-ui.localhost/?settings-window=general&frontend-version=0.62.0-beta.1"
        );
    }

    #[test]
    fn external_frontend_urls_keep_the_custom_scheme_off_windows() {
        let url = external_frontend_url_for_platform("", "0.62.0-beta.1", false).unwrap();
        assert_eq!(
            url.as_str(),
            "openagent-ui://localhost/?frontend-version=0.62.0-beta.1"
        );
    }
}

#[cfg(test)]
mod utility_route_tests {
    use super::*;
    #[test]
    fn utility_windows_restore_their_surface_routes() {
        assert_eq!(
            frontend_window_query("settings-general"),
            "?settings-window=general"
        );
        assert_eq!(
            frontend_window_query("role-editor"),
            "?role-editor-window=1"
        );
    }
}
