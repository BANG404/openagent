use crate::desktop_bootstrap::instances::is_development_multi_instance;
use crate::workspace_process::is_workspace_window_process;
use tauri::{LogicalSize, PhysicalPosition, Size};

/// Place a utility window centered over the window that requested it.
///
/// Window positions and outer sizes are physical pixels, so doing this after
/// construction also keeps the calculation correct on mixed-DPI monitors.
pub(crate) fn position_utility_window(
    parent: &tauri::WebviewWindow,
    child: &tauri::WebviewWindow,
) -> Result<(), String> {
    let parent_position = parent.outer_position().map_err(|error| error.to_string())?;
    let parent_size = parent.outer_size().map_err(|error| error.to_string())?;
    let child_size = child.outer_size().map_err(|error| error.to_string())?;
    let x = parent_position.x + (parent_size.width as i32 - child_size.width as i32) / 2;
    let y = parent_position.y + (parent_size.height as i32 - child_size.height as i32) / 2;
    child
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())
}

/// Apply a saved utility-window geometry after its first-open placement.
///
/// The window-state plugin restores pre-created windows from its `on_window_ready`
/// hook. Utility windows are created on demand, so they opt out of that automatic
/// restore and apply the saved state after the requester-relative fallback has
/// been calculated. With no saved state, `restore_state` records the fallback
/// geometry and leaves the window where it was placed.
pub(crate) fn restore_utility_window_state(window: &tauri::WebviewWindow) -> Result<(), String> {
    if !should_restore_utility_window_state(
        is_workspace_window_process(),
        is_development_multi_instance(),
    ) {
        return Ok(());
    }
    use tauri_plugin_window_state::{StateFlags, WindowExt};
    window
        .restore_state(StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED)
        .map_err(|error| error.to_string())
}

pub(crate) fn should_restore_utility_window_state(
    is_workspace_window: bool,
    development_multi_instance: bool,
) -> bool {
    !is_workspace_window && !development_multi_instance
}

/// Clamp restored utility geometry to the current monitor's logical work area.
/// The window-state plugin can restore a size created on a larger or differently
/// scaled display, so the builder's limits alone are not sufficient.
pub(crate) fn constrain_role_editor_size(window: &tauri::WebviewWindow) -> Result<(), String> {
    let Some(monitor) = window
        .current_monitor()
        .map_err(|error| error.to_string())?
    else {
        return Ok(());
    };
    let scale = monitor.scale_factor();
    let max_width = (monitor.size().width as f64 / scale - 32.0).max(760.0);
    let max_height = (monitor.size().height as f64 / scale - 48.0).max(440.0);
    let current = window.inner_size().map_err(|error| error.to_string())?;
    let width = (current.width as f64 / scale).min(max_width).max(760.0);
    let height = (current.height as f64 / scale).min(max_height).max(440.0);
    if width < current.width as f64 / scale || height < current.height as f64 / scale {
        window
            .set_size(Size::Logical(LogicalSize::new(width, height)))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}
