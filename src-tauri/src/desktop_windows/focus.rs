#[cfg(windows)]
fn foreground_belongs_to_desktop_window(
    shares_root_owner: bool,
    foreground_process_id: Option<u32>,
    current_process_id: u32,
) -> bool {
    shares_root_owner || foreground_process_id == Some(current_process_id)
}

#[cfg(windows)]
fn desktop_window_is_active(window: &tauri::WebviewWindow) -> Result<bool, String> {
    use windows::Win32::UI::WindowsAndMessaging::{GetAncestor, GA_ROOTOWNER};
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    let foreground_window = unsafe { GetForegroundWindow() };
    if foreground_window.0.is_null() {
        return Ok(false);
    }

    let desktop_window = window.hwnd().map_err(|error| error.to_string())?;
    let foreground_root_owner = unsafe { GetAncestor(foreground_window, GA_ROOTOWNER) };
    let desktop_root_owner = unsafe { GetAncestor(desktop_window, GA_ROOTOWNER) };
    let shares_root_owner = !foreground_root_owner.0.is_null()
        && !desktop_root_owner.0.is_null()
        && foreground_root_owner == desktop_root_owner;

    let mut foreground_process_id = 0;
    unsafe {
        GetWindowThreadProcessId(foreground_window, Some(&mut foreground_process_id));
    }
    Ok(foreground_belongs_to_desktop_window(
        shares_root_owner,
        Some(foreground_process_id),
        std::process::id(),
    ))
}

#[tauri::command]
pub(crate) fn is_desktop_window_active(window: tauri::WebviewWindow) -> Result<bool, String> {
    #[cfg(windows)]
    {
        // WebView2 may activate a child HWND, including one hosted by its own
        // subprocess. Resolve both handles through their root-owner chain first;
        // same-process ownership also covers native dialogs owned by this app.
        desktop_window_is_active(&window)
    }

    #[cfg(not(windows))]
    {
        window.is_focused().map_err(|error| error.to_string())
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn foreground_activity_accepts_the_window_tree_or_current_process() {
        assert!(foreground_belongs_to_desktop_window(true, Some(7), 42));
        assert!(foreground_belongs_to_desktop_window(false, Some(42), 42));
        assert!(!foreground_belongs_to_desktop_window(false, Some(7), 42));
        assert!(!foreground_belongs_to_desktop_window(false, None, 42));
    }
}
