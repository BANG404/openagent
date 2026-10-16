use super::{ContextFacts, Decision, Operation, Policy};
use anyhow::{bail, Context};
use base64::Engine;
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const UPDATE_PUBLIC_KEY: &str = "untrusted comment: minisign public key: C373284FCF9656A0\nRWSgVpbPTyhzw46ILL4vBbjg4XueHFxKhTk48DCGqAT/IfE5vSyBDSGl\n";
const POLICY_LIMIT: usize = 256 * 1024;
const SIGNATURE_LIMIT: usize = 16 * 1024;
const CACHE_LIMIT: usize = POLICY_LIMIT * 6 + SIGNATURE_LIMIT + 1024;
const REFRESH_INTERVAL: u64 = 15 * 60;
const BASELINE: &[u8] = include_bytes!("../../resources/compatibility-policy.json");

#[derive(Clone, Debug)]
pub struct PolicySource {
    pub url: String,
    pub public_key: String,
}

#[derive(Clone, Debug)]
pub struct PolicySnapshot {
    pub policy: Policy,
    pub origin: &'static str,
    pub expired: bool,
}

impl PolicySnapshot {
    pub fn evaluate(&self, facts: &ContextFacts) -> Decision {
        let mut decision = self.policy.evaluate(facts);
        if self.expired && facts.operation == Operation::OnlineActivation {
            decision.blocked = true;
            decision.matched_rules.push("policy-expired".into());
            decision
                .reasons
                .push("Refresh the compatibility policy before activating an update".into());
        }
        decision
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct SignedPolicy {
    payload: String,
    signature: String,
    checked_at: u64,
}

impl PolicySource {
    pub fn production() -> Self {
        Self {
            url: "https://github.com/BANG404/openagent/releases/download/compatibility-policy/openagent-compatibility-policy.json".into(),
            public_key: UPDATE_PUBLIC_KEY.into(),
        }
    }

    pub fn verify_document(&self, payload: &[u8], signature: &str) -> anyhow::Result<Policy> {
        self.verify(&SignedPolicy {
            payload: String::from_utf8(payload.to_vec())?,
            signature: signature.into(),
            checked_at: 0,
        })
    }

    /// The exact signed snapshot is returned and stays fixed for this operation.
    /// Network failures preserve a verified cache; first offline use has the
    /// bundled baseline. An expired cache retains restrictions and revision floor.
    pub async fn resolve(
        &self,
        home: &Path,
        operation: Operation,
    ) -> anyhow::Result<PolicySnapshot> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
        let directory = home.join("resources/compatibility-policy");
        let cache_directory = directory.clone();
        let source = self.clone();
        let cached =
            tokio::task::spawn_blocking(move || source.read_cache(&cache_directory)).await??;
        if operation == Operation::Startup {
            if let Some(signed) = &cached {
                let policy = self.verify(signed)?;
                if policy.is_current(now)
                    && signed.checked_at <= now
                    && now - signed.checked_at < REFRESH_INTERVAL
                {
                    return Ok(PolicySnapshot {
                        policy,
                        origin: "cache",
                        expired: false,
                    });
                }
            }
        }
        let downloaded =
            match tokio::time::timeout(Duration::from_secs(3), self.download(now)).await {
                Ok(Ok(value)) => Some(value),
                _ => {
                    tracing::info!("Compatibility policy refresh unavailable; using local policy");
                    None
                }
            };
        let source = self.clone();
        tokio::task::spawn_blocking(move || source.select(directory, cached, downloaded, now))
            .await?
    }

    fn verify(&self, signed: &SignedPolicy) -> anyhow::Result<Policy> {
        if signed.payload.len() > POLICY_LIMIT || signed.signature.len() > SIGNATURE_LIMIT {
            bail!("Compatibility policy exceeds size limit");
        }
        let signature = signed.signature.trim();
        let text = if signature.starts_with("untrusted comment:") {
            signature.to_owned()
        } else {
            String::from_utf8(base64::engine::general_purpose::STANDARD.decode(signature)?)?
        };
        let key = minisign_verify::PublicKey::decode(&self.public_key)
            .context("Invalid compatibility policy signing key")?;
        let signature = minisign_verify::Signature::decode(&text)
            .context("Invalid compatibility policy signature")?;
        key.verify(signed.payload.as_bytes(), &signature, false)
            .context("Compatibility policy signature verification failed")?;
        Policy::parse(signed.payload.as_bytes())
    }

    fn read_cache(&self, directory: &Path) -> anyhow::Result<Option<SignedPolicy>> {
        let path = directory.join("policy.json");
        let file = match std::fs::File::open(path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        let mut bytes = Vec::new();
        file.take(CACHE_LIMIT as u64 + 1).read_to_end(&mut bytes)?;
        if bytes.len() > CACHE_LIMIT {
            bail!("Compatibility policy cache exceeds size limit");
        }
        let signed: SignedPolicy =
            serde_json::from_slice(&bytes).context("Invalid compatibility policy cache")?;
        self.verify(&signed)?;
        Ok(Some(signed))
    }

    async fn download(&self, now: u64) -> anyhow::Result<SignedPolicy> {
        let url = reqwest::Url::parse(&self.url)?;
        if url.scheme() != "https"
            && !(cfg!(debug_assertions)
                && url.scheme() == "http"
                && url.host_str() == Some("127.0.0.1"))
        {
            bail!("Compatibility policy source requires HTTPS");
        }
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()?;
        let signature_url = format!("{}.sig", self.url);
        let (payload, signature) = tokio::try_join!(
            bounded(&client, &self.url, POLICY_LIMIT),
            bounded(&client, &signature_url, SIGNATURE_LIMIT)
        )?;
        let signed = SignedPolicy {
            payload: String::from_utf8(payload)?,
            signature: String::from_utf8(signature)?,
            checked_at: now,
        };
        let policy = self.verify(&signed)?;
        if !policy.is_current(now) || policy.revision == 0 {
            bail!("Online compatibility policy is not current");
        }
        Ok(signed)
    }

    fn select(
        &self,
        directory: PathBuf,
        cached: Option<SignedPolicy>,
        downloaded: Option<SignedPolicy>,
        now: u64,
    ) -> anyhow::Result<PolicySnapshot> {
        let Some(downloaded) = downloaded else {
            return self.snapshot(cached, now, "cache");
        };
        std::fs::create_dir_all(&directory)?;
        let lock = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(directory.join("policy.lock"))?;
        // Never wait on another startup or an abandoned policy publisher.
        if lock.try_lock_exclusive().is_err() {
            return self.snapshot(cached, now, "cache");
        }
        let cached = self.read_cache(&directory)?;
        let candidate = self.verify(&downloaded)?;
        if let Some(previous) = &cached {
            let current = self.verify(previous)?;
            if candidate.revision < current.revision
                || (candidate.revision == current.revision
                    && downloaded.payload != previous.payload)
            {
                tracing::warn!("Rejected compatibility policy rollback or reused revision");
                return self.snapshot(cached, now, "cache");
            }
        }
        let mut temporary = tempfile::NamedTempFile::new_in(&directory)?;
        temporary.write_all(&serde_json::to_vec(&downloaded)?)?;
        temporary.as_file().sync_all()?;
        temporary.persist(directory.join("policy.json"))?;
        self.snapshot(Some(downloaded), now, "online")
    }

    fn snapshot(
        &self,
        signed: Option<SignedPolicy>,
        now: u64,
        origin: &'static str,
    ) -> anyhow::Result<PolicySnapshot> {
        match signed {
            Some(signed) => {
                let policy = self.verify(&signed)?;
                let expired = !policy.is_current(now);
                Ok(PolicySnapshot {
                    policy,
                    origin,
                    expired,
                })
            }
            None => Ok(PolicySnapshot {
                policy: Policy::parse(BASELINE)?,
                origin: "bundled",
                expired: false,
            }),
        }
    }
}

async fn bounded(client: &reqwest::Client, url: &str, limit: usize) -> anyhow::Result<Vec<u8>> {
    let mut response = client.get(url).send().await?.error_for_status()?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if bytes.len() + chunk.len() > limit {
            bail!("Compatibility policy response exceeds size limit");
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    fn fixture(name: &str) -> (PolicySource, SignedPolicy) {
        let value: serde_json::Value = serde_json::from_str(include_str!("fixtures.json")).unwrap();
        let source = PolicySource {
            url: "http://127.0.0.1:1/policy.json".into(),
            public_key: value["public_key"].as_str().unwrap().into(),
        };
        (
            source,
            serde_json::from_value(value["policies"][name].clone()).unwrap(),
        )
    }

    #[test]
    fn verifies_signatures_and_detects_tampering() {
        let (source, mut signed) = fixture("1");
        assert_eq!(source.verify(&signed).unwrap().revision, 1);
        signed.payload = signed.payload.replace("intermediate", "unverified");
        assert!(source.verify(&signed).is_err());
        let (_, mut signed) = fixture("1");
        signed.signature = "invalid".into();
        assert!(source.verify(&signed).is_err());
    }

    #[test]
    fn persists_monotonic_revisions_and_rechecks_after_concurrent_selection() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("policy");
        let (source, first) = fixture("1");
        let (_, second) = fixture("2");
        let snapshot = source
            .select(directory.clone(), None, Some(second.clone()), 200)
            .unwrap();
        assert_eq!(snapshot.policy.revision, 2);
        // A fetch begun before another process committed revision 2 must reread.
        let snapshot = source
            .select(directory.clone(), None, Some(first), 200)
            .unwrap();
        assert_eq!(snapshot.policy.revision, 2);
        let (_, conflict) = fixture("conflict");
        let snapshot = source
            .select(directory.clone(), None, Some(conflict), 200)
            .unwrap();
        assert_eq!(
            snapshot.policy.rules[0].reason,
            "Install the intermediate Runtime first"
        );
        let (_, third) = fixture("3");
        let snapshot = source
            .select(directory.clone(), Some(second), Some(third), 200)
            .unwrap();
        assert_eq!(snapshot.policy.revision, 3);
        assert_eq!(
            source
                .read_cache(&directory)
                .unwrap()
                .map(|s| source.verify(&s).unwrap().revision),
            Some(3)
        );
    }

    #[test]
    fn expired_cache_blocks_activation_without_blocking_original_startup() {
        let (source, expired) = fixture("expired");
        let snapshot = source.snapshot(Some(expired), 200, "cache").unwrap();
        let mut facts = super::super::tests::facts();
        assert!(snapshot.evaluate(&facts).blocked);
        facts.operation = Operation::Startup;
        assert!(!snapshot.evaluate(&facts).blocked);
        assert_eq!(snapshot.policy.revision, 4);
    }

    #[tokio::test]
    async fn offline_first_start_uses_baseline_and_corrupt_cache_is_rejected() {
        let root = tempfile::tempdir().unwrap();
        let (source, _) = fixture("1");
        let snapshot = source
            .resolve(root.path(), Operation::Startup)
            .await
            .unwrap();
        assert_eq!(snapshot.origin, "bundled");
        assert_eq!(snapshot.policy.revision, 0);
        assert!(!root.path().join("resources/compatibility-policy").exists());
        let directory = root.path().join("resources/compatibility-policy");
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::write(directory.join("policy.json"), b"corrupt").unwrap();
        assert!(source
            .resolve(root.path(), Operation::Startup)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn fetches_signed_online_rules_and_reuses_verified_cache_offline() {
        let root = tempfile::tempdir().unwrap();
        let (mut source, signed) = fixture("1");
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        source.url = format!("http://{}/policy.json", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            for _ in 0..2 {
                let (mut stream, _) = listener.accept().await.unwrap();
                let signed = signed.clone();
                tokio::spawn(async move {
                    let mut request = vec![0; 4096];
                    let count = stream.read(&mut request).await.unwrap();
                    let request = String::from_utf8_lossy(&request[..count]);
                    let body = if request.starts_with("GET /policy.json.sig ") {
                        signed.signature
                    } else {
                        signed.payload
                    };
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    stream.write_all(response.as_bytes()).await.unwrap();
                });
            }
        });
        let online = source
            .resolve(root.path(), Operation::OnlineActivation)
            .await
            .unwrap();
        server.await.unwrap();
        assert_eq!(online.origin, "online");
        assert!(online.evaluate(&super::super::tests::facts()).blocked);
        let offline = source
            .resolve(root.path(), Operation::OnlineActivation)
            .await
            .unwrap();
        assert_eq!(offline.origin, "cache");
        assert!(offline.evaluate(&super::super::tests::facts()).blocked);
        assert_eq!(online.policy.revision, offline.policy.revision);
    }
}
