//! Product transition policy. Conversation formats and database access stay in Runtime.
use anyhow::{bail, Context};
use openagent_config::{self as config, Config, ConfigCompatibility};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StorageCompatibility {
    Ready,
    Upgrade { supported: bool },
    Incompatible,
}

/// Implemented by the engine that understands its own storage. Product code
/// never opens SQLite or infers compatibility from database files.
pub trait ConversationStorageMaintenance {
    fn inspect(&self, data_dir: &Path) -> StorageCompatibility;
    fn backup(&self, data_dir: &Path, destination: &Path) -> anyhow::Result<()>;
    fn reset(&self, data_dir: &Path) -> anyhow::Result<()>;
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PersistenceTransitionPlan {
    pub data_dir: PathBuf,
    pub backup_dir: PathBuf,
    pub reset_config: bool,
    pub reset_conversations: bool,
}

impl PersistenceTransitionPlan {
    pub fn scope_label(&self) -> &'static str {
        match (self.reset_config, self.reset_conversations) {
            (true, true) => "settings and conversations",
            (true, false) => "settings",
            (false, true) => "conversations",
            (false, false) => "nothing",
        }
    }
}

pub fn conversation_upgrade_requires_restart(
    data_dir: &Path,
    storage: &impl ConversationStorageMaintenance,
) -> bool {
    matches!(
        storage.inspect(data_dir),
        StorageCompatibility::Upgrade { .. }
    )
}

fn unique_backup_dir(data_dir: &Path) -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let parent = data_dir.join("backups");
    let stem = format!("before-data-v1-{timestamp}");
    let first = parent.join(&stem);
    if !first.exists() {
        return first;
    }
    for suffix in 2.. {
        let candidate = parent.join(format!("{stem}-{suffix}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

pub fn pending_persistence_transition(
    storage: &impl ConversationStorageMaintenance,
) -> anyhow::Result<Option<PersistenceTransitionPlan>> {
    config::ensure_config_dir().context("Failed to prepare application data directory")?;
    let data_dir = config::config_dir();
    let reset_config = !matches!(
        config::inspect_config_compatibility(),
        ConfigCompatibility::Missing
            | ConfigCompatibility::Current
            | ConfigCompatibility::Legacy(0)
    );
    let reset_conversations = matches!(
        storage.inspect(&data_dir),
        StorageCompatibility::Incompatible | StorageCompatibility::Upgrade { supported: false }
    );
    if !reset_config && !reset_conversations {
        return Ok(None);
    }
    Ok(Some(PersistenceTransitionPlan {
        backup_dir: unique_backup_dir(&data_dir),
        data_dir,
        reset_config,
        reset_conversations,
    }))
}

fn copy_and_sync(source: &Path, destination: &Path) -> anyhow::Result<()> {
    let copied = fs::copy(source, destination)
        .with_context(|| format!("Failed to back up {}", source.display()))?;
    if copied != fs::metadata(source)?.len() {
        bail!("Backup copy length did not match its source");
    }
    fs::OpenOptions::new()
        .write(true)
        .open(destination)?
        .sync_all()?;
    Ok(())
}

fn remove_if_present(path: &Path) -> anyhow::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error).with_context(|| format!("Failed to remove {}", path.display())),
    }
}

/// The interactive product host calls this only after the reported transition
/// has been confirmed. Every backup must succeed before either scope is reset.
pub fn apply_persistence_transition(
    plan: &PersistenceTransitionPlan,
    storage: &impl ConversationStorageMaintenance,
) -> anyhow::Result<PathBuf> {
    if plan.data_dir != config::config_dir() {
        bail!("Persistence transition targets a different application data directory");
    }
    if plan.backup_dir.parent() != Some(plan.data_dir.join("backups").as_path()) {
        bail!("Persistence transition backup must remain under application backups");
    }
    fs::create_dir_all(plan.data_dir.join("backups"))?;
    // Reserve one backup directory without merging with another transition.
    fs::create_dir(&plan.backup_dir).context("Failed to reserve transition backup directory")?;
    if plan.reset_config {
        for name in ["config.toml", "config.toml.bak"] {
            let source = plan.data_dir.join(name);
            if source.exists() {
                copy_and_sync(&source, &plan.backup_dir.join(name))?;
            }
        }
    }
    if plan.reset_conversations {
        storage.backup(&plan.data_dir, &plan.backup_dir.join("messages.db"))?;
    }
    fs::write(
        plan.backup_dir.join("README.txt"),
        format!(
            "OpenAgent persistence transition backup\nsource={}\nsettings={}\nconversations={}\n",
            plan.data_dir.display(),
            plan.reset_config,
            plan.reset_conversations
        ),
    )?;
    fs::OpenOptions::new()
        .write(true)
        .open(plan.backup_dir.join("README.txt"))?
        .sync_all()?;
    if plan.reset_conversations {
        storage.reset(&plan.data_dir)?;
    }
    if plan.reset_config {
        remove_if_present(&plan.data_dir.join("config.toml"))?;
        remove_if_present(&plan.data_dir.join("config.toml.bak"))?;
        config::save_config(&Config::default()).context("Failed to create fresh configuration")?;
    }
    Ok(plan.backup_dir.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    };
    static DATA_ROOT_LOCK: Mutex<()> = Mutex::new(());

    struct RootEnvironment(Option<std::ffi::OsString>);
    impl Drop for RootEnvironment {
        fn drop(&mut self) {
            match self.0.take() {
                Some(previous) => std::env::set_var("OPENAGENT_HOME", previous),
                None => std::env::remove_var("OPENAGENT_HOME"),
            }
        }
    }
    fn with_root(test: impl FnOnce(&Path)) {
        let _lock = DATA_ROOT_LOCK.lock().unwrap();
        let root = tempfile::tempdir().unwrap();
        let _environment = RootEnvironment(std::env::var_os("OPENAGENT_HOME"));
        std::env::set_var("OPENAGENT_HOME", root.path());
        test(root.path());
    }
    struct Storage {
        compatibility: StorageCompatibility,
        fail_backup: bool,
        reset: AtomicBool,
    }
    impl Storage {
        fn new(compatibility: StorageCompatibility) -> Self {
            Self {
                compatibility,
                fail_backup: false,
                reset: AtomicBool::new(false),
            }
        }
    }
    impl ConversationStorageMaintenance for Storage {
        fn inspect(&self, _: &Path) -> StorageCompatibility {
            self.compatibility
        }
        fn backup(&self, _: &Path, destination: &Path) -> anyhow::Result<()> {
            if self.fail_backup {
                bail!("storage backup failed");
            }
            fs::write(destination, b"opaque engine backup")?;
            Ok(())
        }
        fn reset(&self, _: &Path) -> anyhow::Result<()> {
            self.reset.store(true, Ordering::SeqCst);
            Ok(())
        }
    }

    #[test]
    fn supported_storage_upgrades_require_restart_without_a_destructive_transition() {
        with_root(|root| {
            let storage = Storage::new(StorageCompatibility::Upgrade { supported: true });
            assert!(conversation_upgrade_requires_restart(root, &storage));
            assert!(pending_persistence_transition(&storage).unwrap().is_none());
            assert!(!storage.reset.load(Ordering::SeqCst));
        });
    }

    #[test]
    fn failed_storage_backup_preserves_settings_and_never_resets_storage() {
        with_root(|root| {
            let original = b"config_version = 999\ntheme = 'dark'\n";
            fs::write(root.join("config.toml"), original).unwrap();
            let mut storage = Storage::new(StorageCompatibility::Incompatible);
            storage.fail_backup = true;
            let plan = pending_persistence_transition(&storage).unwrap().unwrap();
            assert!(plan.reset_config && plan.reset_conversations);
            assert!(apply_persistence_transition(&plan, &storage).is_err());
            assert_eq!(fs::read(root.join("config.toml")).unwrap(), original);
            assert!(!storage.reset.load(Ordering::SeqCst));
        });
    }

    #[test]
    fn confirmed_transition_backs_up_both_scopes_before_reset() {
        with_root(|root| {
            let original = b"config_version = 999\ntheme = 'dark'\n";
            fs::write(root.join("config.toml"), original).unwrap();
            let storage = Storage::new(StorageCompatibility::Incompatible);
            let plan = pending_persistence_transition(&storage).unwrap().unwrap();
            let backup = apply_persistence_transition(&plan, &storage).unwrap();
            assert_eq!(fs::read(backup.join("config.toml")).unwrap(), original);
            assert_eq!(
                fs::read(backup.join("messages.db")).unwrap(),
                b"opaque engine backup"
            );
            assert!(storage.reset.load(Ordering::SeqCst));
            assert_eq!(
                config::load_config().unwrap().config_version,
                config::CURRENT_CONFIG_VERSION
            );
            assert!(!config::load_config().unwrap().onboarding_completed);
        });
    }
}
