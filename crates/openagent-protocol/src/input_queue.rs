//! Durable user-input control shared by desktop and paired clients.
use crate::AgentInputRequest;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InputDelivery {
    NextTurn,
    Steer,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QueuedInputStatus {
    Queued,
    Starting,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedInput {
    pub id: String,
    pub input: AgentInputRequest,
    pub delivery: InputDelivery,
    pub status: QueuedInputStatus,
    pub run_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputQueueSnapshot {
    pub conv_id: String,
    pub revision: u64,
    pub paused: bool,
    pub active_run_id: Option<String>,
    pub items: Vec<QueuedInput>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum InputQueueAction {
    Add {
        input: AgentInputRequest,
        delivery: InputDelivery,
        expected_run_id: Option<String>,
    },
    Update {
        id: String,
        input: AgentInputRequest,
        expected_revision: u64,
    },
    Delete {
        id: String,
    },
    Clear,
    Reorder {
        ids: Vec<String>,
        expected_revision: u64,
    },
    SetPaused {
        paused: bool,
    },
    Retry {
        id: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputQueueRequest {
    pub conv_id: String,
    pub action: InputQueueAction,
}
