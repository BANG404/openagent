use std::io::Write;
use std::process::{Child, Stdio};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

const PARENT_CONTROLLED_WORKSPACE_WINDOW_ARG: &str =
    "--openagent-parent-controlled-workspace-window";
static CHILD_WORKSPACE_WINDOWS: LazyLock<Mutex<Vec<Child>>> =
    LazyLock::new(|| Mutex::new(Vec::new()));

pub fn is_workspace_window_process() -> bool {
    std::env::args_os().any(|argument| argument == "--openagent-workspace-window")
}

pub fn is_parent_controlled_workspace_window_process() -> bool {
    std::env::args_os().any(|argument| argument == PARENT_CONTROLLED_WORKSPACE_WINDOW_ARG)
}

pub fn open_workspace_window(
    path: String,
    conversation_id: Option<String>,
    message_id: Option<String>,
    new_conversation: bool,
) -> Result<(), String> {
    spawn_workspace_window(
        path,
        conversation_id.filter(|value| !value.is_empty()),
        message_id.filter(|value| !value.is_empty()),
        new_conversation,
        false,
    )
}

pub fn create_workspace_window(path: String) -> Result<(), String> {
    spawn_workspace_window(path, None, None, false, true)
}

fn spawn_workspace_window(
    path: String,
    conversation_id: Option<String>,
    message_id: Option<String>,
    new_conversation: bool,
    detached: bool,
) -> Result<(), String> {
    if !std::path::Path::new(&path).is_dir() {
        return Err("Workspace path is not a directory".to_string());
    }
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let mut command = std::process::Command::new(executable);
    command
        .arg("--openagent-workspace-window")
        .arg(PARENT_CONTROLLED_WORKSPACE_WINDOW_ARG)
        .arg("--openagent-workspace")
        .arg(path)
        .stdin(Stdio::piped());
    if detached {
        command.arg("--openagent-detached-workspace-window");
    }
    if let Some(conversation_id) = conversation_id {
        command.arg("--openagent-conversation").arg(conversation_id);
    }
    if let Some(message_id) = message_id {
        command.arg("--openagent-message").arg(message_id);
    }
    if new_conversation {
        command.arg("--openagent-new-conversation");
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let child = command.spawn().map_err(|error| error.to_string())?;
    CHILD_WORKSPACE_WINDOWS
        .lock()
        .map_err(|_| "Workspace child process lock was poisoned".to_string())?
        .push(child);
    Ok(())
}

pub fn request_child_workspace_window_shutdown() -> Result<(), String> {
    let mut children = CHILD_WORKSPACE_WINDOWS
        .lock()
        .map_err(|_| "Workspace child process lock was poisoned".to_string())?;
    let mut failures = Vec::new();
    for child in children.iter_mut() {
        match child.try_wait() {
            Ok(Some(_)) => continue,
            Ok(None) => {}
            Err(error) => {
                failures.push(format!("failed to inspect workspace process: {error}"));
                continue;
            }
        }
        if let Some(mut stdin) = child.stdin.take() {
            if let Err(error) = stdin.write_all(b"shutdown\n") {
                failures.push(format!("failed to signal workspace process: {error}"));
            }
        }
    }
    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join("; "))
    }
}

pub fn finish_child_workspace_window_shutdown(timeout: Duration) -> Result<(), String> {
    let mut children = {
        let mut registered = CHILD_WORKSPACE_WINDOWS
            .lock()
            .map_err(|_| "Workspace child process lock was poisoned".to_string())?;
        std::mem::take(&mut *registered)
    };
    let deadline = Instant::now() + timeout;
    while !children.is_empty() && Instant::now() < deadline {
        children.retain_mut(|child| !matches!(child.try_wait(), Ok(Some(_))));
        if !children.is_empty() {
            std::thread::sleep(Duration::from_millis(25));
        }
    }
    let mut failures = Vec::new();
    for mut child in children {
        if let Err(error) = child.kill() {
            failures.push(format!("failed to terminate workspace process: {error}"));
            continue;
        }
        if let Err(error) = child.wait() {
            failures.push(format!("failed to wait for workspace process: {error}"));
        }
    }
    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join("; "))
    }
}

#[cfg(test)]
mod tests {
    use super::{create_workspace_window, open_workspace_window};

    #[test]
    fn workspace_launch_rejects_missing_directories() {
        let missing = std::env::temp_dir().join(format!(
            "openagent-missing-workspace-{}",
            uuid::Uuid::new_v4()
        ));
        assert_eq!(
            create_workspace_window(missing.to_string_lossy().into_owned()),
            Err("Workspace path is not a directory".to_string())
        );
        assert_eq!(
            open_workspace_window(missing.to_string_lossy().into_owned(), None, None, false),
            Err("Workspace path is not a directory".to_string())
        );
    }
}
