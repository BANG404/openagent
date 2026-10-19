use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

// Cold startup includes persisted resources and primary services before readiness.
const READY_TIMEOUT: Duration = Duration::from_secs(60);
const BOOTSTRAP_INSPECT_TIMEOUT: Duration = Duration::from_secs(15);
const HEALTH_TIMEOUT: Duration = Duration::from_secs(5);
const TOKEN_ENV: &str = "OPENAGENT_DESKTOP_RUNTIME_TOKEN";
pub use openagent_protocol::SDK_PROTOCOL_VERSION as DESKTOP_RUNTIME_PROTOCOL_VERSION;

/// Hosts inject resource locations and environment setup. Product supervision
/// never discovers Tauri resources or depends on a desktop framework.
pub type RuntimeCommandSetup = fn(&mut std::process::Command) -> Result<(), String>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuntimeLaunchSpec {
    pub binary_path: PathBuf,
    pub workspace: PathBuf,
    pub openagent_home: PathBuf,
    pub embedding_seed: Option<PathBuf>,
    pub conversation_id: Option<String>,
    pub message_id: Option<String>,
    pub new_conversation: bool,
    pub primary_desktop_services: bool,
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

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct RuntimeBootstrapInspection {
    schema_version: u32,
    status: String,
    #[serde(default)]
    transition: Option<RuntimePersistenceTransition>,
    #[serde(default)]
    compatibility_policy: Option<crate::compatibility_policy::Decision>,
    #[serde(default)]
    pub plugin_contract: Option<RuntimePluginContract>,
    #[serde(default)]
    pub plugin_conflicts: Vec<RuntimePluginConflict>,
    #[serde(default)]
    restart_reason: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct RuntimePluginContract {
    pub plugin_protocol: u32,
    pub features: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct RuntimePluginConflict {
    pub id: String,
    pub version: Option<String>,
    pub reason: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
struct RuntimePersistenceTransition {
    reset_config: bool,
    reset_conversations: bool,
}

impl RuntimeBootstrapInspection {
    pub fn requires_plugin_update(&self) -> bool {
        self.status == "plugins_incompatible"
    }
    pub fn requires_persistence_transition(&self) -> bool {
        self.status == "transition_required"
    }

    pub fn requires_restart(&self) -> bool {
        self.status == "restart_required"
    }

    pub fn restart_reason(&self) -> String {
        if let Some(reason) = &self.restart_reason {
            return reason.clone();
        }
        self.compatibility_policy
            .as_ref()
            .filter(|decision| decision.restart_required)
            .map(|decision| decision.reasons.join("; "))
            .unwrap_or_else(|| "upgrade conversation storage".into())
    }

    pub fn transition_scope(&self) -> Option<&'static str> {
        let transition = self.transition.as_ref()?;
        match (transition.reset_config, transition.reset_conversations) {
            (true, true) => Some("settings and conversations"),
            (true, false) => Some("settings"),
            (false, true) => Some("conversations"),
            (false, false) => Some("data"),
        }
    }
}

/// Run the candidate's read-only bootstrap inspection without opening its
/// long-lived Runtime. This is the activation safety boundary for persisted
/// configuration and SQLite data.
pub async fn inspect_runtime_bootstrap_with_setup(
    binary_path: &Path,
    openagent_home: &Path,
    configure: RuntimeCommandSetup,
) -> Result<RuntimeBootstrapInspection, String> {
    inspect_runtime_bootstrap_with_policy_context(binary_path, openagent_home, None, configure)
        .await
}

/// A source version marks an online replacement inspection. The candidate must
/// apply online policy before the host drains or stops the currently running process.
pub async fn inspect_runtime_bootstrap_with_policy_context(
    binary_path: &Path,
    openagent_home: &Path,
    previous_runtime: Option<&str>,
    configure: RuntimeCommandSetup,
) -> Result<RuntimeBootstrapInspection, String> {
    if !binary_path.is_file() {
        return Err(format!(
            "Runtime bootstrap candidate does not exist: {}",
            binary_path.display()
        ));
    }
    let mut command = Command::new(binary_path);
    configure(command.as_std_mut())?;
    command.env_remove("OPENAGENT_POLICY_PREVIOUS_RUNTIME");
    command.env(
        "OPENAGENT_POLICY_OPERATION",
        if previous_runtime.is_some() {
            "online_activation"
        } else {
            "startup"
        },
    );
    if let Some(version) = previous_runtime {
        command.env("OPENAGENT_POLICY_PREVIOUS_RUNTIME", version);
    }
    command
        .arg("--desktop-bootstrap")
        .arg("inspect")
        .env("OPENAGENT_HOME", openagent_home)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.as_std_mut().creation_flags(0x0800_0000);
    }
    let child = command.spawn().map_err(|error| {
        format!(
            "failed to start Runtime bootstrap inspection {}: {error}",
            binary_path.display()
        )
    })?;
    let output = tokio::time::timeout(BOOTSTRAP_INSPECT_TIMEOUT, child.wait_with_output())
        .await
        .map_err(|_| "Runtime bootstrap inspection timed out".to_string())?
        .map_err(|error| format!("Runtime bootstrap inspection failed: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            format!(
                "Runtime bootstrap inspection exited with status {}",
                output.status
            )
        } else {
            format!("Runtime bootstrap inspection failed: {detail}")
        });
    }
    parse_runtime_bootstrap_inspection(&output.stdout)
}

fn parse_runtime_bootstrap_inspection(bytes: &[u8]) -> Result<RuntimeBootstrapInspection, String> {
    let inspection: RuntimeBootstrapInspection = serde_json::from_slice(bytes)
        .map_err(|error| format!("Runtime bootstrap inspection response was invalid: {error}"))?;
    if inspection.schema_version != 1 {
        return Err(format!(
            "Unsupported Runtime bootstrap inspection schema version {}",
            inspection.schema_version
        ));
    }
    if inspection.plugin_contract.as_ref().is_some_and(|contract| {
        contract.plugin_protocol == 0 || contract.features.iter().any(|feature| feature.is_empty())
    }) {
        return Err("Runtime bootstrap returned an invalid plugin contract".into());
    }
    if let Some(decision) = &inspection.compatibility_policy {
        decision
            .require_allowed()
            .map_err(|error| error.to_string())?;
        if decision.restart_required
            && inspection.status != "restart_required"
            && inspection.status != "transition_required"
        {
            return Err("Runtime policy restart decision disagrees with bootstrap status".into());
        }
    }
    match inspection.status.as_str() {
        "ready" | "restart_required" if inspection.transition.is_none() => Ok(inspection),
        "plugins_incompatible"
            if inspection.transition.is_none()
                && !inspection.plugin_conflicts.is_empty()
                && inspection
                    .plugin_contract
                    .as_ref()
                    .is_some_and(|contract| contract.plugin_protocol > 0) =>
        {
            Ok(inspection)
        }
        "transition_required" if inspection.transition.is_some() => Ok(inspection),
        status => Err(format!(
            "Runtime bootstrap inspection returned invalid status {status}"
        )),
    }
}

/// Opaque package maintenance is implemented by the verified candidate, never
/// by the desktop host. Versions and the candidate's own contract govern admission.
pub async fn runtime_plugin_update_with_setup(
    binary: &Path,
    home: &Path,
    action: &str,
    previous: Option<&str>,
    configure: RuntimeCommandSetup,
) -> Result<(), String> {
    if !["prepare", "commit", "rollback"].contains(&action) {
        return Err("Invalid Runtime/plugin update action".into());
    }
    let mut command = Command::new(binary);
    configure(command.as_std_mut())?;
    command
        .args(["--runtime-plugin-update", action])
        .arg("--runtime-plugin-owner-stdin")
        .env("OPENAGENT_HOME", home)
        .env_remove("OPENAGENT_PREVIOUS_RUNTIME_VERSION")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(version) = previous {
        command.env("OPENAGENT_PREVIOUS_RUNTIME_VERSION", version);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.as_std_mut().creation_flags(0x0800_0000);
    }
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let _lifetime =
        crate::process_lifetime::bind_tokio_child("Runtime plugin maintenance", &child)?;
    // Keep the owner pipe open while waiting. Unix preparation watches EOF;
    // Windows additionally binds maintenance to the desktop lifecycle job.
    let _owner = child.stdin.take();
    let output = tokio::time::timeout(Duration::from_secs(120), child.wait_with_output())
        .await
        .map_err(|_| "Runtime/plugin maintenance timed out")?
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!(
            "Runtime/plugin {action} failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let value: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;
    if value["schema_version"] != 1
        || value["status"] != action
        || !value["runtime_version"].is_string()
    {
        return Err("Runtime/plugin maintenance returned an invalid response".into());
    }
    Ok(())
}

struct RunningRuntime {
    child: Child,
    _lifetime_guard: crate::process_lifetime::HostLifetimeGuard,
    spec: RuntimeLaunchSpec,
    token: String,
    ready: RuntimeReady,
}

#[derive(Clone)]
pub struct RuntimeConnection {
    pub endpoint: Url,
    pub token: String,
}

/// Owns the single replaceable Runtime child for one desktop host process.
///
/// Callers must drain or cancel active work before `reload_after_drain`. The
/// supervisor deliberately stops the old process before starting the candidate,
/// so the two versions can never write the same durable state concurrently.
pub struct RuntimeProcessSupervisor {
    protocol_version: u32,
    configure: RuntimeCommandSetup,
    client: reqwest::Client,
    running: Mutex<Option<RunningRuntime>>,
}

impl RuntimeProcessSupervisor {
    pub fn new(protocol_version: u32, configure: RuntimeCommandSetup) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .timeout(HEALTH_TIMEOUT)
            .build()
            .map_err(|error| format!("failed to create Runtime health client: {error}"))?;
        Ok(Self {
            protocol_version,
            configure,
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

    pub async fn verified_status(&self) -> Result<Option<RuntimeProcessStatus>, String> {
        let running = self.running.lock().await;
        let Some(runtime) = running.as_ref() else {
            return Ok(None);
        };
        self.probe_health(&runtime.ready, &runtime.token).await?;
        Ok(Some(process_status(&runtime.ready)))
    }

    pub async fn launch_spec(&self) -> Option<RuntimeLaunchSpec> {
        self.running
            .lock()
            .await
            .as_ref()
            .map(|runtime| runtime.spec.clone())
    }

    pub async fn connection(&self) -> Result<RuntimeConnection, String> {
        let running = self.running.lock().await;
        let runtime = running
            .as_ref()
            .ok_or_else(|| "Runtime process is not running".to_string())?;
        let endpoint = Url::parse(&runtime.ready.endpoint)
            .map_err(|error| format!("Runtime endpoint is invalid: {error}"))?;
        Ok(RuntimeConnection {
            endpoint,
            token: runtime.token.clone(),
        })
    }

    pub async fn stop(&self) -> Result<(), String> {
        let mut running = self.running.lock().await;
        if let Some(runtime) = running.take() {
            stop_runtime(runtime).await?;
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
        let previous_version = self.status().await.map(|status| status.version);
        let inspection = inspect_runtime_bootstrap_with_policy_context(
            &candidate_spec.binary_path,
            &candidate_spec.openagent_home,
            previous_version.as_deref(),
            self.configure,
        )
        .await?;
        if inspection.requires_restart()
            || inspection.requires_persistence_transition()
            || inspection.requires_plugin_update()
        {
            return Err("Runtime replacement requires a desktop restart or a confirmed persistence transition; the previous process remains active".into());
        }
        let mut running = self.running.lock().await;
        let previous = running.take();
        let previous_spec = previous.as_ref().map(|runtime| runtime.spec.clone());
        if let Some(previous) = previous {
            stop_runtime(previous).await?;
        }

        match self.spawn_and_probe(candidate_spec.clone()).await {
            Ok(candidate) => {
                let status = process_status(&candidate.ready);
                *running = Some(candidate);
                Ok(status)
            }
            Err(candidate_error) => {
                if inspection.plugin_contract.is_some() {
                    runtime_plugin_update_with_setup(
                        &candidate_spec.binary_path,
                        &candidate_spec.openagent_home,
                        "rollback",
                        None,
                        self.configure,
                    )
                    .await
                    .map_err(|error| {
                        format!("{candidate_error}; plugin rollback failed: {error}")
                    })?;
                }
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
        (self.configure)(command.as_std_mut())?;
        command
            .args(runtime_arguments(&spec))
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
        let lifetime_guard = match crate::process_lifetime::bind_tokio_child("Runtime", &child) {
            Ok(guard) => guard,
            Err(error) => {
                let _ = stop_child(&mut child).await;
                return Err(error);
            }
        };
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Runtime stdout was not captured".to_string())?;
        let started = std::time::Instant::now();
        tracing::info!(target: "openagent::startup", "Waiting for Runtime readiness");
        let ready = match read_runtime_readiness(BufReader::new(stdout)).await {
            Ok(ready) => ready,
            Err(error) => {
                tracing::warn!(target: "openagent::startup", elapsed_ms = started.elapsed().as_millis() as u64, %error, "Runtime failed to publish readiness");
                let _ = stop_child(&mut child).await;
                return Err(error);
            }
        };
        if let Err(error) = validate_ready(&ready, self.protocol_version) {
            let _ = stop_child(&mut child).await;
            return Err(error);
        }
        if let Err(error) = self.probe_health(&ready, &token).await {
            let _ = stop_child(&mut child).await;
            return Err(error);
        }
        tracing::info!(target: "openagent::startup", elapsed_ms = started.elapsed().as_millis() as u64, "Runtime is ready and healthy");
        Ok(RunningRuntime {
            child,
            _lifetime_guard: lifetime_guard,
            spec,
            token,
            ready,
        })
    }

    async fn probe_health(&self, ready: &RuntimeReady, token: &str) -> Result<(), String> {
        let health_url = Url::parse(&ready.endpoint)
            .map_err(|error| format!("Runtime endpoint is invalid: {error}"))?
            .join("/api/desktop/health")
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

async fn read_runtime_readiness(stdout: impl AsyncBufRead + Unpin) -> Result<RuntimeReady, String> {
    let mut lines = stdout.lines();
    let line = tokio::time::timeout(READY_TIMEOUT, lines.next_line())
        .await
        .map_err(|_| {
            format!(
                "Runtime readiness timed out after {} seconds",
                READY_TIMEOUT.as_secs()
            )
        })?
        .map_err(|error| format!("failed to read Runtime readiness: {error}"))?
        .ok_or_else(|| "Runtime exited before publishing readiness".to_string())?;
    serde_json::from_str(&line)
        .map_err(|error| format!("Runtime published invalid readiness JSON: {error}"))
}

fn runtime_arguments(spec: &RuntimeLaunchSpec) -> Vec<OsString> {
    let mut arguments = vec![
        "--workspace".into(),
        spec.workspace.as_os_str().to_os_string(),
        "--listen".into(),
        "127.0.0.1:0".into(),
        "--token-env".into(),
        TOKEN_ENV.into(),
        "--output".into(),
        "json".into(),
        "--desktop-api".into(),
    ];
    if spec.primary_desktop_services {
        arguments.push("--desktop-primary".into());
    }
    if let Some(embedding_seed) = spec.embedding_seed.as_deref() {
        arguments.push("--embedding-seed".into());
        arguments.push(embedding_seed.as_os_str().to_os_string());
    }
    if let Some(conversation_id) = spec.conversation_id.as_deref() {
        arguments.push("--openagent-conversation".into());
        arguments.push(conversation_id.into());
    }
    if let Some(message_id) = spec.message_id.as_deref() {
        arguments.push("--openagent-message".into());
        arguments.push(message_id.into());
    }
    if spec.new_conversation {
        arguments.push("--openagent-new-conversation".into());
    }
    arguments
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
    if let Some(embedding_seed) = spec.embedding_seed.as_deref() {
        if !embedding_seed.is_dir() {
            return Err(format!(
                "Embedding seed directory does not exist: {}",
                embedding_seed.display()
            ));
        }
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

async fn stop_runtime(mut runtime: RunningRuntime) -> Result<(), String> {
    let result = stop_child(&mut runtime.child).await;
    drop(runtime);
    result
}

async fn stop_child(child: &mut Child) -> Result<(), String> {
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
    use super::{
        parse_runtime_bootstrap_inspection, runtime_arguments, validate_ready, RuntimeLaunchSpec,
        RuntimeProtocolRange, RuntimeReady,
    };
    use std::ffi::OsString;
    use std::path::PathBuf;

    fn ready(endpoint: &str) -> RuntimeReady {
        RuntimeReady {
            kind: "ready".to_string(),
            endpoint: endpoint.to_string(),
            protocol: RuntimeProtocolRange { min: 2, max: 3 },
            version: "0.51.0".to_string(),
            pid: 42,
        }
    }

    #[tokio::test(start_paused = true)]
    async fn accepts_cold_runtime_readiness_after_the_previous_deadline() {
        use tokio::io::AsyncWriteExt;
        let (reader, mut writer) = tokio::io::duplex(1024);
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(38)).await;
            writer.write_all(br#"{"type":"ready","endpoint":"http://127.0.0.1:43123","protocol":{"min":3,"max":3},"version":"0.1.1","pid":42}
"#).await.unwrap();
        });
        let ready = super::read_runtime_readiness(tokio::io::BufReader::new(reader))
            .await
            .unwrap();
        assert_eq!(ready.pid, 42);
        assert!(super::validate_ready(&ready, 3).is_ok());
    }

    #[tokio::test(start_paused = true)]
    async fn silent_runtime_still_has_a_bounded_readiness_deadline() {
        let (reader, _writer) = tokio::io::duplex(1024);
        let started = tokio::time::Instant::now();
        let error = super::read_runtime_readiness(tokio::io::BufReader::new(reader))
            .await
            .unwrap_err();
        assert!(error.contains("timed out after 60 seconds"));
        assert_eq!(started.elapsed(), std::time::Duration::from_secs(60));
    }

    #[tokio::test]
    async fn rejects_runtime_exit_and_malformed_readiness_without_waiting() {
        let error = super::read_runtime_readiness(&b""[..]).await.unwrap_err();
        assert!(error.contains("exited before publishing readiness"));
        let error = super::read_runtime_readiness(
            &b"not readiness JSON
"[..],
        )
        .await
        .unwrap_err();
        assert!(error.contains("invalid readiness JSON"));
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

    #[test]
    fn plugin_conflicts_are_an_explicit_pre_activation_gate() {
        let mut response = serde_json::json!({"schema_version":1,"status":"plugins_incompatible",
            "plugin_contract":{"plugin_protocol":1,"features":["configuration-v1"]},
            "plugin_conflicts":[{"id":"external","version":"2.0.0","reason":"requires protocol 2"}]});
        let parsed =
            parse_runtime_bootstrap_inspection(&serde_json::to_vec(&response).unwrap()).unwrap();
        assert!(parsed.requires_plugin_update());
        assert!(!parsed.requires_persistence_transition());
        response["plugin_conflicts"] = serde_json::json!([]);
        assert!(
            parse_runtime_bootstrap_inspection(&serde_json::to_vec(&response).unwrap()).is_err()
        );
        response["plugin_conflicts"] =
            serde_json::json!([{"id":"external","version":"2.0.0","reason":"requires protocol 2"}]);
        response.as_object_mut().unwrap().remove("plugin_contract");
        assert!(
            parse_runtime_bootstrap_inspection(&serde_json::to_vec(&response).unwrap()).is_err()
        );
    }

    #[test]
    fn parses_a_ready_bootstrap_inspection() {
        let inspection =
            parse_runtime_bootstrap_inspection(br#"{"schema_version":1,"status":"ready"}"#)
                .unwrap();
        assert!(!inspection.requires_persistence_transition());
        assert_eq!(inspection.transition_scope(), None);
        assert!(!inspection.requires_restart());
    }

    #[test]
    fn restart_required_refuses_online_replacement_without_resetting_data() {
        let inspection = parse_runtime_bootstrap_inspection(
            br#"{"schema_version":1,"status":"restart_required"}"#,
        )
        .unwrap();
        assert!(inspection.requires_restart());
        assert!(!inspection.requires_persistence_transition());
        assert_eq!(inspection.transition_scope(), None);
        // Older hosts reject this status rather than attempting a migration
        // that their automatic old-process rollback cannot read.
        assert!(parse_runtime_bootstrap_inspection(br#"{"schema_version":1,"status":"restart_required","transition":{"reset_config":false,"reset_conversations":true}}"#).is_err());
    }

    #[test]
    fn bootstrap_policy_cannot_hide_a_block_or_restart_decision() {
        let mut value = serde_json::json!({
            "schema_version":1, "status":"restart_required",
            "compatibility_policy": {
                "revision":7, "blocked":false, "restart_required":true,
                "matched_rules":["pause"], "reasons":["Restart before this upgrade"]
            }
        });
        let inspection =
            parse_runtime_bootstrap_inspection(&serde_json::to_vec(&value).unwrap()).unwrap();
        assert!(inspection.requires_restart());
        assert_eq!(inspection.restart_reason(), "Restart before this upgrade");
        value["status"] = serde_json::json!("ready");
        assert!(parse_runtime_bootstrap_inspection(&serde_json::to_vec(&value).unwrap()).is_err());
        value["compatibility_policy"]["restart_required"] = serde_json::json!(false);
        value["compatibility_policy"]["blocked"] = serde_json::json!(true);
        let error =
            parse_runtime_bootstrap_inspection(&serde_json::to_vec(&value).unwrap()).unwrap_err();
        assert!(error.contains("revision 7") && error.contains("pause"));
    }

    #[test]
    fn preserves_transition_scope_without_starting_the_runtime() {
        let inspection = parse_runtime_bootstrap_inspection(
            br#"{"schema_version":1,"status":"transition_required","transition":{"reset_config":false,"reset_conversations":true}}"#,
        )
        .unwrap();
        assert!(inspection.requires_persistence_transition());
        assert_eq!(inspection.transition_scope(), Some("conversations"));
    }

    #[test]
    fn rejects_unknown_bootstrap_inspection_schema() {
        let error = parse_runtime_bootstrap_inspection(br#"{"schema_version":2,"status":"ready"}"#)
            .unwrap_err();
        assert!(error.contains("schema version 2"));
    }

    #[test]
    fn supervised_runtime_enables_product_api_for_every_desktop_process() {
        let ordinary = RuntimeLaunchSpec {
            binary_path: PathBuf::from("openagent-server"),
            workspace: PathBuf::from("workspace"),
            openagent_home: PathBuf::from("data"),
            embedding_seed: Some(PathBuf::from("embedding-seed")),
            conversation_id: Some("conversation".into()),
            message_id: Some("message".into()),
            new_conversation: false,
            primary_desktop_services: false,
        };
        let ordinary_arguments = runtime_arguments(&ordinary);
        assert!(ordinary_arguments.contains(&OsString::from("--desktop-api")));
        assert!(!ordinary_arguments.contains(&OsString::from("--desktop-primary")));
        assert!(ordinary_arguments.contains(&OsString::from("--openagent-conversation")));
        assert!(ordinary_arguments.contains(&OsString::from("conversation")));
        assert!(ordinary_arguments.contains(&OsString::from("--openagent-message")));
        assert!(ordinary_arguments.contains(&OsString::from("message")));
        assert!(ordinary_arguments.contains(&OsString::from("--embedding-seed")));
        assert!(ordinary_arguments.contains(&OsString::from("embedding-seed")));

        let primary_arguments = runtime_arguments(&RuntimeLaunchSpec {
            primary_desktop_services: true,
            ..ordinary
        });
        assert!(primary_arguments.contains(&OsString::from("--desktop-api")));
        assert!(primary_arguments.contains(&OsString::from("--desktop-primary")));
    }

    #[test]
    fn supervised_runtime_forwards_explicit_new_conversation_launches() {
        let arguments = runtime_arguments(&RuntimeLaunchSpec {
            binary_path: PathBuf::from("openagent-server"),
            workspace: PathBuf::from("workspace"),
            openagent_home: PathBuf::from("data"),
            embedding_seed: None,
            conversation_id: None,
            message_id: None,
            new_conversation: true,
            primary_desktop_services: false,
        });
        assert!(arguments.contains(&OsString::from("--openagent-new-conversation")));
    }
}
