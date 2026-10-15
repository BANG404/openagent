use super::{ExternalRuntimeLaunch, HostRuntimeBootstrap};

pub(crate) fn prepare_host_runtime(
    external_launch: Option<ExternalRuntimeLaunch>,
) -> anyhow::Result<HostRuntimeBootstrap> {
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
            external_launch: None,
        });
    };
    Ok(HostRuntimeBootstrap {
        initial_locale: launch.initial_locale.clone(),
        data_dir: launch.openagent_home.clone(),
        external_launch: Some(launch),
    })
}

#[cfg(test)]
mod tests {
    use super::super::{persistence::parse_desktop_bootstrap_response, DesktopBootstrapStatus};

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
