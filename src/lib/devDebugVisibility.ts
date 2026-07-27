export const DEV_MAIN_DEBUG_VISIBILITY_EVENT = "dev-main-debug-visibility-changed";

const STORAGE_KEY = "openagent.dev.main-debug-components-visible";

export function readMainDebugComponentsVisible(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
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
