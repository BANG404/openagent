//! Product resource identities and their transport-neutral status contract.
use serde::{Deserialize, Serialize};

pub const EMBEDDING_MODEL_ID: &str = "all-MiniLM-L6-v2-q";
pub const EMBEDDING_MODEL_VERSION: &str = "1";
pub const EMBEDDING_DIMENSIONS: usize = 384;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[cfg_attr(feature = "typescript", derive(ts_rs::TS))]
#[serde(rename_all = "snake_case")]
pub enum EmbeddingResourceState {
    Ready,
    Missing,
    Corrupt,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[cfg_attr(feature = "typescript", derive(ts_rs::TS))]
pub struct EmbeddingResourceStatus {
    pub state: EmbeddingResourceState,
    pub model_id: String,
    pub version: String,
    pub total_bytes: u64,
}

impl EmbeddingResourceStatus {
    pub fn ready(&self) -> bool {
        self.state == EmbeddingResourceState::Ready
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[cfg_attr(feature = "typescript", derive(ts_rs::TS))]
pub struct EmbeddingResourceProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub current_file: String,
}
