use crate::component_updates::{acquire_component_update_barrier, RuntimeUpdateState};
use crate::cua_driver::stop_cua_driver_serve;
#[cfg(desktop)]
use crate::desktop_windows::DESKTOP_TRAY_ID;
use crate::runtime_process::RuntimeProcessSupervisor;
use crate::runtime_transport::RuntimeEventProxy;
use crate::workspace_process::{
    finish_child_workspace_window_shutdown, request_child_workspace_window_shutdown,
};
use std::sync::Arc;
use tauri::{Manager, State};

/// How far this process has advanced toward ending itself.
///
/// The shell installer, not the host, ends the process, so the bounded
/// teardown has to run before it is handed the application. That splits one
/// exit into a preparation and a completion, both reached through ordinary
/// commands.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DesktopExitPhase {
    Running,
    ShellInstallPrepared,
    Exiting,
}

/// What an exit request still has to do, given how far the process already got.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DesktopExitStep {
    /// Nothing was prepared, so run the bounded teardown now.
    Start,
    /// A shell install already stopped the children and hid the windows, so
    /// only the watchdog and the exit itself remain.
    Complete,
    /// An exit is already under way; a repeated request must not race it.
    Ignore,
}

impl DesktopExitPhase {
    fn from_bits(bits: u8) -> Self {
        match bits {
            1 => Self::ShellInstallPrepared,
            2 => Self::Exiting,
            _ => Self::Running,
        }
    }

    fn bits(self) -> u8 {
        match self {
            Self::Running => 0,
            Self::ShellInstallPrepared => 1,
            Self::Exiting => 2,
        }
    }
}

#[derive(Default)]
pub(crate) struct DesktopWindowState {
    pub(crate) startup_window_revealed: std::sync::atomic::AtomicBool,
    desktop_exit: std::sync::atomic::AtomicU8,
}

impl DesktopWindowState {
    #[cfg(test)]
    fn desktop_exit_phase(&self) -> DesktopExitPhase {
        DesktopExitPhase::from_bits(self.desktop_exit.load(std::sync::atomic::Ordering::Acquire))
    }

    /// Claim shell teardown before another update or exit can race it. The
    /// command reports readiness only once the bounded teardown succeeds.
    pub(crate) fn prepare_shell_install(&self) -> Result<(), String> {
        self.desktop_exit
            .compare_exchange(
                DesktopExitPhase::Running.bits(),
                DesktopExitPhase::ShellInstallPrepared.bits(),
                std::sync::atomic::Ordering::AcqRel,
                std::sync::atomic::Ordering::Acquire,
            )
            .map(|_| ())
            .map_err(|phase| {
                format!(
                    "cannot prepare a shell install while the desktop is in the {:?} exit phase",
                    DesktopExitPhase::from_bits(phase)
                )
            })
    }

    /// Claim the exit and report what the caller still has to do.
    fn advance_desktop_exit_phase(&self) -> DesktopExitStep {
        let mut current = self.desktop_exit.load(std::sync::atomic::Ordering::Acquire);
        loop {
            let step = match DesktopExitPhase::from_bits(current) {
                DesktopExitPhase::Running => DesktopExitStep::Start,
                DesktopExitPhase::ShellInstallPrepared => DesktopExitStep::Complete,
                DesktopExitPhase::Exiting => return DesktopExitStep::Ignore,
            };
            match self.desktop_exit.compare_exchange_weak(
                current,
                DesktopExitPhase::Exiting.bits(),
                std::sync::atomic::Ordering::AcqRel,
                std::sync::atomic::Ordering::Acquire,
            ) {
                Ok(_) => return step,
                Err(observed) => current = observed,
            }
        }
    }

    /// Frontend confirmations arriving after shell teardown must not mutate
    /// the pending selection or attempt to resume a Runtime that is already
    /// being stopped for replacement.
    pub(crate) fn rejects_frontend_confirmation(&self) -> bool {
        matches!(
            DesktopExitPhase::from_bits(
                self.desktop_exit.load(std::sync::atomic::Ordering::Acquire)
            ),
            DesktopExitPhase::ShellInstallPrepared | DesktopExitPhase::Exiting
        )
    }
}

const DESKTOP_QUIT_WATCHDOG_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);
const DESKTOP_RUNTIME_STOP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(6);
const DESKTOP_EVENT_PROXY_STOP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(1);
const DESKTOP_CHILD_PROCESS_GRACE_TIMEOUT: std::time::Duration =
    std::time::Duration::from_millis(1500);
const DESKTOP_CHILD_PROCESS_STOP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);
#[tauri::command]
pub(crate) fn restart_app(app: tauri::AppHandle) {
    request_desktop_exit(app, DesktopExitAction::Restart);
}

/// Make the process safe for a shell installer that will end it.
///
/// On Windows the updater plugin terminates the application inside
/// `install()`, so nothing after that call can run and the bounded teardown
/// has to happen before it. Active Runtime work reports `false` and defers the
/// update before teardown. A failure after teardown starts rejects installation
/// and restarts the host to restore its Runtime and hidden windows.
#[tauri::command]
pub(crate) async fn begin_shell_install(
    app: tauri::AppHandle,
    updates: State<'_, RuntimeUpdateState>,
    supervisor: State<'_, Arc<RuntimeProcessSupervisor>>,
) -> Result<bool, String> {
    let gate = acquire_component_update_barrier(updates.inner(), supervisor.inner()).await?;
    if !gate.ready {
        return Ok(false);
    }
    app.state::<DesktopWindowState>().prepare_shell_install()?;
    if let Err(error) = request_child_workspace_window_shutdown() {
        tracing::warn!(%error, "failed to signal child workspace processes before the shell install");
    }
    hide_desktop_surfaces(&app);
    if let Err(error) = stop_desktop_children(&app).await {
        tracing::error!(
            target: "openagent::component_update",
            component = "shell",
            stage = "install_preparation_failed",
            %error,
            "refusing the shell installer because desktop teardown did not finish"
        );
        // Preparation hid the windows and may have stopped the Runtime. Restore
        // a usable desktop through a fresh process; never hand off to NSIS.
        request_desktop_exit(app, DesktopExitAction::Restart);
        return Err(error);
    }
    tracing::info!(
        target: "openagent::component_update",
        component = "shell",
        stage = "install_prepared",
        "shell install preparation confirmed the desktop's children exited"
    );
    Ok(true)
}

#[derive(Clone, Copy)]
enum DesktopExitAction {
    Quit,
    Restart,
}

/// Hide every surface the user could still interact with while the process
/// winds down. Shared by the ordinary exit path and by the shell install
/// preparation, which hands the application to an installer.
fn hide_desktop_surfaces(app: &tauri::AppHandle) {
    #[cfg(desktop)]
    {
        if let Some(tray) = app.tray_by_id(DESKTOP_TRAY_ID) {
            let _ = tray.set_visible(false);
        }
        for window in app.webview_windows().values() {
            let _ = window.hide();
        }
    }
}

/// Stop everything the host owns that outlives its windows: the supervised
/// Runtime, the event proxy, child workspace processes, and the Cua Driver
/// daemon. Every step is bounded and idempotent, so a shell install may run
/// this before an exit request runs it again.
async fn stop_desktop_children(app: &tauri::AppHandle) -> Result<(), String> {
    let mut failures = Vec::new();
    let supervisor = app.state::<Arc<RuntimeProcessSupervisor>>();
    match tokio::time::timeout(DESKTOP_RUNTIME_STOP_TIMEOUT, supervisor.stop()).await {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            failures.push(format!("failed to stop supervised Runtime: {error}"));
        }
        Err(_) => {
            failures.push("timed out stopping supervised Runtime".to_string());
        }
    }
    let proxy = app.state::<RuntimeEventProxy>();
    if tokio::time::timeout(DESKTOP_EVENT_PROXY_STOP_TIMEOUT, proxy.stop())
        .await
        .is_err()
    {
        failures.push("timed out stopping Runtime event proxy".to_string());
    }
    let child_cleanup = tauri::async_runtime::spawn_blocking(|| {
        finish_child_workspace_window_shutdown(DESKTOP_CHILD_PROCESS_GRACE_TIMEOUT)
    });
    match tokio::time::timeout(DESKTOP_CHILD_PROCESS_STOP_TIMEOUT, child_cleanup).await {
        Ok(Ok(Ok(()))) => {}
        Ok(Ok(Err(error))) => {
            failures.push(format!("failed to stop child workspace processes: {error}"));
        }
        Ok(Err(error)) => {
            failures.push(format!(
                "child workspace process cleanup task failed: {error}"
            ));
        }
        Err(_) => {
            failures.push("timed out stopping child workspace processes".to_string());
        }
    }
    stop_cua_driver_serve();
    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join("; "))
    }
}

async fn finish_desktop_exit(
    app: tauri::AppHandle,
    action: DesktopExitAction,
    step: DesktopExitStep,
) {
    if step == DesktopExitStep::Start {
        if let Err(error) = stop_desktop_children(&app).await {
            tracing::warn!(%error, "desktop child teardown did not finish during exit");
        }
    }
    match action {
        DesktopExitAction::Quit => {
            app.cleanup_before_exit();
            std::process::exit(0)
        }
        DesktopExitAction::Restart => app.request_restart(),
    }
}

/// Exit without waiting for the bounded teardown to finish.
fn arm_desktop_exit_watchdog(app: &tauri::AppHandle, action: DesktopExitAction) {
    let watchdog_app = app.clone();
    std::thread::Builder::new()
        .name("openagent-quit-watchdog".to_string())
        .spawn(move || {
            std::thread::sleep(DESKTOP_QUIT_WATCHDOG_TIMEOUT);
            stop_cua_driver_serve();
            match action {
                DesktopExitAction::Quit => std::process::exit(0),
                DesktopExitAction::Restart => watchdog_app.restart(),
            }
        })
        .expect("failed to start desktop quit watchdog");
}

pub(crate) fn request_desktop_quit(app: tauri::AppHandle) {
    request_desktop_exit(app, DesktopExitAction::Quit);
}

fn request_desktop_exit(app: tauri::AppHandle, action: DesktopExitAction) {
    let step = app
        .state::<DesktopWindowState>()
        .advance_desktop_exit_phase();
    if step == DesktopExitStep::Ignore {
        return;
    }

    let action_name = match action {
        DesktopExitAction::Quit => "quit",
        DesktopExitAction::Restart => "restart",
    };
    tracing::info!(
        target: "openagent::app",
        action = action_name,
        prepared = step == DesktopExitStep::Complete,
        "desktop exit requested"
    );
    // A shell install already signalled the child windows and hid the
    // surfaces; repeating either is harmless but would only delay the exit.
    if step == DesktopExitStep::Start {
        if let Err(error) = request_child_workspace_window_shutdown() {
            tracing::warn!(%error, "failed to signal child workspace processes during quit");
        }
        hide_desktop_surfaces(&app);
    }

    arm_desktop_exit_watchdog(&app, action);
    tauri::async_runtime::spawn(finish_desktop_exit(app, action, step));
}

pub(crate) fn install_parent_shutdown_monitor(app: tauri::AppHandle) {
    std::thread::Builder::new()
        .name("openagent-parent-shutdown-monitor".to_string())
        .spawn(move || {
            use std::io::Read;

            let mut signal = [0_u8; 1];
            let _ = std::io::stdin().read(&mut signal);
            request_desktop_quit(app);
        })
        .expect("failed to start parent shutdown monitor");
}

/// In development, the launcher owns the host's stdin pipe. EOF means the
/// launcher or its terminal disappeared, so use the normal bounded quit path
/// instead of leaving the GUI process behind on Windows.
pub(crate) fn install_dev_parent_shutdown_monitor(app: tauri::AppHandle) {
    std::thread::Builder::new()
        .name("openagent-dev-parent-shutdown-monitor".to_string())
        .spawn(move || {
            use std::io::Read;

            let mut signal = [0_u8; 1];
            let _ = std::io::stdin().read(&mut signal);
            request_desktop_quit(app);
        })
        .expect("failed to start development parent shutdown monitor");
}

#[tauri::command]
pub(crate) async fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    request_desktop_quit(app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shell_install_preparation_hands_the_exit_to_the_restart_request() {
        let state = DesktopWindowState::default();
        assert_eq!(state.desktop_exit_phase(), DesktopExitPhase::Running);
        assert!(!state.rejects_frontend_confirmation());

        // Preparation stops the children; it never restarts anything.
        state
            .prepare_shell_install()
            .expect("prepare shell install");
        assert_eq!(
            state.desktop_exit_phase(),
            DesktopExitPhase::ShellInstallPrepared
        );
        assert!(state.rejects_frontend_confirmation());
        assert!(state.prepare_shell_install().is_err());

        // The exit that follows completes the work preparation already did
        // instead of tearing the children down a second time.
        assert_eq!(
            state.advance_desktop_exit_phase(),
            DesktopExitStep::Complete
        );
        assert_eq!(state.advance_desktop_exit_phase(), DesktopExitStep::Ignore);
        assert!(state.prepare_shell_install().is_err());
    }

    #[test]
    fn desktop_exit_requests_are_idempotent() {
        let state = DesktopWindowState::default();
        assert_eq!(state.advance_desktop_exit_phase(), DesktopExitStep::Start);
        assert_eq!(state.advance_desktop_exit_phase(), DesktopExitStep::Ignore);
        assert_eq!(state.desktop_exit_phase(), DesktopExitPhase::Exiting);
        assert!(state.rejects_frontend_confirmation());
    }
}
