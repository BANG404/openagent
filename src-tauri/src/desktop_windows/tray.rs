use super::{
    DESKTOP_TRAY_ID, DESKTOP_TRAY_QUIT_ID, DESKTOP_TRAY_SHOW_ID, DESKTOP_WINDOW_ACTIVATED_EVENT,
};
use crate::desktop_exit::request_desktop_quit;
use tauri::{Emitter, Manager};

pub(crate) fn single_instance_window_label(onboarding_visible: bool) -> &'static str {
    if onboarding_visible {
        "onboarding"
    } else {
        "main"
    }
}

#[cfg(desktop)]
pub(crate) fn show_desktop_window(app: &tauri::AppHandle) {
    let onboarding_visible = app
        .get_webview_window("onboarding")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    if let Some(window) = app.get_webview_window(single_instance_window_label(onboarding_visible)) {
        let _ = window.unminimize();
        let _ = window.show();
        if window.set_focus().is_ok() {
            let _ = window.emit(DESKTOP_WINDOW_ACTIVATED_EVENT, ());
        }
    }
}

#[cfg(desktop)]
pub(crate) fn install_desktop_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::MenuBuilder;
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let menu = MenuBuilder::new(app)
        .text(DESKTOP_TRAY_SHOW_ID, "Show OpenAgent")
        .text(DESKTOP_TRAY_QUIT_ID, "Quit")
        .build()?;
    let mut tray = TrayIconBuilder::with_id(DESKTOP_TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("OpenAgent")
        .on_tray_icon_event(|tray, event| {
            let primary_activation = matches!(
                event,
                TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                } | TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            );
            if primary_activation {
                show_desktop_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
}

#[cfg(desktop)]
pub(crate) fn handle_desktop_menu_event(app: &tauri::AppHandle, event: &tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        DESKTOP_TRAY_SHOW_ID => show_desktop_window(app),
        DESKTOP_TRAY_QUIT_ID => request_desktop_quit(app.clone()),
        _ => {}
    }
}
