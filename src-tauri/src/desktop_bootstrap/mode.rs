#[cfg(all(test, debug_assertions))]
use super::{persistence::parse_desktop_bootstrap_response, DesktopBootstrapStatus};
use super::{ExternalRuntimeLaunch, HostRuntimeBootstrap};
#[cfg(all(debug_assertions, feature = "embedded-runtime"))]
use openagent_app::bootstrap_development_runtime as bootstrap_product_runtime;
#[cfg(all(not(debug_assertions), feature = "embedded-runtime"))]
use openagent_app::bootstrap_runtime as bootstrap_product_runtime;
#[cfg(feature = "embedded-runtime")]
use openagent_runtime::RuntimeBootstrap;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DesktopRuntimeMode {
    External,
    #[cfg(feature = "embedded-runtime")]
    Embedded,
}

#[cfg(debug_assertions)]
fn parse_development_runtime_mode(value: Option<&str>) -> Result<DesktopRuntimeMode, String> {
    match value.map(str::trim) {
        None | Some("") | Some("external") => Ok(DesktopRuntimeMode::External),
        #[cfg(feature = "embedded-runtime")]
        Some("embedded") => Ok(DesktopRuntimeMode::Embedded),
        #[cfg(not(feature = "embedded-runtime"))]
        Some("embedded") => Err(
            "OPENAGENT_RUNTIME_MODE=embedded requires the embedded-runtime Cargo feature"
                .to_string(),
        ),
        Some(value) => Err(format!(
            "OPENAGENT_RUNTIME_MODE must be 'external' or 'embedded', got '{value}'"
        )),
    }
}

fn desktop_runtime_mode(agent_server: bool) -> anyhow::Result<DesktopRuntimeMode> {
    if agent_server {
        #[cfg(feature = "embedded-runtime")]
        return Ok(DesktopRuntimeMode::Embedded);
        #[cfg(not(feature = "embedded-runtime"))]
        anyhow::bail!("the legacy agent server requires the embedded-runtime Cargo feature");
    }

    #[cfg(debug_assertions)]
    {
        let value = match std::env::var("OPENAGENT_RUNTIME_MODE") {
            Ok(value) => Some(value),
            Err(std::env::VarError::NotPresent) => None,
            Err(std::env::VarError::NotUnicode(_)) => {
                anyhow::bail!("OPENAGENT_RUNTIME_MODE must contain Unicode text")
            }
        };
        parse_development_runtime_mode(value.as_deref()).map_err(anyhow::Error::msg)
    }

    #[cfg(not(debug_assertions))]
    Ok(DesktopRuntimeMode::External)
}

pub(crate) fn prepare_host_runtime(
    agent_server: bool,
    external_launch: Option<ExternalRuntimeLaunch>,
) -> anyhow::Result<HostRuntimeBootstrap> {
    match desktop_runtime_mode(agent_server)? {
        #[cfg(feature = "embedded-runtime")]
        DesktopRuntimeMode::Embedded => {
            let RuntimeBootstrap {
                initial_locale,
                runtime,
            } = bootstrap_product_runtime(agent_server)?;
            Ok(HostRuntimeBootstrap {
                initial_locale,
                data_dir: openagent_runtime::config::config_dir(),
                runtime: Some(runtime),
                external_launch: None,
            })
        }
        DesktopRuntimeMode::External => {
            let Some(launch) = external_launch else {
                let initial_locale = if crate::local_capabilities::system_locale()
                    .to_lowercase()
                    .starts_with("zh")
                {
                    "zh"
                } else {
                    "en"
                };
                return Ok(HostRuntimeBootstrap {
                    initial_locale: initial_locale.into(),
                    data_dir: super::persistence::selected_home()?,
                    #[cfg(feature = "embedded-runtime")]
                    runtime: None,
                    external_launch: None,
                });
            };
            Ok(HostRuntimeBootstrap {
                initial_locale: launch.initial_locale.clone(),
                data_dir: launch.openagent_home.clone(),
                #[cfg(feature = "embedded-runtime")]
                runtime: None,
                external_launch: Some(launch),
            })
        }
    }
}

#[cfg(all(test, debug_assertions))]
mod runtime_mode_tests {
    use super::{
        parse_desktop_bootstrap_response, parse_development_runtime_mode, DesktopBootstrapStatus,
        DesktopRuntimeMode,
    };

    #[test]
    fn development_desktop_defaults_to_external_runtime() {
        assert_eq!(
            parse_development_runtime_mode(None).unwrap(),
            DesktopRuntimeMode::External
        );
        assert_eq!(
            parse_development_runtime_mode(Some("external")).unwrap(),
            DesktopRuntimeMode::External
        );
    }

    #[test]
    fn embedded_runtime_requires_an_explicit_valid_mode() {
        #[cfg(feature = "embedded-runtime")]
        assert_eq!(
            parse_development_runtime_mode(Some("embedded")).unwrap(),
            DesktopRuntimeMode::Embedded
        );
        #[cfg(not(feature = "embedded-runtime"))]
        assert!(parse_development_runtime_mode(Some("embedded")).is_err());
        assert!(parse_development_runtime_mode(Some("fallback")).is_err());
    }

    #[test]
    fn parses_versioned_external_runtime_launch_inputs() {
        let response = parse_desktop_bootstrap_response(
            br#"{"schema_version":1,"status":"ready","launch":{"openagent_home":"/tmp/openagent","workspace":"/tmp","conversation_id":null,"message_id":null,"new_conversation":false,"initial_locale":"zh"}}"#,
        )
        .unwrap();
        let DesktopBootstrapStatus::Ready(launch) = response else {
            panic!("expected ready bootstrap status");
        };
        assert_eq!(
            launch.openagent_home,
            std::path::Path::new("/tmp/openagent")
        );
        assert_eq!(launch.initial_locale, "zh");
    }

    #[test]
    fn rejects_unknown_bootstrap_schema_versions() {
        let error =
            parse_desktop_bootstrap_response(br#"{"schema_version":2,"status":"no_transition"}"#)
                .err()
                .unwrap();
        assert!(error
            .to_string()
            .contains("Unsupported Runtime bootstrap schema version 2"));
    }
}
