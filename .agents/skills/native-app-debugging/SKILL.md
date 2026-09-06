---
name: native-app-debugging
description: Drive and inspect the OpenAgent Tauri desktop app through its native debug surface, including tauri-pilot and Windows Appium UI Automation.
metadata:
  category: debugging
---

# Native app debugging

Use this skill when a problem or acceptance criterion depends on the real
desktop window, native focus, window geometry, native dialogs, or the
accessibility/UI Automation tree. This is separate from browser automation.

## Tool selection

- Use `tauri-pilot` to drive the debug Tauri application and inspect its WebView
  DOM and runtime logs.
- On Windows, pair the app with an Appium server and the UI
  Automation-compatible DesktopDriver to inspect the native tree, window
  handle, bounds, and native screenshots.
- Use `playwright` only for browser-verifiable WebView behavior; it cannot
  replace native-window verification.

## Safety and routing

- Use an isolated temporary `OPENAGENT_HOME` and identify the target process
  and window explicitly.
- Keep generated screenshots and logs in the system temporary directory.
- Read [native-verification.md](../openagent-desktop-host/references/native-verification.md)
  for the complete verification procedure.
- For host implementation changes, also read
  `openagent-desktop-host`; this skill owns execution and observation of the
  debug app, not Tauri product architecture.
