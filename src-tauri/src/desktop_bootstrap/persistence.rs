use super::external::packaged_runtime_binary;
use super::{
    DesktopBootstrapResponse, DesktopBootstrapStatus, ExternalRuntimeLaunch,
    PersistenceTransitionPlan,
};

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

fn run_desktop_bootstrap_command(command: &str) -> anyhow::Result<DesktopBootstrapStatus> {
    let binary = packaged_runtime_binary().map_err(anyhow::Error::msg)?;
    let mut process = std::process::Command::new(&binary);
    process.arg("--desktop-bootstrap").arg(command);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        process.creation_flags(0x0800_0000);
    }
    let output = process.output().map_err(|error| {
        anyhow::anyhow!(
            "Failed to run Runtime bootstrap helper {}: {error}",
            binary.display()
        )
    })?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        anyhow::bail!(
            "Runtime bootstrap helper failed{}",
            if detail.is_empty() {
                String::new()
            } else {
                format!(": {detail}")
            }
        );
    }
    parse_desktop_bootstrap_response(&output.stdout)
}

pub(crate) fn parse_desktop_bootstrap_response(
    bytes: &[u8],
) -> anyhow::Result<DesktopBootstrapStatus> {
    let response: DesktopBootstrapResponse = serde_json::from_slice(bytes)
        .map_err(|error| anyhow::anyhow!("Runtime bootstrap response was invalid: {error}"))?;
    if response.schema_version != 1 {
        anyhow::bail!(
            "Unsupported Runtime bootstrap schema version {}",
            response.schema_version
        );
    }
    match response.status.as_str() {
        "ready" => response
            .launch
            .map(DesktopBootstrapStatus::Ready)
            .ok_or_else(|| anyhow::anyhow!("Runtime bootstrap omitted launch inputs")),
        "transition_required" => response
            .transition
            .map(DesktopBootstrapStatus::TransitionRequired)
            .ok_or_else(|| anyhow::anyhow!("Runtime bootstrap omitted transition details")),
        "transition_applied" => response
            .backup_dir
            .map(DesktopBootstrapStatus::TransitionApplied)
            .ok_or_else(|| anyhow::anyhow!("Runtime bootstrap omitted the backup path")),
        "no_transition" => Ok(DesktopBootstrapStatus::NoTransition),
        status => anyhow::bail!("Unsupported Runtime bootstrap status {status}"),
    }
}

pub(crate) fn prepare_interactive_persistence() -> anyhow::Result<Option<ExternalRuntimeLaunch>> {
    let plan = match run_desktop_bootstrap_command("inspect")? {
        DesktopBootstrapStatus::Ready(launch) => return Ok(Some(launch)),
        DesktopBootstrapStatus::TransitionRequired(plan) => plan,
        DesktopBootstrapStatus::TransitionApplied(_) | DesktopBootstrapStatus::NoTransition => {
            anyhow::bail!("Runtime bootstrap inspect returned an invalid status")
        }
    };
    if !confirm_persistence_transition(&plan) {
        return Ok(None);
    }
    let backup_dir = match run_desktop_bootstrap_command("apply-transition")? {
        DesktopBootstrapStatus::TransitionApplied(path) => Some(path),
        DesktopBootstrapStatus::NoTransition => None,
        DesktopBootstrapStatus::Ready(_) | DesktopBootstrapStatus::TransitionRequired(_) => {
            anyhow::bail!("Runtime bootstrap transition returned an invalid status")
        }
    };
    if let Some(backup_dir) = backup_dir {
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
    }
    match run_desktop_bootstrap_command("inspect")? {
        DesktopBootstrapStatus::Ready(launch) => Ok(Some(launch)),
        _ => anyhow::bail!("Runtime bootstrap did not become ready after data transition"),
    }
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
}
