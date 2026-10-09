//! Private developer journals for frontend consumer observations, never Runtime recovery.
use std::{collections::HashMap, path::PathBuf};

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{State, Window};
use tokio::{io::AsyncWriteExt, sync::Mutex};

use crate::DesktopDataDir;

const MAX_SESSION_BYTES: usize = 128 * 1024 * 1024;
const MAX_RECORD_BYTES: usize = 16 * 1024 * 1024;
const MAX_SESSIONS: usize = 16;

struct Journal {
    owner: String,
    path: PathBuf,
    file: tokio::fs::File,
    manifest: Value,
    seq: usize,
    bytes: usize,
    hash: Sha256,
}

#[derive(Default)]
pub(crate) struct ReplayCaptureState(Mutex<HashMap<String, Journal>>);

fn failure() -> String {
    "replay-capture-storage-failed".to_string()
}

async fn private_directory(path: &std::path::Path) -> Result<(), String> {
    match tokio::fs::symlink_metadata(path).await {
        Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => Ok(()),
        Ok(_) => Err(failure()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            tokio::fs::create_dir(path).await.map_err(|_| failure())?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                tokio::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
                    .await
                    .map_err(|_| failure())?;
            }
            Ok(())
        }
        Err(_) => Err(failure()),
    }
}

async fn create_private_file(path: &std::path::Path) -> Result<tokio::fs::File, String> {
    let mut options = tokio::fs::OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    options.mode(0o600);
    options.open(path).await.map_err(|_| failure())
}

fn bounded_json(input: &str) -> Result<Value, String> {
    if input.len() > MAX_RECORD_BYTES {
        return Err("replay-capture-byte-limit".to_string());
    }
    let value: Value =
        serde_json::from_str(input).map_err(|_| "replay-capture-invalid-json".to_string())?;
    inspect_json(&value, 0)?;
    Ok(value)
}

fn inspect_json(value: &Value, depth: usize) -> Result<(), String> {
    if depth > 40 {
        return Err("replay-capture-depth-limit".to_string());
    }
    match value {
        Value::Object(fields) => {
            for (key, value) in fields {
                let normalized = key.to_ascii_lowercase().replace('-', "_");
                if [
                    "authorization",
                    "cookie",
                    "set_cookie",
                    "password",
                    "api_key",
                    "apikey",
                    "access_token",
                    "refresh_token",
                    "client_secret",
                    "__proto__",
                    "constructor",
                    "prototype",
                ]
                .contains(&normalized.as_str())
                {
                    return Err("replay-capture-credential-field".to_string());
                }
                inspect_json(value, depth + 1)?;
            }
        }
        Value::Array(values) => {
            if values.len() > 10000 {
                return Err("replay-capture-entry-limit".to_string());
            }
            for value in values {
                inspect_json(value, depth + 1)?;
            }
        }
        _ => {}
    }
    Ok(())
}

/// Starting a session is explicit, debug-only, and bound to the requesting window.
#[tauri::command]
pub(crate) async fn begin_frontend_capture(
    window: Window,
    data_dir: State<'_, DesktopDataDir>,
    state: State<'_, ReplayCaptureState>,
    anchor_json: String,
    include_private_content: bool,
) -> Result<String, String> {
    if !cfg!(debug_assertions) || !include_private_content {
        return Err("replay-capture-opt-in-required".to_string());
    }
    let anchor = bounded_json(&anchor_json)?;
    if anchor["idle"] != true || anchor["scope"] != "consumer-observed" {
        return Err("replay-capture-idle-anchor-required".to_string());
    }
    let diagnostics = data_dir.0.join("diagnostics");
    private_directory(&diagnostics).await?;
    let root = diagnostics.join("replay");
    private_directory(&root).await?;
    let mut sessions = state.0.lock().await;
    let mut entries = tokio::fs::read_dir(&root).await.map_err(|_| failure())?;
    let mut count = 0;
    while entries.next_entry().await.map_err(|_| failure())?.is_some() {
        count += 1;
    }
    if count >= MAX_SESSIONS {
        return Err("replay-capture-retention-limit".to_string());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let path = root.join(&id);
    private_directory(&path).await?;
    let manifest = json!({
        "capture_version": 1, "target": "frontend", "target_version": 1, "session_id": id,
        "anchor": anchor, "finalized": false, "completeness": "incomplete", "reasons": ["unfinalized"],
        "source": {"shell_version": env!("CARGO_PKG_VERSION"), "protocol_version": crate::runtime_process::DESKTOP_RUNTIME_PROTOCOL_VERSION},
        "records": 0, "committed_seq": 0, "journal_bytes": 0, "journal_sha256": "",
    });
    let mut manifest_file = create_private_file(&path.join("manifest.json")).await?;
    manifest_file
        .write_all(manifest.to_string().as_bytes())
        .await
        .map_err(|_| failure())?;
    manifest_file.sync_all().await.map_err(|_| failure())?;
    let file = create_private_file(&path.join("records.jsonl")).await?;
    sessions.insert(
        id.clone(),
        Journal {
            owner: window.label().to_string(),
            path,
            file,
            manifest,
            seq: 0,
            bytes: 0,
            hash: Sha256::new(),
        },
    );
    Ok(id)
}

#[tauri::command]
pub(crate) async fn append_frontend_capture(
    window: Window,
    state: State<'_, ReplayCaptureState>,
    session_id: String,
    record_json: String,
) -> Result<(), String> {
    let record = bounded_json(&record_json)?;
    let mut sessions = state.0.lock().await;
    let journal = sessions.get_mut(&session_id).ok_or_else(failure)?;
    if journal.owner != window.label() || record["seq"].as_u64() != Some((journal.seq + 1) as u64) {
        return Err("replay-capture-sequence-or-owner".to_string());
    }
    let line = format!("{record_json}\n");
    if journal.bytes + line.len() > MAX_SESSION_BYTES || journal.seq >= 10000 {
        return Err("replay-capture-session-limit".to_string());
    }
    journal
        .file
        .write_all(line.as_bytes())
        .await
        .map_err(|_| failure())?;
    journal.file.sync_data().await.map_err(|_| failure())?;
    journal.hash.update(line.as_bytes());
    journal.bytes += line.len();
    journal.seq += 1;
    Ok(())
}

#[tauri::command]
pub(crate) async fn finish_frontend_capture(
    window: Window,
    state: State<'_, ReplayCaptureState>,
    session_id: String,
    result_json: String,
) -> Result<Value, String> {
    let result = bounded_json(&result_json)?;
    let mut sessions = state.0.lock().await;
    if sessions
        .get(&session_id)
        .is_none_or(|journal| journal.owner != window.label())
    {
        return Err(failure());
    }
    let mut journal = sessions.remove(&session_id).ok_or_else(failure)?;
    journal.file.sync_all().await.map_err(|_| failure())?;
    let reasons = result["reasons"].as_array().ok_or_else(failure)?;
    let complete = reasons.is_empty()
        && result["records"].as_u64() == Some(journal.seq as u64)
        && result["committed_seq"].as_u64() == Some(journal.seq as u64);
    journal.manifest["finalized"] = json!(true);
    journal.manifest["completeness"] = json!(if complete { "complete" } else { "incomplete" });
    journal.manifest["reasons"] = if complete || !reasons.is_empty() {
        json!(reasons)
    } else {
        json!(["writer-watermark-mismatch"])
    };
    journal.manifest["records"] = result["records"].clone();
    journal.manifest["committed_seq"] = json!(journal.seq);
    journal.manifest["journal_bytes"] = json!(journal.bytes);
    journal.manifest["journal_sha256"] = json!(format!("{:x}", journal.hash.finalize()));
    let temporary = journal.path.join("manifest.final.json");
    let mut file = create_private_file(&temporary).await?;
    file.write_all(journal.manifest.to_string().as_bytes())
        .await
        .map_err(|_| failure())?;
    file.sync_all().await.map_err(|_| failure())?;
    drop(file);
    // Final manifest is a new, atomic publication; the original unfinalized file remains evidence.
    tokio::fs::rename(temporary, journal.path.join("finalized.json"))
        .await
        .map_err(|_| failure())?;
    Ok(
        json!({"session_id": session_id, "completeness": journal.manifest["completeness"], "committed_seq": journal.seq}),
    )
}
