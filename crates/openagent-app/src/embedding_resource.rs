use openagent_config as config;
pub use openagent_protocol::{
    EmbeddingResourceProgress, EmbeddingResourceState, EmbeddingResourceStatus,
};
use reqwest::Client;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

pub use openagent_protocol::{EMBEDDING_MODEL_ID, EMBEDDING_MODEL_VERSION};

const RESOURCE_SOURCE_REVISION: &str = "2049b468b6aa0f071f07e4d922243115a984d869";
const RESOURCE_SOURCE_ROOT: &str = "https://raw.githubusercontent.com/BANG404/openagent";

#[derive(Clone, Copy)]
struct ResourceFile {
    name: &'static str,
    size: u64,
    sha256: &'static str,
}

const RESOURCE_FILES: [ResourceFile; 6] = [
    ResourceFile {
        name: "model_quantized.onnx",
        size: 22_972_370,
        sha256: "afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1",
    },
    ResourceFile {
        name: "config.json",
        size: 650,
        sha256: "7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7",
    },
    ResourceFile {
        name: "tokenizer.json",
        size: 711_661,
        sha256: "da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0",
    },
    ResourceFile {
        name: "tokenizer_config.json",
        size: 366,
        sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3",
    },
    ResourceFile {
        name: "special_tokens_map.json",
        size: 125,
        sha256: "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3",
    },
    ResourceFile {
        name: "LICENSE",
        size: 10_318,
        sha256: "1e66d43b04a3f2428303ad3316d1fbb996991541192892b22d21f0065a093b2b",
    },
];

const TOTAL_BYTES: u64 = 23_695_490;

#[derive(Clone)]
pub struct EmbeddingResourceManager {
    model_dir: PathBuf,
    operation: Arc<Mutex<()>>,
    client: Client,
}

impl Default for EmbeddingResourceManager {
    fn default() -> Self {
        Self::new(config::config_dir())
    }
}

impl EmbeddingResourceManager {
    pub fn new(openagent_home: PathBuf) -> Self {
        Self {
            model_dir: openagent_home
                .join("resources")
                .join("embedding")
                .join(EMBEDDING_MODEL_ID)
                .join(EMBEDDING_MODEL_VERSION),
            operation: Arc::new(Mutex::new(())),
            client: Client::new(),
        }
    }

    pub fn model_dir(&self) -> &Path {
        &self.model_dir
    }

    pub async fn status(&self) -> EmbeddingResourceStatus {
        let model_dir = self.model_dir.clone();
        tokio::task::spawn_blocking(move || inspect_model_dir(&model_dir))
            .await
            .unwrap_or_else(|_| status(EmbeddingResourceState::Corrupt))
    }

    pub async fn prepare<F>(
        &self,
        bundled_seed: Option<PathBuf>,
        mut on_progress: F,
    ) -> Result<EmbeddingResourceStatus, String>
    where
        F: FnMut(EmbeddingResourceProgress) + Send,
    {
        let _guard = self.operation.lock().await;
        let current = self.status().await;
        if current.ready() {
            return Ok(current);
        }

        if let Some(seed) = bundled_seed {
            let valid_seed = tokio::task::spawn_blocking({
                let seed = seed.clone();
                move || inspect_model_dir(&seed).ready()
            })
            .await
            .map_err(|error| format!("failed to inspect bundled embedding resource: {error}"))?;
            if valid_seed {
                self.install_seed(&seed, &mut on_progress).await?;
                return self.require_ready().await;
            }
        }

        self.download(&mut on_progress).await?;
        self.require_ready().await
    }

    async fn require_ready(&self) -> Result<EmbeddingResourceStatus, String> {
        let installed = self.status().await;
        if installed.ready() {
            Ok(installed)
        } else {
            Err("embedding resource failed verification after installation".to_string())
        }
    }

    async fn install_seed<F>(&self, seed: &Path, on_progress: &mut F) -> Result<(), String>
    where
        F: FnMut(EmbeddingResourceProgress),
    {
        let staging = self.create_staging_dir().await?;
        let mut copied = 0;
        let result = async {
            for file in RESOURCE_FILES {
                tokio::fs::copy(seed.join(file.name), staging.join(file.name))
                    .await
                    .map_err(|error| {
                        format!(
                            "failed to copy bundled embedding file {}: {error}",
                            file.name
                        )
                    })?;
                copied += file.size;
                on_progress(progress(copied, file.name));
            }
            let verified = tokio::task::spawn_blocking({
                let staging = staging.clone();
                move || inspect_model_dir(&staging).ready()
            })
            .await
            .map_err(|error| format!("failed to verify bundled embedding resource: {error}"))?;
            if !verified {
                return Err("bundled embedding resource failed size or SHA-256 validation".into());
            }
            self.commit_staging(&staging).await
        }
        .await;
        if result.is_err() {
            let _ = tokio::fs::remove_dir_all(&staging).await;
        }
        result
    }

    async fn download<F>(&self, on_progress: &mut F) -> Result<(), String>
    where
        F: FnMut(EmbeddingResourceProgress),
    {
        let staging = self.create_staging_dir().await?;
        let mut downloaded = 0;
        let result = async {
            for file in RESOURCE_FILES {
                let url = format!(
                    "{RESOURCE_SOURCE_ROOT}/{RESOURCE_SOURCE_REVISION}/src-tauri/resources/models/{EMBEDDING_MODEL_ID}/{}",
                    file.name
                );
                let mut response = self
                    .client
                    .get(&url)
                    .send()
                    .await
                    .map_err(|error| format!("failed to download {}: {error}", file.name))?
                    .error_for_status()
                    .map_err(|error| format!("failed to download {}: {error}", file.name))?;
                let path = staging.join(file.name);
                let mut output = tokio::fs::File::create(&path)
                    .await
                    .map_err(|error| format!("failed to create {}: {error}", path.display()))?;
                while let Some(chunk) = response
                    .chunk()
                    .await
                    .map_err(|error| format!("failed to download {}: {error}", file.name))?
                {
                    output.write_all(&chunk).await.map_err(|error| {
                        format!("failed to write embedding file {}: {error}", path.display())
                    })?;
                    downloaded += chunk.len() as u64;
                    on_progress(progress(downloaded, file.name));
                }
                output
                    .flush()
                    .await
                    .map_err(|error| format!("failed to flush {}: {error}", path.display()))?;
            }

            let verified = tokio::task::spawn_blocking({
                let staging = staging.clone();
                move || inspect_model_dir(&staging).ready()
            })
            .await
            .map_err(|error| format!("failed to verify embedding download: {error}"))?;
            if !verified {
                return Err("downloaded embedding resource failed size or SHA-256 validation".into());
            }
            self.commit_staging(&staging).await
        }
        .await;
        if result.is_err() {
            let _ = tokio::fs::remove_dir_all(&staging).await;
        }
        result
    }

    async fn create_staging_dir(&self) -> Result<PathBuf, String> {
        let parent = self
            .model_dir
            .parent()
            .ok_or_else(|| "embedding resource directory has no parent".to_string())?;
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| {
                format!("system clock cannot name embedding staging directory: {error}")
            })?
            .as_nanos();
        let staging = parent.join(format!(".{EMBEDDING_MODEL_VERSION}-{nonce}.partial"));
        tokio::fs::create_dir(&staging)
            .await
            .map_err(|error| format!("failed to create {}: {error}", staging.display()))?;
        Ok(staging)
    }

    async fn commit_staging(&self, staging: &Path) -> Result<(), String> {
        let backup = self.model_dir.with_extension("replaced");
        if tokio::fs::try_exists(&backup).await.unwrap_or(false) {
            tokio::fs::remove_dir_all(&backup)
                .await
                .map_err(|error| format!("failed to clear {}: {error}", backup.display()))?;
        }
        let had_existing = tokio::fs::try_exists(&self.model_dir)
            .await
            .unwrap_or(false);
        if had_existing {
            tokio::fs::rename(&self.model_dir, &backup)
                .await
                .map_err(|error| format!("failed to replace embedding resource: {error}"))?;
        }
        if let Err(error) = tokio::fs::rename(staging, &self.model_dir).await {
            let installed_by_another_process = tokio::task::spawn_blocking({
                let model_dir = self.model_dir.clone();
                move || inspect_model_dir(&model_dir).ready()
            })
            .await
            .unwrap_or(false);
            if installed_by_another_process {
                let _ = tokio::fs::remove_dir_all(staging).await;
                if had_existing {
                    let _ = tokio::fs::remove_dir_all(&backup).await;
                }
                return Ok(());
            }
            if had_existing {
                let _ = tokio::fs::rename(&backup, &self.model_dir).await;
            }
            return Err(format!("failed to activate embedding resource: {error}"));
        }
        if had_existing {
            let _ = tokio::fs::remove_dir_all(backup).await;
        }
        Ok(())
    }
}

fn progress(downloaded_bytes: u64, current_file: &str) -> EmbeddingResourceProgress {
    EmbeddingResourceProgress {
        downloaded_bytes,
        total_bytes: TOTAL_BYTES,
        current_file: current_file.to_string(),
    }
}

fn status(state: EmbeddingResourceState) -> EmbeddingResourceStatus {
    EmbeddingResourceStatus {
        state,
        model_id: EMBEDDING_MODEL_ID.to_string(),
        version: EMBEDDING_MODEL_VERSION.to_string(),
        total_bytes: TOTAL_BYTES,
    }
}

fn inspect_model_dir(model_dir: &Path) -> EmbeddingResourceStatus {
    if !model_dir.exists() {
        return status(EmbeddingResourceState::Missing);
    }
    for file in RESOURCE_FILES {
        let path = model_dir.join(file.name);
        let Ok(bytes) = std::fs::read(path) else {
            return status(EmbeddingResourceState::Corrupt);
        };
        if bytes.len() as u64 != file.size || format!("{:x}", Sha256::digest(&bytes)) != file.sha256
        {
            return status(EmbeddingResourceState::Corrupt);
        }
    }
    status(EmbeddingResourceState::Ready)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn missing_resource_reports_expected_identity_and_size() {
        let temp = tempfile::tempdir().unwrap();
        let manager = EmbeddingResourceManager::new(temp.path().to_path_buf());
        let resource = manager.status().await;

        assert_eq!(resource.state, EmbeddingResourceState::Missing);
        assert_eq!(resource.model_id, EMBEDDING_MODEL_ID);
        assert_eq!(resource.version, EMBEDDING_MODEL_VERSION);
        assert_eq!(resource.total_bytes, TOTAL_BYTES);
    }

    #[test]
    fn incomplete_resource_is_corrupt_instead_of_ready() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(temp.path()).unwrap();
        std::fs::write(temp.path().join("config.json"), b"{}").unwrap();

        assert_eq!(
            inspect_model_dir(temp.path()).state,
            EmbeddingResourceState::Corrupt
        );
    }
}
