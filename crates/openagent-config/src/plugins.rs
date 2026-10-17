//! Product identifiers and package-name syntax; execution stays in Runtime.
pub const CHAT_GROUPS_ID: &str = "chat-groups";
pub const MULTI_AGENT_V2_ID: &str = "multi-agent-v2";

pub fn is_plugin_name(value: &str) -> bool {
    let bytes = value.as_bytes();
    (1..=64).contains(&bytes.len())
        && bytes.iter().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'.')
        })
        && bytes.first().is_some_and(u8::is_ascii_alphanumeric)
        && bytes.last().is_some_and(u8::is_ascii_alphanumeric)
        && !value.contains("--")
        && !value.contains("..")
}
