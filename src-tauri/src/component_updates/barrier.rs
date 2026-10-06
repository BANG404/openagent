use super::{ComponentUpdateGate, RuntimeUpdateState};
use crate::runtime_process::RuntimeProcessSupervisor;
use crate::runtime_transport::{self, RuntimeProxyRequest};
use std::sync::Arc;
use tauri::State;

#[derive(serde::Deserialize)]
pub(super) struct RuntimeDrainResponse {
    pub(super) drained: bool,
    pub(super) active_conversations: Vec<String>,
}

pub(super) async fn drain_supervised_runtime(
    supervisor: &RuntimeProcessSupervisor,
    cancel: bool,
) -> Result<RuntimeDrainResponse, String> {
    let response = runtime_transport::proxy_runtime_request(
        supervisor,
        RuntimeProxyRequest {
            method: "POST".to_string(),
            path: "/api/desktop/drain".to_string(),
            body: Some(format!("{{\"cancel\":{cancel}}}")),
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

async fn resume_supervised_runtime(supervisor: &RuntimeProcessSupervisor) -> Result<(), String> {
    let response = runtime_transport::proxy_runtime_request(
        supervisor,
        RuntimeProxyRequest {
            method: "POST".to_string(),
            path: "/api/desktop/resume".to_string(),
            body: Some("{}".to_string()),
        },
    )
    .await?;
    if response.status != 204 {
        return Err(format!(
            "Runtime resume was rejected with status {}",
            response.status
        ));
    }
    Ok(())
}

/// Drain the Runtime and take its write barrier, or report why it is not ready.
///
/// Shared by ordinary component activation and by the shell install
/// preparation: a frontend confirmation releases the barrier, so the shell
/// step has to acquire it again rather than inherit it.
pub(crate) async fn acquire_component_update_barrier(
    updates: &RuntimeUpdateState,
    supervisor: &RuntimeProcessSupervisor,
) -> Result<ComponentUpdateGate, String> {
    let _lifecycle = updates.lifecycle.lock().await;
    let mut active = updates.component_update_active.lock().await;
    if *active {
        return Ok(ComponentUpdateGate {
            ready: true,
            active_count: 0,
        });
    }
    let drain = drain_supervised_runtime(supervisor, false).await?;
    tracing::info!(
        target: "openagent::component_update",
        component = "runtime",
        stage = "barrier_finished",
        ready = drain.drained,
        active_count = drain.active_conversations.len(),
        "component update barrier request finished"
    );
    if drain.drained {
        *active = true;
    }
    Ok(ComponentUpdateGate {
        ready: drain.drained,
        active_count: drain.active_conversations.len(),
    })
}

#[tauri::command]
pub(crate) async fn begin_component_update(
    updates: State<'_, RuntimeUpdateState>,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
) -> Result<ComponentUpdateGate, String> {
    acquire_component_update_barrier(updates.inner(), supervisor.inner()).await
}

#[tauri::command]
pub(crate) async fn end_component_update(
    updates: State<'_, RuntimeUpdateState>,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
) -> Result<(), String> {
    release_component_update(updates.inner(), supervisor.inner()).await
}

pub(crate) async fn release_component_update(
    updates: &RuntimeUpdateState,
    supervisor: &RuntimeProcessSupervisor,
) -> Result<(), String> {
    let _lifecycle = updates.lifecycle.lock().await;
    let mut active = updates.component_update_active.lock().await;
    if !*active {
        return Ok(());
    }
    // Shell installation tears the Runtime down before old WebViews finish
    // their activation callbacks. Treat that late callback as completion of
    // the in-memory barrier instead of sending /resume to a dead child.
    if supervisor.status().await.is_none() {
        *active = false;
        return Ok(());
    }
    resume_supervised_runtime(supervisor).await?;
    *active = false;
    Ok(())
}
