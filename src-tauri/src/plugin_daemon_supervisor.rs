//! Generic lifecycle management for long-lived Agent Plugin daemons.
//!
//! Package resolution and permission decisions remain Runtime-owned. This
//! module owns only the host-side process contract shared by daemon plugins:
//! one child per plugin, a held stdin lifetime pipe, optional socket readiness,
//! bounded shutdown, and forced reaping. Product-specific launch arguments and
//! endpoint ownership stay in the caller.

use crate::process_lifetime::{bind_std_child, HostLifetimeGuard};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Clone, Debug)]
pub(crate) enum PluginDaemonTransport {
    Stdio,
    Socket {
        endpoint: String,
        startup_timeout: Duration,
    },
}

#[derive(Clone, Debug)]
pub(crate) struct PluginDaemonSpec {
    pub plugin_id: String,
    pub label: String,
    pub command: String,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    pub env: Vec<(String, String)>,
    pub transport: PluginDaemonTransport,
}

pub(crate) struct PluginDaemonChild {
    child: Child,
    stdin: ChildStdin,
    _lifetime: HostLifetimeGuard,
}

impl PluginDaemonChild {
    fn is_running(&mut self) -> Result<bool, String> {
        self.child
            .try_wait()
            .map(|status| status.is_none())
            .map_err(|error| format!("plugin daemon status failed: {error}"))
    }

    fn stop(mut self, stop: Option<&PluginDaemonStop>, timeout: Duration) {
        if let Some(stop) = stop {
            let _ = stop.request();
        }
        drop(self.stdin);
        if wait_for_exit(&mut self.child, timeout) {
            return;
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub(crate) struct PluginDaemonStop {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    pub env: Vec<(String, String)>,
    pub timeout: Duration,
}

impl PluginDaemonStop {
    fn request(&self) -> Result<(), String> {
        let mut child = std::process::Command::new(&self.command)
            .args(&self.args)
            .current_dir(&self.cwd)
            .envs(self.env.iter().map(|(key, value)| (key, value)))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| format!("plugin daemon stop request failed: {error}"))?;
        if wait_for_exit(&mut child, self.timeout) {
            Ok(())
        } else {
            let _ = child.kill();
            let _ = child.wait();
            Err("plugin daemon stop request timed out".to_string())
        }
    }
}

struct ManagedDaemon {
    child: PluginDaemonChild,
    stop: Option<PluginDaemonStop>,
    _resources: Vec<Box<dyn Send>>,
}

/// Host-owned registry for all long-lived plugin daemons in this desktop
/// process. The registry is keyed by the validated plugin id.
pub(crate) struct PluginDaemonSupervisor {
    daemons: Mutex<HashMap<String, ManagedDaemon>>,
    shutdown_timeout: Duration,
}

impl PluginDaemonSupervisor {
    pub(crate) fn new(shutdown_timeout: Duration) -> Self {
        Self {
            daemons: Mutex::new(HashMap::new()),
            shutdown_timeout,
        }
    }

    pub(crate) fn start(
        &self,
        spec: PluginDaemonSpec,
        stop: Option<PluginDaemonStop>,
    ) -> Result<bool, String> {
        self.start_with_resources(spec, stop, Vec::new())
    }

    pub(crate) fn start_with_resources(
        &self,
        spec: PluginDaemonSpec,
        stop: Option<PluginDaemonStop>,
        resources: Vec<Box<dyn Send>>,
    ) -> Result<bool, String> {
        let mut daemons = self
            .daemons
            .lock()
            .map_err(|_| "plugin daemon supervisor state is unavailable".to_string())?;
        if let Some(existing) = daemons.get_mut(&spec.plugin_id) {
            if existing.child.is_running()? {
                return Ok(false);
            }
            daemons.remove(&spec.plugin_id);
        }
        let mut command = std::process::Command::new(&spec.command);
        command
            .args(&spec.args)
            .current_dir(&spec.cwd)
            .envs(spec.env.iter().map(|(key, value)| (key, value)))
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        let mut child = command.spawn().map_err(|error| {
            format!(
                "failed to start plugin daemon '{}': {error}",
                spec.plugin_id
            )
        })?;
        let Some(stdin) = child.stdin.take() else {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "plugin daemon '{}' did not expose stdin",
                spec.plugin_id
            ));
        };
        forward_stderr(&spec.label, child.stderr.take());
        let lifetime = match bind_std_child(&spec.label, &child) {
            Ok(lifetime) => lifetime,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        };
        if let PluginDaemonTransport::Socket {
            endpoint,
            startup_timeout,
        } = &spec.transport
        {
            if let Err(error) = wait_for_endpoint(&mut child, endpoint, *startup_timeout) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        }
        daemons.insert(
            spec.plugin_id,
            ManagedDaemon {
                child: PluginDaemonChild {
                    child,
                    stdin,
                    _lifetime: lifetime,
                },
                stop,
                _resources: resources,
            },
        );
        Ok(true)
    }

    pub(crate) fn stop_all(&self) {
        let daemons = self.daemons.lock().ok().map(|mut daemons| {
            daemons
                .drain()
                .map(|(_, daemon)| daemon)
                .collect::<Vec<_>>()
        });
        if let Some(daemons) = daemons {
            for daemon in daemons {
                daemon
                    .child
                    .stop(daemon.stop.as_ref(), self.shutdown_timeout);
            }
        }
    }

    pub(crate) fn is_running(&self, plugin_id: &str) -> Result<bool, String> {
        let mut daemons = self
            .daemons
            .lock()
            .map_err(|_| "plugin daemon supervisor state is unavailable".to_string())?;
        daemons
            .get_mut(plugin_id)
            .map(|daemon| daemon.child.is_running())
            .unwrap_or(Ok(false))
    }

    pub(crate) fn stop(&self, plugin_id: &str) -> Result<bool, String> {
        let daemon = self
            .daemons
            .lock()
            .map_err(|_| "plugin daemon supervisor state is unavailable".to_string())?
            .remove(plugin_id);
        let Some(daemon) = daemon else {
            return Ok(false);
        };
        daemon
            .child
            .stop(daemon.stop.as_ref(), self.shutdown_timeout);
        Ok(true)
    }
}

fn forward_stderr(label: &str, stderr: Option<std::process::ChildStderr>) {
    use std::io::BufRead;
    let Some(stderr) = stderr else { return };
    let label = label.to_string();
    let _ = std::thread::Builder::new()
        .name(format!("plugin-daemon-{label}-stderr"))
        .spawn(move || {
            for line in std::io::BufReader::new(stderr)
                .lines()
                .map_while(Result::ok)
            {
                if !line.trim().is_empty() {
                    tracing::debug!(plugin = %label, "{line}");
                }
            }
        });
}

fn wait_for_exit(child: &mut Child, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return true,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            Ok(None) | Err(_) => return false,
        }
    }
}

fn wait_for_endpoint(child: &mut Child, endpoint: &str, timeout: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    loop {
        if endpoint_is_ready(endpoint) {
            return Ok(());
        }
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("plugin daemon status failed: {error}"))?
        {
            return Err(format!(
                "plugin daemon exited before endpoint was ready: {status}"
            ));
        }
        if Instant::now() >= deadline {
            return Err(format!(
                "plugin daemon endpoint was not ready within {timeout:?}"
            ));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[cfg(unix)]
fn endpoint_is_ready(endpoint: &str) -> bool {
    std::os::unix::net::UnixStream::connect(endpoint).is_ok()
}
#[cfg(windows)]
fn endpoint_is_ready(endpoint: &str) -> bool {
    std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(endpoint)
        .is_ok()
}
#[cfg(not(any(unix, windows)))]
fn endpoint_is_ready(endpoint: &str) -> bool {
    std::path::Path::new(endpoint).exists()
}

#[cfg(test)]
mod tests {
    use super::wait_for_exit;
    use std::process::{Command, Stdio};
    use std::time::Duration;

    #[test]
    fn wait_for_exit_reports_a_child_that_exits() {
        let mut child = if cfg!(windows) {
            Command::new("cmd")
                .args(["/C", "exit", "0"])
                .stdout(Stdio::null())
                .spawn()
                .unwrap()
        } else {
            Command::new("true").spawn().unwrap()
        };
        assert!(wait_for_exit(&mut child, Duration::from_secs(2)));
    }
}
