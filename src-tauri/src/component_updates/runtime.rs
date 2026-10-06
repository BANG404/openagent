use super::barrier::drain_supervised_runtime;
use super::{ActivatedRuntimeResource, PreparedRuntimeResource, RuntimeUpdateState};
use crate::runtime_process::{
    inspect_runtime_bootstrap, RuntimeLaunchSpec, RuntimeProcessSupervisor,
};
use crate::runtime_resource::RuntimeResourceManager;
use crate::runtime_transport::{self, RuntimeEventProxy, RuntimeProxyRequest};
use std::sync::Arc;
use tauri::{Emitter, State};

fn runtime_update_available(candidate: &str, baseline: &str) -> Result<bool, String> {
    let candidate = semver::Version::parse(candidate)
        .map_err(|error| format!("Runtime candidate version is invalid: {error}"))?;
    let baseline = semver::Version::parse(baseline)
        .map_err(|error| format!("Runtime baseline version is invalid: {error}"))?;
    Ok(candidate > baseline)
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
        "new_conversation_suggestions",
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
        || !object["new_conversation_suggestions"].is_array()
    {
        return Err("Runtime bootstrap field types were invalid".to_string());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn prepare_runtime_resource(
    app: tauri::AppHandle,
    manager: State<'_, RuntimeResourceManager>,
    updates: State<'_, RuntimeUpdateState>,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
) -> Result<PreparedRuntimeResource, String> {
    tracing::info!(
        target: "openagent::component_update",
        component = "runtime",
        stage = "check_started",
        "checking signed Runtime component channel"
    );
    let progress_app = app.clone();
    let candidate = manager
        .install_latest(move |progress| {
            if let Err(error) = progress_app.emit("runtime-resource-progress", progress) {
                tracing::warn!(%error, "failed to emit Runtime resource progress");
            }
        })
        .await
        .map_err(|error| {
            tracing::error!(
                target: "openagent::component_update",
                component = "runtime",
                stage = "check_failed",
                %error,
                "Runtime component preparation failed"
            );
            error
        })?;
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
    let current_version = baseline.map(str::to_string);
    tracing::info!(
        target: "openagent::component_update",
        component = "runtime",
        stage = if update_available { "check_available" } else { "check_current" },
        current_version = current_version.as_deref().unwrap_or("unknown"),
        candidate_version = candidate.version,
        target = candidate.target,
        update_available,
        "Runtime component check finished"
    );
    *updates.pending.lock().await = update_available.then(|| candidate.clone());
    Ok(PreparedRuntimeResource {
        version: candidate.version,
        current_version,
        target: candidate.target,
        update_available,
    })
}

pub(crate) async fn validate_supervised_runtime_bootstrap(
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
    let drain = drain_supervised_runtime(&supervisor, false).await?;
    if !drain.drained {
        return Err("restored Runtime could not enter the component update barrier".to_string());
    }
    reconnect_supervised_runtime(app, supervisor, proxy).await
}

#[tauri::command]
#[allow(clippy::too_many_lines)]
pub(crate) async fn activate_runtime_resource(
    // NOSONAR: this protocol or state boundary is intentionally kept together for auditability.
    app: tauri::AppHandle,
    manager: State<'_, RuntimeResourceManager>,
    updates: State<'_, RuntimeUpdateState>,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
    proxy: State<'_, RuntimeEventProxy>,
    version: String,
    target: String,
) -> Result<ActivatedRuntimeResource, String> {
    let _lifecycle = updates.lifecycle.lock().await;
    if !*updates.component_update_active.lock().await {
        return Err("Runtime activation requires an active component update barrier".to_string());
    }
    let candidate = updates
        .pending
        .lock()
        .await
        .as_ref()
        .filter(|candidate| candidate.version == version && candidate.target == target)
        .cloned()
        .ok_or_else(|| "Runtime candidate is not the pending verified resource".to_string())?;
    tracing::info!(
        target: "openagent::component_update",
        component = "runtime",
        stage = "activation_started",
        candidate_version = candidate.version,
        target = candidate.target,
        "Runtime component activation started"
    );
    let previous_spec = supervisor
        .launch_spec()
        .await
        .ok_or_else(|| "Runtime activation requires external Runtime mode".to_string())?;

    let candidate_spec = RuntimeLaunchSpec {
        binary_path: candidate.binary_path.clone(),
        workspace: previous_spec.workspace.clone(),
        openagent_home: previous_spec.openagent_home.clone(),
        embedding_seed: previous_spec.embedding_seed.clone(),
        conversation_id: previous_spec.conversation_id.clone(),
        message_id: previous_spec.message_id.clone(),
        new_conversation: previous_spec.new_conversation,
        primary_desktop_services: previous_spec.primary_desktop_services,
    };
    let bootstrap =
        inspect_runtime_bootstrap(&candidate_spec.binary_path, &candidate_spec.openagent_home)
            .await
            .map_err(|error| {
                tracing::error!(
                    target: "openagent::component_update",
                    component = "runtime",
                    stage = "candidate_bootstrap_inspection_failed",
                    candidate_version = candidate.version,
                    %error,
                    "Runtime candidate failed its pre-activation bootstrap inspection"
                );
                error
            })?;
    if bootstrap.requires_persistence_transition() {
        let scope = bootstrap.transition_scope().unwrap_or("persisted data");
        tracing::warn!(
            target: "openagent::component_update",
            component = "runtime",
            stage = "candidate_bootstrap_transition_required",
            candidate_version = candidate.version,
            transition_scope = scope,
            "Runtime candidate requires an explicit persistence transition; activation was not started"
        );
        return Err(format!(
            "Runtime candidate requires an explicit persistence transition for {scope}; activation was not started"
        ));
    }

    proxy.stop().await;
    if let Err(candidate_error) = supervisor.reload_after_drain(candidate_spec).await {
        tracing::error!(
            target: "openagent::component_update",
            component = "runtime",
            stage = "candidate_start_failed",
            candidate_version = candidate.version,
            %candidate_error,
            "Runtime candidate failed to start; restoring the previous process"
        );
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

    let candidate_barrier_error = match drain_supervised_runtime(supervisor.inner(), false).await {
        Ok(drain) if drain.drained => None,
        Ok(_) => Some("new Runtime could not enter the component update barrier".to_string()),
        Err(error) => Some(error),
    };
    if let Some(candidate_barrier_error) = candidate_barrier_error {
        tracing::error!(
            target: "openagent::component_update",
            component = "runtime",
            stage = "candidate_barrier_failed",
            candidate_version = candidate.version,
            error = %candidate_barrier_error,
            "Runtime candidate failed its update barrier; rolling back"
        );
        let rollback = restore_previous_runtime(
            &app,
            supervisor.inner().clone(),
            &proxy,
            previous_spec.clone(),
        )
        .await;
        let _ = app.emit(
            "runtime-resource-rolled-back",
            serde_json::json!({ "reason": "update_barrier_failed" }),
        );
        return Err(match rollback {
            Ok(_) => candidate_barrier_error,
            Err(rollback_error) => {
                format!("{candidate_barrier_error}; Runtime rollback failed: {rollback_error}")
            }
        });
    }

    if let Err(validation_error) = validate_supervised_runtime_bootstrap(supervisor.inner()).await {
        tracing::error!(
            target: "openagent::component_update",
            component = "runtime",
            stage = "candidate_bootstrap_failed",
            candidate_version = candidate.version,
            %validation_error,
            "Runtime candidate failed bootstrap validation; rolling back"
        );
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
            tracing::error!(
                target: "openagent::component_update",
                component = "runtime",
                stage = "candidate_reconnect_failed",
                candidate_version = candidate.version,
                %reconnect_error,
                "Runtime candidate event reconnect failed; rolling back"
            );
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
        tracing::error!(
            target: "openagent::component_update",
            component = "runtime",
            stage = "selection_commit_failed",
            candidate_version = candidate.version,
            %activation_error,
            "Runtime candidate selection commit failed; rolling back"
        );
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
    tracing::info!(
        target: "openagent::component_update",
        component = "runtime",
        stage = "activation_finished",
        active_version = candidate.version,
        target = candidate.target,
        generation,
        "Runtime component activation finished"
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
            "new_conversation_suggestions": [],
        });
        assert!(validate_runtime_bootstrap(&valid).is_ok());

        let mut invalid = valid;
        invalid.as_object_mut().unwrap().remove("conversations");
        assert!(validate_runtime_bootstrap(&invalid).is_err());
    }
}
