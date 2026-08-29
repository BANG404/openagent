use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

const READY_TIMEOUT: Duration = Duration::from_secs(15);
const HEALTH_TIMEOUT: Duration = Duration::from_secs(5);
const TOKEN_ENV: &str = "OPENAGENT_DESKTOP_RUNTIME_TOKEN";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuntimeLaunchSpec {
    pub binary_path: PathBuf,
    pub workspace: PathBuf,
    pub openagent_home: PathBuf,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct RuntimeProtocolRange {
    pub min: u32,
    pub max: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct RuntimeReady {
    #[serde(rename = "type")]
    pub kind: String,
    pub endpoint: String,
    pub protocol: RuntimeProtocolRange,
    pub version: String,
    pub pid: u32,
}

#[derive(Clone, Debug, Deserialize)]
struct RuntimeHealth {
    status: String,
    pid: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct RuntimeProcessStatus {
    pub endpoint: String,
    pub protocol: RuntimeProtocolRange,
    pub version: String,
    pub pid: u32,
}

struct RunningRuntime {
    child: Child,
    spec: RuntimeLaunchSpec,
    token: String,
    ready: RuntimeReady,
}

/// Owns the single replaceable Runtime child for one desktop host process.
///
/// Callers must drain or cancel active work before `reload_after_drain`. The
/// supervisor deliberately stops the old process before starting the candidate,
/// so the two versions can never write the same durable state concurrently.
pub struct RuntimeProcessSupervisor {
    protocol_version: u32,
    client: reqwest::Client,
    running: Mutex<Option<RunningRuntime>>,
}

impl RuntimeProcessSupervisor {
    pub fn new(protocol_version: u32) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .timeout(HEALTH_TIMEOUT)
            .build()
            .map_err(|error| format!("failed to create Runtime health client: {error}"))?;
        Ok(Self {
            protocol_version,
            client,
            running: Mutex::new(None),
        })
    }

    pub async fn start(&self, spec: RuntimeLaunchSpec) -> Result<RuntimeProcessStatus, String> {
        let mut running = self.running.lock().await;
        if running.is_some() {
            return Err("Runtime process is already running".to_string());
        }
        let candidate = self.spawn_and_probe(spec).await?;
        let status = process_status(&candidate.ready);
        *running = Some(candidate);
        Ok(status)
    }

    pub async fn status(&self) -> Option<RuntimeProcessStatus> {
        self.running
            .lock()
            .await
            .as_ref()
            .map(|runtime| process_status(&runtime.ready))
    }

    pub async fn stop(&self) -> Result<(), String> {
        let mut running = self.running.lock().await;
        if let Some(runtime) = running.take() {
            stop_child(runtime.child).await?;
        }
        Ok(())
    }

    /// Replace the active Runtime after the caller has established that no
    /// in-memory run must cross the process boundary. Failed candidates are
    /// discarded and the prior launch specification is restarted.
    pub async fn reload_after_drain(
        &self,
        candidate_spec: RuntimeLaunchSpec,
    ) -> Result<RuntimeProcessStatus, String> {
        let mut running = self.running.lock().await;
        let previous = running.take();
        let previous_spec = previous.as_ref().map(|runtime| runtime.spec.clone());
        if let Some(previous) = previous {
            stop_child(previous.child).await?;
        }

        match self.spawn_and_probe(candidate_spec).await {
            Ok(candidate) => {
                let status = process_status(&candidate.ready);
                *running = Some(candidate);
                Ok(status)
            }
            Err(candidate_error) => {
                let Some(previous_spec) = previous_spec else {
                    return Err(candidate_error);
                };
                match self.spawn_and_probe(previous_spec).await {
                    Ok(previous) => {
                        *running = Some(previous);
                        Err(format!(
                            "Runtime candidate failed and the previous version was restored: {candidate_error}"
                        ))
                    }
                    Err(rollback_error) => Err(format!(
                        "Runtime candidate failed ({candidate_error}); rollback also failed ({rollback_error})"
                    )),
                }
            }
        }
    }

    async fn spawn_and_probe(&self, spec: RuntimeLaunchSpec) -> Result<RunningRuntime, String> {
        validate_launch_spec(&spec)?;
        let token = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        let mut command = Command::new(&spec.binary_path);
        command
            .arg("--workspace")
            .arg(&spec.workspace)
            .arg("--listen")
            .arg("127.0.0.1:0")
            .arg("--token-env")
            .arg(TOKEN_ENV)
            .arg("--output")
            .arg("json")
            .env("OPENAGENT_HOME", &spec.openagent_home)
            .env(TOKEN_ENV, &token)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .kill_on_drop(true);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.as_std_mut().creation_flags(0x0800_0000);
        }
        let mut child = command.spawn().map_err(|error| {
            format!(
                "failed to start Runtime {}: {error}",
                spec.binary_path.display()
            )
        })?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Runtime stdout was not captured".to_string())?;
        let mut lines = BufReader::new(stdout).lines();
        let line = match tokio::time::timeout(READY_TIMEOUT, lines.next_line()).await {
            Ok(Ok(Some(line))) => line,
            Ok(Ok(None)) => {
                let _ = stop_child(child).await;
                return Err("Runtime exited before publishing readiness".to_string());
            }
            Ok(Err(error)) => {
                let _ = stop_child(child).await;
                return Err(format!("failed to read Runtime readiness: {error}"));
            }
            Err(_) => {
                let _ = stop_child(child).await;
                return Err("Runtime readiness timed out".to_string());
            }
        };
        let ready: RuntimeReady = serde_json::from_str(&line)
            .map_err(|error| format!("Runtime published invalid readiness JSON: {error}"))?;
        if let Err(error) = validate_ready(&ready, self.protocol_version) {
            let _ = stop_child(child).await;
            return Err(error);
        }
        if let Err(error) = self.probe_health(&ready, &token).await {
            let _ = stop_child(child).await;
            return Err(error);
        }
        Ok(RunningRuntime {
            child,
            spec,
            token,
            ready,
        })
    }

    async fn probe_health(&self, ready: &RuntimeReady, token: &str) -> Result<(), String> {
        let health_url = Url::parse(&ready.endpoint)
            .map_err(|error| format!("Runtime endpoint is invalid: {error}"))?
            .join("/v1/health")
            .map_err(|error| format!("Runtime health URL is invalid: {error}"))?;
        let health: RuntimeHealth = self
            .client
            .get(health_url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|error| format!("Runtime health probe failed: {error}"))?
            .error_for_status()
            .map_err(|error| format!("Runtime health probe was rejected: {error}"))?
            .json()
            .await
            .map_err(|error| format!("Runtime health response was invalid: {error}"))?;
        if health.status != "ok" || health.pid != ready.pid {
            return Err("Runtime health response did not match readiness".to_string());
        }
        Ok(())
    }
}

impl Drop for RuntimeProcessSupervisor {
    fn drop(&mut self) {
        if let Ok(mut running) = self.running.try_lock() {
            if let Some(runtime) = running.as_mut() {
                let _ = runtime.child.start_kill();
                runtime.token.clear();
            }
        }
    }
}

fn validate_launch_spec(spec: &RuntimeLaunchSpec) -> Result<(), String> {
    if !spec.binary_path.is_file() {
        return Err(format!(
            "Runtime binary does not exist: {}",
            spec.binary_path.display()
        ));
    }
    if !spec.workspace.is_dir() {
        return Err(format!(
            "Runtime workspace does not exist: {}",
            spec.workspace.display()
        ));
    }
    if spec.openagent_home.as_os_str().is_empty() {
        return Err("OPENAGENT_HOME must not be empty".to_string());
    }
    Ok(())
}

fn validate_ready(ready: &RuntimeReady, protocol_version: u32) -> Result<(), String> {
    if ready.kind != "ready" {
        return Err("Runtime did not publish a ready record".to_string());
    }
    if ready.protocol.min > ready.protocol.max
        || protocol_version < ready.protocol.min
        || protocol_version > ready.protocol.max
    {
        return Err(format!(
            "Runtime protocol range {}-{} is incompatible with host protocol {}",
            ready.protocol.min, ready.protocol.max, protocol_version
        ));
    }
    let endpoint = Url::parse(&ready.endpoint)
        .map_err(|error| format!("Runtime endpoint is invalid: {error}"))?;
    if endpoint.scheme() != "http"
        || endpoint.username() != ""
        || endpoint.password().is_some()
        || endpoint.query().is_some()
        || endpoint.fragment().is_some()
        || endpoint.path() != "/"
        || !endpoint.host_str().is_some_and(is_loopback_host)
    {
        return Err("Runtime endpoint must be a plain loopback HTTP origin".to_string());
    }
    Ok(())
}

fn is_loopback_host(host: &str) -> bool {
    let host = host
        .strip_prefix('[')
        .and_then(|host| host.strip_suffix(']'))
        .unwrap_or(host);
    host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|address| address.is_loopback())
}

fn process_status(ready: &RuntimeReady) -> RuntimeProcessStatus {
    RuntimeProcessStatus {
        endpoint: ready.endpoint.clone(),
        protocol: ready.protocol.clone(),
        version: ready.version.clone(),
        pid: ready.pid,
    }
}

async fn stop_child(mut child: Child) -> Result<(), String> {
    if child
        .try_wait()
        .map_err(|error| format!("failed to inspect Runtime process: {error}"))?
        .is_some()
    {
        return Ok(());
    }
    if let Some(mut stdin) = child.stdin.take() {
        if stdin.write_all(b"shutdown\n").await.is_ok() {
            let _ = stdin.shutdown().await;
            if let Ok(status) = tokio::time::timeout(Duration::from_secs(5), child.wait()).await {
                status.map_err(|error| format!("failed to wait for Runtime process: {error}"))?;
                return Ok(());
            }
        }
    }
    child
        .start_kill()
        .map_err(|error| format!("failed to terminate Runtime process: {error}"))?;
    child
        .wait()
        .await
        .map_err(|error| format!("failed to wait for terminated Runtime process: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{validate_ready, RuntimeProtocolRange, RuntimeReady};

    fn ready(endpoint: &str) -> RuntimeReady {
        RuntimeReady {
            kind: "ready".to_string(),
            endpoint: endpoint.to_string(),
            protocol: RuntimeProtocolRange { min: 2, max: 3 },
            version: "0.51.0".to_string(),
            pid: 42,
        }
    }

    #[test]
    fn accepts_a_compatible_loopback_runtime() {
        assert!(validate_ready(&ready("http://127.0.0.1:43123"), 2).is_ok());
        assert!(validate_ready(&ready("http://[::1]:43123"), 3).is_ok());
    }

    #[test]
    fn rejects_remote_or_credentialed_runtime_origins() {
        assert!(validate_ready(&ready("https://127.0.0.1:43123"), 2).is_err());
        assert!(validate_ready(&ready("http://example.com:43123"), 2).is_err());
        assert!(validate_ready(&ready("http://user@127.0.0.1:43123"), 2).is_err());
    }

    #[test]
    fn rejects_an_incompatible_runtime_protocol() {
        assert!(validate_ready(&ready("http://127.0.0.1:43123"), 1).is_err());
        assert!(validate_ready(&ready("http://127.0.0.1:43123"), 4).is_err());
    }
}
