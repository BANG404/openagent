export const DEV_MAIN_DEBUG_VISIBILITY_EVENT = "dev-main-debug-visibility-changed";

// Keep the existing key so development profiles retain their current setting.
// The same preference is intentionally available to production builds through
// Help -> Debug mode.
const STORAGE_KEY = "openagent.dev.main-debug-components-visible";

export function readMainDebugComponentsVisible(defaultVisible = true): boolean {
  if (typeof window === "undefined") return defaultVisible;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? defaultVisible : stored !== "false";
  } catch {
    return defaultVisible;
  }
}

export function writeMainDebugComponentsVisible(visible: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(visible));
  } catch {
    // Development webviews may disable storage; the Tauri event still applies
    // the setting to the currently running main window.
  }
}
