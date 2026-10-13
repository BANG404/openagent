//! Native desktop window presentation and utility-window adapters.
pub(crate) mod focus;
mod geometry;
mod material;
#[cfg(desktop)]
mod tray;
pub(crate) mod utility;
use crate::desktop_exit::DesktopWindowState;
#[cfg(test)]
pub(crate) use geometry::should_restore_utility_window_state;
pub(crate) use material::apply_native_window_material;
use tauri::{Emitter, Manager, State};
#[cfg(all(desktop, test))]
pub(crate) use tray::single_instance_window_label;
#[cfg(desktop)]
pub(crate) use tray::{handle_desktop_menu_event, install_desktop_tray, show_desktop_window};

pub(crate) const DESKTOP_WINDOW_ACTIVATED_EVENT: &str = "desktop-window-activated";
#[cfg(desktop)]
pub(crate) const DESKTOP_TRAY_ID: &str = "openagent-tray";
#[cfg(desktop)]
pub(crate) const DESKTOP_TRAY_SHOW_ID: &str = "openagent-tray-show";
#[cfg(desktop)]
pub(crate) const DESKTOP_TRAY_QUIT_ID: &str = "openagent-tray-quit";
fn show_onboarding_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("onboarding")
        .ok_or_else(|| "Onboarding window is unavailable".to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn reveal_onboarding_window(
    app: tauri::AppHandle,
    windows: State<'_, DesktopWindowState>,
    preview: Option<bool>,
) -> Result<(), String> {
    if preview == Some(true) {
        #[cfg(not(debug_assertions))]
        return Err("Onboarding preview is only available in development".to_string());
        #[cfg(debug_assertions)]
        {
            let window = app
                .get_webview_window("onboarding")
                .ok_or_else(|| "Onboarding window is unavailable".to_string())?;
            let mut url = window.url().map_err(|error| error.to_string())?;
            let mut query: Vec<(String, String)> = url
                .query_pairs()
                .into_owned()
                .filter(|(key, _)| key != "onboarding-preview")
                .collect();
            query.push(("onboarding-preview".to_string(), "1".to_string()));
            url.query_pairs_mut().clear().extend_pairs(query);
            window.navigate(url).map_err(|error| error.to_string())?;
        }
    }
    show_onboarding_window(&app)?;
    windows
        .startup_window_revealed
        .store(true, std::sync::atomic::Ordering::Release);
    Ok(())
}

#[tauri::command]
pub(crate) fn reveal_main_window(
    app: tauri::AppHandle,
    windows: State<'_, DesktopWindowState>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    windows
        .startup_window_revealed
        .store(true, std::sync::atomic::Ordering::Release);
    window.set_focus().map_err(|error| error.to_string())?;
    window
        .emit(DESKTOP_WINDOW_ACTIVATED_EVENT, ())
        .map_err(|error| error.to_string())
}

#[cfg(debug_assertions)]
pub(crate) mod inspector;
pub(crate) mod startup;
