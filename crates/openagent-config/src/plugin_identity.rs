//! Non-serialized launch identity carried by an MCP configuration.
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PluginProcessIdentity {
    plugin_id: String,
    package_root: PathBuf,
    data_root: PathBuf,
    declared_capabilities: Vec<String>,
}

impl PluginProcessIdentity {
    pub fn new(plugin_id: String, package_root: PathBuf, data_root: PathBuf) -> Self {
        Self {
            plugin_id,
            package_root,
            data_root,
            declared_capabilities: Vec::new(),
        }
    }

    /// Carry the package's own `capabilities` declarations into the resolution.
    ///
    /// They are diagnostics input only: the resolved policy never reads them, so
    /// a declaration can explain a failure but never avoid one.
    pub fn with_declared_capabilities(
        mut self,
        declared: impl IntoIterator<Item = String>,
    ) -> Self {
        self.declared_capabilities = declared.into_iter().collect();
        self
    }

    pub fn plugin_id(&self) -> &str {
        &self.plugin_id
    }

    /// Canonicalized package root established by the trusted loader.
    pub fn package_root(&self) -> &Path {
        &self.package_root
    }

    /// `<OPENAGENT_HOME>/plugin-data/<plugin>`, the plugin's own writable state.
    pub fn data_root(&self) -> &Path {
        &self.data_root
    }

    pub fn declared_capabilities(&self) -> &[String] {
        &self.declared_capabilities
    }
}
