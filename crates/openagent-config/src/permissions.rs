use serde::{Deserialize, Serialize};

/// Workspace metadata that remains read-only beneath a managed writable root
/// unless a more-specific permission entry explicitly reopens it for writes.
///
/// These paths control repository history, agent instructions, and runtime
/// policy. Treating a broad workspace write grant as authority to rewrite them
/// would let an ordinary tool call change the rules governing later calls.
pub const PROTECTED_METADATA_PATH_NAMES: &[&str] = &[".git", ".agents", ".codex"];

/// Filesystem access granted by one managed permission entry.
///
/// When equally-specific entries match, `Deny` wins over `Write`, and `Write`
/// wins over `Read`. A write grant also permits reading the same path.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum FileSystemAccess {
    Read,
    Write,
    Deny,
}

impl FileSystemAccess {
    pub fn permits(self, requested: Self) -> bool {
        match requested {
            Self::Read => matches!(self, Self::Read | Self::Write),
            Self::Write => matches!(self, Self::Write),
            Self::Deny => false,
        }
    }

    pub fn precedence(self) -> u8 {
        match self {
            Self::Read => 1,
            Self::Write => 2,
            Self::Deny => 3,
        }
    }

    pub fn operation_name(self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Write => "write",
            Self::Deny => "deny",
        }
    }
}

/// A path root used by a managed filesystem permission entry.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FileSystemPermissionPath {
    /// The host filesystem root containing the active workspace. On Unix this
    /// is `/`; on Windows it is the workspace volume or UNC share root.
    HostRoot,
    /// The active workspace root, optionally narrowed to a relative subpath.
    Workspace {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        subpath: Option<String>,
    },
    /// An explicit absolute host path. Linux-absolute paths are interpreted in
    /// the active WSL distribution when the workspace is a WSL UNC path.
    Absolute { path: String },
}

impl FileSystemPermissionPath {
    pub fn host_root() -> Self {
        Self::HostRoot
    }

    pub fn workspace() -> Self {
        Self::Workspace { subpath: None }
    }

    pub fn workspace_subpath(subpath: impl Into<String>) -> Self {
        Self::Workspace {
            subpath: Some(subpath.into()),
        }
    }

    pub fn absolute(path: impl Into<String>) -> Self {
        Self::Absolute { path: path.into() }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct FileSystemPermissionEntry {
    pub path: FileSystemPermissionPath,
    pub access: FileSystemAccess,
}

impl FileSystemPermissionEntry {
    pub fn new(path: FileSystemPermissionPath, access: FileSystemAccess) -> Self {
        Self { path, access }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Default)]
#[serde(deny_unknown_fields)]
pub struct ManagedFileSystemPermissions {
    #[serde(default)]
    pub entries: Vec<FileSystemPermissionEntry>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NetworkAccess {
    #[default]
    Restricted,
    Enabled,
}

/// Canonical permissions applied independently from tool-call approval.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "enforcement", rename_all = "snake_case")]
pub enum PermissionProfile {
    /// OpenAgent enforces the declared filesystem entries and will apply the
    /// network policy when it launches sandboxed child processes.
    Managed {
        file_system: ManagedFileSystemPermissions,
        #[serde(default)]
        network: NetworkAccess,
    },
    /// No OpenAgent filesystem or network confinement is requested.
    Disabled,
}

impl PermissionProfile {
    pub fn workspace_write() -> Self {
        Self::Managed {
            file_system: ManagedFileSystemPermissions {
                entries: vec![
                    FileSystemPermissionEntry::new(
                        FileSystemPermissionPath::host_root(),
                        FileSystemAccess::Read,
                    ),
                    FileSystemPermissionEntry::new(
                        FileSystemPermissionPath::workspace(),
                        FileSystemAccess::Write,
                    ),
                ],
            },
            network: NetworkAccess::Restricted,
        }
    }

    pub fn read_only() -> Self {
        Self::Managed {
            file_system: ManagedFileSystemPermissions {
                entries: vec![FileSystemPermissionEntry::new(
                    FileSystemPermissionPath::workspace(),
                    FileSystemAccess::Read,
                )],
            },
            network: NetworkAccess::Restricted,
        }
    }

    pub fn disabled() -> Self {
        Self::Disabled
    }
}

impl Default for PermissionProfile {
    fn default() -> Self {
        Self::workspace_write()
    }
}

#[cfg(test)]
mod tests {
    use super::{FileSystemAccess, NetworkAccess, PermissionProfile};

    #[test]
    fn workspace_write_is_the_managed_default() {
        assert_eq!(NetworkAccess::default(), NetworkAccess::Restricted);
        let PermissionProfile::Managed {
            file_system,
            network,
        } = PermissionProfile::default()
        else {
            panic!("default permissions should be managed");
        };

        assert_eq!(file_system.entries.len(), 2);
        assert_eq!(file_system.entries[0].access, FileSystemAccess::Read);
        assert_eq!(file_system.entries[1].access, FileSystemAccess::Write);
        assert_eq!(network, NetworkAccess::Restricted);
    }

    #[test]
    fn write_grants_read_but_read_does_not_grant_write() {
        assert!(FileSystemAccess::Write.permits(FileSystemAccess::Read));
        assert!(FileSystemAccess::Write.permits(FileSystemAccess::Write));
        assert!(!FileSystemAccess::Read.permits(FileSystemAccess::Write));
        assert!(!FileSystemAccess::Deny.permits(FileSystemAccess::Read));
    }
}
