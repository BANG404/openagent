//! Transport-neutral event envelopes. Domain projections remain generic so the
//! protocol never imports Runtime storage or execution implementations.
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "typescript", derive(ts_rs::TS))]
pub struct ChatRunStartedEvent {
    pub conv_id: String,
    pub message: String,
    pub msg_id: String,
    pub asst_msg_id: String,
    pub workspace: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub pinned: bool,
    #[serde(default)]
    #[cfg_attr(feature = "typescript", ts(optional = nullable))]
    pub parent_conv_id: Option<String>,
    #[serde(default)]
    #[cfg_attr(feature = "typescript", ts(optional = nullable))]
    pub compacted_from_conv_id: Option<String>,
    #[serde(default)]
    #[cfg_attr(feature = "typescript", ts(optional = nullable))]
    pub flow_kind: Option<String>,
    #[serde(default)]
    #[cfg_attr(feature = "typescript", ts(optional = nullable))]
    pub flow_status: Option<String>,
    #[serde(default)]
    #[cfg_attr(feature = "typescript", ts(optional = nullable))]
    pub role_id: Option<String>,
    pub source: String,
    pub is_new: bool,
    pub user_visible: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "typescript", derive(ts_rs::TS))]
pub struct ChatModelUsageEvent<Usage> {
    pub conv_id: String,
    pub turn: u64,
    pub usage: Usage,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "typescript", derive(ts_rs::TS))]
#[serde(rename_all = "snake_case")]
pub enum ChatMemoryRetrievalStage {
    QueryRewrite,
    Embedding,
    Searching,
    Completed,
    Skipped,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "typescript", derive(ts_rs::TS))]
#[serde(rename_all = "snake_case")]
pub enum ContextCompactionStage {
    Checking,
    Summarizing,
    Creating,
    Done,
    Skipped,
    Failed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "typescript", derive(ts_rs::TS))]
#[serde(tag = "name", content = "payload")]
pub enum OpenAgentWireEvent<Message, Usage, Change, Invocation, Image, Install, State> {
    #[serde(rename = "chat.input_consumed")]
    InputConsumed {
        conv_id: String,
        run_id: String,
        message: Message,
    },
    #[serde(rename = "chat.input_queue_changed")]
    InputQueueChanged { conv_id: String },
    #[serde(rename = "plugin.install_progress")]
    PluginInstallProgress(Install),
    #[serde(rename = "conversation.state")]
    ConversationState(State),
    #[serde(rename = "chat.run_started")]
    RunStarted(Box<ChatRunStartedEvent>),
    #[serde(rename = "chat.response_started")]
    ResponseStarted { conv_id: String },
    #[serde(rename = "chat.model_usage")]
    ModelUsage(ChatModelUsageEvent<Usage>),
    #[serde(rename = "chat.memory_retrieval")]
    MemoryRetrieval {
        conv_id: String,
        stage: ChatMemoryRetrievalStage,
    },
    #[serde(rename = "chat.chunk")]
    Chunk { conv_id: String, text: String },
    #[serde(rename = "chat.thinking_chunk")]
    ThinkingChunk { conv_id: String, text: String },
    #[serde(rename = "chat.tool_call")]
    ToolCall {
        conv_id: String,
        name: String,
        #[cfg_attr(feature = "typescript", ts(type = "unknown"))]
        args: Value,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        tool_use_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        mcp_ui: Option<Invocation>,
    },
    #[serde(rename = "chat.tool_result")]
    ToolResult {
        conv_id: String,
        result: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        tool_use_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        mcp_ui: Option<Invocation>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        image_attachments: Option<Vec<Image>>,
    },
    #[serde(rename = "chat.file_change")]
    FileChange {
        conv_id: String,
        change: Change,
        #[serde(default)]
        #[cfg_attr(feature = "typescript", ts(optional = nullable))]
        branch_id: Option<String>,
    },
    #[serde(rename = "chat.checkpoint")]
    Checkpoint {
        conv_id: String,
        checkpoint_id: String,
        #[serde(default)]
        #[cfg_attr(feature = "typescript", ts(optional = nullable))]
        branch_id: Option<String>,
    },
    #[serde(rename = "chat.retry")]
    Retry {
        conv_id: String,
        attempt: u32,
        max_attempts: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model: Option<String>,
        #[serde(default)]
        #[cfg_attr(feature = "typescript", ts(optional = nullable))]
        error: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        restored_checkpoint: Option<bool>,
    },
    #[serde(rename = "chat.compaction_progress")]
    CompactionProgress {
        conv_id: String,
        stage: ContextCompactionStage,
        #[serde(default)]
        #[cfg_attr(feature = "typescript", ts(optional = nullable))]
        error: Option<String>,
    },
    #[serde(rename = "chat.done")]
    Done {
        conv_id: String,
        #[serde(default)]
        #[cfg_attr(feature = "typescript", ts(optional = nullable))]
        asst_msg_id: Option<String>,
        #[serde(default)]
        #[cfg_attr(feature = "typescript", ts(optional = nullable))]
        turn_id: Option<String>,
        #[serde(default)]
        #[cfg_attr(feature = "typescript", ts(optional = nullable))]
        error: Option<String>,
    },
    #[serde(rename = "chat.follow_up_suggestions")]
    FollowUpSuggestions {
        conv_id: String,
        asst_msg_id: String,
        suggestions: Vec<String>,
    },
    #[serde(rename = "conversation.new_suggestions")]
    NewConversationSuggestions {
        workspace: String,
        language: SuggestionLanguage,
        suggestions: Vec<String>,
    },
    #[serde(rename = "chat.interrupted")]
    Interrupted {
        conv_id: String,
        request_id: String,
        #[serde(default)]
        #[cfg_attr(feature = "typescript", ts(optional = nullable))]
        asst_msg_id: Option<String>,
        #[serde(default)]
        #[cfg_attr(feature = "typescript", ts(optional = nullable))]
        turn_id: Option<String>,
    },
    #[serde(rename = "chat.cancelled")]
    Cancelled {
        conv_id: String,
        #[serde(default)]
        #[cfg_attr(feature = "typescript", ts(optional = nullable))]
        asst_msg_id: Option<String>,
        #[serde(default)]
        #[cfg_attr(feature = "typescript", ts(optional = nullable))]
        turn_id: Option<String>,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "typescript", derive(ts_rs::TS))]
#[serde(rename_all = "lowercase")]
pub enum SuggestionLanguage {
    Zh,
    En,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    type Event = OpenAgentWireEvent<Value, Value, Value, Value, Value, Value, Value>;

    #[test]
    fn event_envelopes_require_their_declared_fields_and_stages() {
        let chunk = json!({"name":"chat.chunk","payload":{"conv_id":"one","text":"hello"}});
        let decoded: Event = serde_json::from_value(chunk.clone()).unwrap();
        assert_eq!(serde_json::to_value(decoded).unwrap(), chunk);
        for invalid in [
            json!({"name":"chat.chunk","payload":{"text":"missing conversation"}}),
            json!({"name":"chat.chunk","payload":{"conv_id":"one","text":null}}),
            json!({"name":"chat.compaction_progress","payload":{"conv_id":"one","stage":"invented"}}),
        ] {
            assert!(serde_json::from_value::<Event>(invalid).is_err());
        }
    }

    #[test]
    fn optional_terminal_identity_preserves_null_and_omission() {
        for payload in [
            json!({"conv_id":"one"}),
            json!({"conv_id":"one","asst_msg_id":null,"turn_id":null,"error":null}),
        ] {
            let decoded: Event =
                serde_json::from_value(json!({"name":"chat.done","payload":payload})).unwrap();
            let serialized = serde_json::to_value(decoded).unwrap();
            assert_eq!(serialized["payload"]["asst_msg_id"], Value::Null);
            assert_eq!(serialized["payload"]["turn_id"], Value::Null);
        }
    }
}
