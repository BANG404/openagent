use crate::frontend_resource::{self, FrontendResourceManager, FrontendResourceSource};
use crate::runtime_process::DESKTOP_RUNTIME_PROTOCOL_VERSION;
use crate::runtime_resource::{RuntimeResourceManager, RuntimeResourceSource};

pub(crate) const UPDATE_PUBLIC_KEY: &str = "untrusted comment: minisign public key: C373284FCF9656A0\nRWSgVpbPTyhzw46ILL4vBbjg4XueHFxKhTk48DCGqAT/IfE5vSyBDSGl\n";

pub(crate) fn update_public_key() -> String {
    #[cfg(debug_assertions)]
    if std::env::var("OPENAGENT_BOOTSTRAP_TEST").is_ok_and(|value| value == "1") {
        if let Ok(path) = std::env::var("OPENAGENT_BOOTSTRAP_TEST_KEY") {
            if let Ok(key) = std::fs::read_to_string(path) {
                return key;
            }
        }
    }
    UPDATE_PUBLIC_KEY.to_string()
}

pub(crate) fn modular_update_channel() -> &'static str {
    let version = env!("CARGO_PKG_VERSION");
    if version.contains("-rc.") {
        "rc"
    } else if version.contains('-') {
        "beta"
    } else {
        "stable"
    }
}

pub(crate) fn runtime_resource_manager(
    openagent_home: std::path::PathBuf,
) -> RuntimeResourceManager {
    let manifest_url = format!(
        "https://github.com/BANG404/openagent/releases/download/runtime-{}/openagent-sdk-manifest.json",
        modular_update_channel()
    );
    RuntimeResourceManager::new(
        openagent_home,
        RuntimeResourceSource {
            signature_url: format!("{manifest_url}.sig"),
            manifest_url,
            public_key: update_public_key(),
        },
        DESKTOP_RUNTIME_PROTOCOL_VERSION,
    )
}

pub(crate) fn frontend_resource_manager(
    openagent_home: std::path::PathBuf,
) -> Result<FrontendResourceManager, String> {
    let manifest_url = format!(
        "https://github.com/BANG404/openagent/releases/download/frontend-{}/openagent-frontend-manifest.json",
        modular_update_channel()
    );
    FrontendResourceManager::new(
        openagent_home,
        FrontendResourceSource {
            signature_url: format!("{manifest_url}.sig"),
            manifest_url,
            public_key: update_public_key(),
        },
        if cfg!(debug_assertions)
            && !std::env::var("OPENAGENT_BOOTSTRAP_TEST").is_ok_and(|value| value == "1")
        {
            env!("CARGO_PKG_VERSION")
        } else {
            "0.0.0"
        },
        frontend_resource::FRONTEND_HOST_PROTOCOL_VERSION,
        DESKTOP_RUNTIME_PROTOCOL_VERSION,
    )
}
