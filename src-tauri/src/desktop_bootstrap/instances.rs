pub(crate) fn is_development_multi_instance() -> bool {
    cfg!(debug_assertions)
        && std::env::var_os("OPENAGENT_DEV_MULTI_INSTANCE").is_some_and(|value| !value.is_empty())
}

pub(crate) fn should_enforce_single_instance(
    agent_server: bool,
    is_workspace_window: bool,
    development_multi_instance: bool,
) -> bool {
    !agent_server && !is_workspace_window && !development_multi_instance
}

pub(crate) fn should_install_desktop_tray(
    agent_server: bool,
    is_workspace_window: bool,
    development_multi_instance: bool,
) -> bool {
    !agent_server && !is_workspace_window && !development_multi_instance
}

pub(crate) fn should_install_desktop_integrations(
    agent_server: bool,
    development_multi_instance: bool,
) -> bool {
    !agent_server && !development_multi_instance
}

pub(crate) fn should_reveal_workspace_shell_early(
    agent_server: bool,
    _is_workspace_window: bool,
) -> bool {
    // The primary release window also owns a layout-stable loading shell. Show
    // it before the Runtime reads durable conversation state so a large
    // database cannot make the application appear not to have started.
    !agent_server
}

pub(crate) fn should_start_primary_desktop_services(
    agent_server: bool,
    is_workspace_window: bool,
    development_multi_instance: bool,
) -> bool {
    !agent_server && !is_workspace_window && !development_multi_instance
}

pub(crate) fn development_instance_identifier(instance_name: Option<&str>) -> String {
    let instance_name = instance_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("instance");
    let normalized: String = instance_name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '-'
            }
        })
        .collect();
    let normalized = normalized.trim_matches('-');
    format!(
        "com.iumm.openagent.dev.{}",
        if normalized.is_empty() {
            "instance"
        } else {
            normalized
        }
    )
}

#[cfg(test)]
mod single_instance_tests {
    use super::{
        development_instance_identifier, should_enforce_single_instance,
        should_install_desktop_integrations, should_install_desktop_tray,
        should_reveal_workspace_shell_early, should_start_primary_desktop_services,
    };
    use crate::desktop_windows::{
        should_restore_utility_window_state, single_instance_window_label,
    };

    #[test]
    fn only_regular_desktop_launches_share_the_primary_instance() {
        assert!(should_enforce_single_instance(false, false, false));
        assert!(!should_enforce_single_instance(false, false, true));
        assert!(!should_enforce_single_instance(false, true, false));
        assert!(!should_enforce_single_instance(true, false, false));
    }

    #[test]
    fn only_the_primary_desktop_process_owns_the_tray() {
        assert!(should_install_desktop_tray(false, false, false));
        assert!(!should_install_desktop_tray(false, false, true));
        assert!(!should_install_desktop_tray(false, true, false));
        assert!(!should_install_desktop_tray(true, false, false));
    }

    #[test]
    fn multi_instance_mode_does_not_register_global_desktop_integrations() {
        assert!(should_install_desktop_integrations(false, false));
        assert!(!should_install_desktop_integrations(false, true));
        assert!(!should_install_desktop_integrations(true, false));
    }

    #[test]
    fn desktop_windows_reveal_the_loading_shell_early() {
        assert!(should_reveal_workspace_shell_early(false, false));
        assert!(should_reveal_workspace_shell_early(false, true));
        assert!(!should_reveal_workspace_shell_early(true, true));
    }

    #[test]
    fn repeated_launch_restores_main_when_onboarding_is_hidden() {
        assert_eq!(single_instance_window_label(false), "main");
        assert_eq!(single_instance_window_label(true), "onboarding");
    }

    #[test]
    fn multi_instance_runtime_does_not_start_primary_desktop_services() {
        assert!(should_start_primary_desktop_services(false, false, false));
        assert!(!should_start_primary_desktop_services(false, false, true));
        assert!(!should_start_primary_desktop_services(false, true, false));
        assert!(!should_start_primary_desktop_services(true, false, false));
    }

    #[test]
    fn multi_instance_mode_does_not_restore_shared_utility_geometry() {
        assert!(should_restore_utility_window_state(false, false));
        assert!(!should_restore_utility_window_state(false, true));
        assert!(!should_restore_utility_window_state(true, false));
    }

    #[test]
    fn development_instance_names_are_scoped_to_the_pilot_identifier() {
        assert_eq!(
            development_instance_identifier(Some("agent-a")),
            "com.iumm.openagent.dev.agent-a"
        );
        assert_eq!(
            development_instance_identifier(Some("agent/a")),
            "com.iumm.openagent.dev.agent-a"
        );
        assert_eq!(
            development_instance_identifier(Some("  ")),
            "com.iumm.openagent.dev.instance"
        );
    }
}
