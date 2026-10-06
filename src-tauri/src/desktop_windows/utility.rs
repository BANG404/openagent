use super::geometry::{
    constrain_role_editor_size, position_utility_window, restore_utility_window_state,
};
use super::material::apply_native_window_material;
use crate::component_updates::product_webview_url;
use crate::frontend_resource::FrontendResourceManager;
use tauri::{Emitter, Manager, State};

struct SettingsWindowSpec {
    label: &'static str,
    title: &'static str,
    default_section: &'static str,
    sections: &'static [&'static str],
    initial_width: f64,
    initial_height: f64,
}

fn settings_window_spec(kind: &str) -> Option<SettingsWindowSpec> {
    match kind {
        "general" => Some(SettingsWindowSpec {
            label: "settings-general",
            title: "OpenAgent Settings",
            default_section: "general",
            sections: &["general"],
            initial_width: 920.0,
            initial_height: 680.0,
        }),
        "models" => Some(SettingsWindowSpec {
            label: "settings-models",
            title: "OpenAgent Models",
            default_section: "providers",
            sections: &["providers", "defaults"],
            initial_width: 980.0,
            initial_height: 680.0,
        }),
        "agent" => Some(SettingsWindowSpec {
            label: "settings-agent",
            title: "OpenAgent Agent Configuration",
            default_section: "execution",
            sections: &["execution", "agents"],
            initial_width: 920.0,
            initial_height: 680.0,
        }),
        "integrations" => Some(SettingsWindowSpec {
            label: "settings-integrations",
            title: "OpenAgent Integrations",
            default_section: "channels",
            sections: &["channels", "extensions", "plugins"],
            initial_width: 980.0,
            initial_height: 680.0,
        }),
        "memory" => Some(SettingsWindowSpec {
            label: "settings-memory",
            title: "OpenAgent Memory",
            default_section: "memory",
            sections: &["memory"],
            initial_width: 780.0,
            initial_height: 560.0,
        }),
        "about" => Some(SettingsWindowSpec {
            label: "settings-about",
            title: "About OpenAgent",
            default_section: "about",
            sections: &["about"],
            initial_width: 680.0,
            initial_height: 400.0,
        }),
        _ => None,
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RoleEditorRequest {
    role_id: Option<String>,
    requester_label: String,
}

#[tauri::command]
pub(crate) async fn open_role_editor_window(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    manager: State<'_, FrontendResourceManager>,
    role_id: Option<String>,
) -> Result<(), String> {
    let request = RoleEditorRequest {
        role_id,
        requester_label: window.label().to_string(),
    };
    if let Some(editor) = app.get_webview_window("role-editor") {
        editor
            .emit("role-editor-requested", &request)
            .map_err(|error| error.to_string())?;
        constrain_role_editor_size(&editor)?;
        editor.unminimize().map_err(|error| error.to_string())?;
        editor.show().map_err(|error| error.to_string())?;
        return editor.set_focus().map_err(|error| error.to_string());
    }

    let role_id = request.role_id.as_deref().unwrap_or_default();
    let role_id =
        percent_encoding::utf8_percent_encode(role_id, percent_encoding::NON_ALPHANUMERIC);
    let requester = percent_encoding::utf8_percent_encode(
        &request.requester_label,
        percent_encoding::NON_ALPHANUMERIC,
    );
    let query = format!("?role-editor-window=1&role-id={role_id}&requester-label={requester}");
    let (initial_width, initial_height, max_width, max_height) = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .map(|monitor| {
            let scale = monitor.scale_factor();
            let width = monitor.size().width as f64 / scale;
            let height = monitor.size().height as f64 / scale;
            (
                920.0_f64.min((width - 32.0).max(760.0)),
                600.0_f64.min((height - 48.0).max(440.0)),
                (width - 16.0).max(760.0),
                (height - 24.0).max(440.0),
            )
        })
        .unwrap_or((920.0, 600.0, 1040.0, 680.0));
    let editor = tauri::WebviewWindowBuilder::new(
        &app,
        "role-editor",
        product_webview_url(&manager, &query)?,
    )
    .title("OpenAgent Role")
    // Keep the editor within a compact laptop work area while leaving enough
    // room for the two-column resource browser. Each column scrolls on its own
    // when the work area cannot fit the full form.
    .inner_size(initial_width, initial_height)
    .max_inner_size(max_width, max_height)
    .min_inner_size(760.0, 440.0)
    .transparent(!cfg!(target_os = "linux"))
    // Keep the utility window hidden until its requester-relative fallback
    // and any persisted geometry have both been applied. Showing it during
    // construction would expose the subsequent position changes as a jump.
    .visible(false)
    .build()
    .map_err(|error| error.to_string())?;
    position_utility_window(&window, &editor)?;
    restore_utility_window_state(&editor)?;
    constrain_role_editor_size(&editor)?;
    apply_native_window_material(&editor);
    editor.show().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn open_settings_window(
    app: tauri::AppHandle,
    parent: tauri::WebviewWindow,
    manager: State<'_, FrontendResourceManager>,
    kind: String,
    section: Option<String>,
) -> Result<(), String> {
    let spec = settings_window_spec(&kind)
        .ok_or_else(|| format!("Unknown settings window kind: {kind}"))?;
    let section = section
        .filter(|value| spec.sections.contains(&value.as_str()))
        .unwrap_or_else(|| spec.default_section.to_string());

    if let Some(window) = app.get_webview_window(spec.label) {
        window
            .emit("settings-section-requested", &section)
            .map_err(|error| error.to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        return window.set_focus().map_err(|error| error.to_string());
    }

    let query = format!("?settings-window={kind}&settings-section={section}");
    let window =
        tauri::WebviewWindowBuilder::new(&app, spec.label, product_webview_url(&manager, &query)?)
            .title(spec.title)
            .inner_size(spec.initial_width, spec.initial_height)
            .min_inner_size(640.0, 400.0)
            .transparent(!cfg!(target_os = "linux"))
            // Apply both placement steps while hidden so opening from the
            // application menu produces a single stable location.
            .visible(false)
            .build()
            .map_err(|error| error.to_string())?;
    position_utility_window(&parent, &window)?;
    restore_utility_window_state(&window)?;
    apply_native_window_material(&window);
    window.show().map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settings_window_kinds_use_fixed_labels_and_sections() {
        let general = settings_window_spec("general").expect("general settings window");
        assert_eq!(general.label, "settings-general");
        assert_eq!(general.sections, &["general"]);

        let models = settings_window_spec("models").expect("models window");
        assert_eq!(models.label, "settings-models");
        assert_eq!(models.default_section, "providers");
        assert_eq!(
            (models.initial_width, models.initial_height),
            (980.0, 680.0)
        );
        assert!(models.sections.contains(&"defaults"));

        let integrations = settings_window_spec("integrations").expect("integrations window");
        assert_eq!(integrations.label, "settings-integrations");
        assert!(integrations.sections.contains(&"channels"));
        assert!(integrations.sections.contains(&"extensions"));
        assert!(integrations.sections.contains(&"plugins"));
        let about = settings_window_spec("about").expect("about window");
        assert_eq!((about.initial_width, about.initial_height), (680.0, 400.0));
        assert!(settings_window_spec("arbitrary").is_none());
        assert!(settings_window_spec("automation").is_none());
    }
}
