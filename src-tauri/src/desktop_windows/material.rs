pub(crate) fn apply_native_window_material(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        if let Err(mica_error) = window_vibrancy::apply_mica(window, None) {
            tracing::debug!(%mica_error, "Mica unavailable; trying Acrylic window material");
            if let Err(acrylic_error) = window_vibrancy::apply_acrylic(window, None) {
                tracing::debug!(%acrylic_error, "Acrylic unavailable; trying Blur window material");
                if let Err(blur_error) = window_vibrancy::apply_blur(window, None) {
                    tracing::warn!(
                        %mica_error,
                        %acrylic_error,
                        %blur_error,
                        window = window.label(),
                        "Native Windows material is unavailable"
                    );
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    if let Err(error) = window_vibrancy::apply_vibrancy(
        window,
        window_vibrancy::NSVisualEffectMaterial::UnderWindowBackground,
        Some(window_vibrancy::NSVisualEffectState::FollowsWindowActiveState),
        None,
    ) {
        tracing::warn!(%error, window = window.label(), "Native macOS vibrancy is unavailable");
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let _ = window;
}
