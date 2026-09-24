use super::ScreenshotError;

/// Capture a Tauri `WebviewWindow` via the `WKWebView` `takeSnapshot:` path.
///
/// Scaffolded for a follow-up milestone — the `objc2-web-kit` wiring is not in
/// this release, so the macOS arm currently returns a `CaptureFailed` with a
/// descriptive message. Callers that want a working capture should select the
/// `screencapture` or `CGWindowList` backends.
///
/// # Errors
///
/// Returns [`ScreenshotError::CaptureFailed`] on macOS until the `WKWebView`
/// path is wired in a follow-up milestone.
#[allow(dead_code, reason = "wired in the WkWebView milestone")]
pub(crate) fn capture_wkwebview_png<R: tauri::Runtime>(
    _window: &tauri::WebviewWindow<R>,
) -> Result<Vec<u8>, ScreenshotError> {
    Err(ScreenshotError::CaptureFailed {
        message: "WKWebView takeSnapshot backend is not wired in this milestone".to_owned(),
    })
}
